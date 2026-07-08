import os
from dotenv import load_dotenv
load_dotenv()
import asyncio
import base64
import json
import logging
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

import requests
from cryptography.fernet import Fernet, InvalidToken
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# =========================
# CONFIG
# =========================

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set. Add it to environment variables.")
CHECK_INTERVAL_SECONDS = 300  # 5 minutes
# After this many consecutive invalid-token/slot rejections we stop the silent
# re-login retry loop and tell the user to re-authorize.
AUTH_FAIL_CAP = 3

API_BASE = "https://www.hospitalaleman.com/tuportal/api"
URL_LOGIN = f"{API_BASE}/auth/login"
URL_REFERENCIAS = f"{API_BASE}/referencias/agenda/datosProfesionalEspecialidad"
URL_TURNOS = f"{API_BASE}/turnos/turnosDisponiblesMes"
URL_PERFIL_DNI = f"{API_BASE}/usuarios/perfiles/dni/{{nrodoc}}"
URL_MENORES = f"{API_BASE}/usuarios/perfiles/socios/{{nrosoc}}/credenciales/{{credencial}}/menoresAutorizados"

# Telegram silently clips an inline keyboard at 100 buttons, so every list view
# stays comfortably below that with paging + search.
CHOICE_PAGE_SIZE = 80

HEADERS_BASE = {
    "sec-ch-ua-platform": '"macOS"',
    "Referer": "https://www.hospitalaleman.com/tuportal/app/reservarTurno",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "Application": "portal-tyt",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ha_bot")

# Optional encrypted on-disk persistence (feature 005). Enabled only when
# HA_CRED_KEY holds a valid Fernet key; otherwise the bot runs in-memory only
# (identical to pre-005 behavior). The key material and file contents are never
# logged.
HA_CRED_KEY = os.environ.get("HA_CRED_KEY", "").strip()
HA_STATE_PATH = os.environ.get("HA_STATE_PATH", "ha_state.enc").strip() or "ha_state.enc"


def _init_state_cipher() -> Optional[Fernet]:
    if not HA_CRED_KEY:
        log.info("[STATE] HA_CRED_KEY not set — persistence disabled (in-memory only)")
        return None
    try:
        cipher = Fernet(HA_CRED_KEY.encode("utf-8"))
    except Exception:
        log.warning("[STATE] HA_CRED_KEY is not a valid Fernet key — persistence disabled (in-memory only)")
        return None
    log.info("[STATE] encrypted persistence enabled")
    return cipher


FERNET: Optional[Fernet] = _init_state_cipher()


# =========================
# STATE MODELS
# =========================

@dataclass
class Task:
    task_id: str
    especialidad: str
    agenda_nombre: str
    cod_acme: str
    cod_instancia: int
    month: int
    year: int
    # Snapshot the selected patient at task creation so later re-auth or patient
    # switches do not silently move existing monitors.
    paciente: int
    plan: int = 94
    notified: set = field(default_factory=set)  # keys like "<agendaNombre> 02-MAR-26 10:00"
    active: bool = True
    auth_fail_count: int = 0

    # for Todos: if not None, monitor any agendaNombre in this list (by fuzzy match)
    agenda_nombres: Optional[List[str]] = None


@dataclass
class WizardState:
    step: str  # "specialty" -> "doctor" -> "month"
    referencias: List[Dict[str, Any]] = field(default_factory=list)
    selected_especialidad: Optional[str] = None
    selected_descripcion: Optional[str] = None
    selected_cod_acme: Optional[str] = None
    selected_cod_instancia: Optional[int] = None
    history: List[Tuple[str, Dict[str, Any]]] = field(default_factory=list)  # for "Back"

    # store option lists and pass only indexes in callback_data
    spec_list: List[str] = field(default_factory=list)
    doc_list: List[str] = field(default_factory=list)

    # current text filter for each searchable step ("" = show everything)
    spec_query: str = ""
    doc_query: str = ""


@dataclass
class UserState:
    # paciente is the INTERNAL patient id the slot API expects (from the token's
    # `ps` claim), chosen by name — never typed by the user.
    paciente: Optional[int] = None
    plan: int = 94
    token: Optional[str] = None
    # Stored portal credentials for automatic token refresh. Held in memory and,
    # when HA_CRED_KEY is set, persisted encrypted at rest via the Fernet state
    # blob (feature 005); memory-only otherwise. Never logged. Unlike the access
    # token — which is never persisted and is re-derived via ensure_token — these
    # are written to disk (encrypted) so login survives a restart.
    usuario: Optional[str] = None
    password: Optional[str] = None
    awaiting: Optional[str] = None  # "usuario" | "password" | "token"
    # Legacy user-level counter; per-monitor retry state lives on Task.
    auth_fail_count: int = 0
    # transient patient choices awaiting selection [{nombre, paciente, plan}]
    pending_patients: Optional[List[Dict[str, Any]]] = None
    wizard: Optional[WizardState] = None
    tasks: Dict[str, Task] = field(default_factory=dict)


USERS: Dict[int, UserState] = {}


def get_user(uid: int) -> UserState:
    if uid not in USERS:
        USERS[uid] = UserState()
    return USERS[uid]


def has_auth(user: UserState) -> bool:
    return bool(user.token) or bool(user.usuario and user.password)


# =========================
# PERSISTENCE (encrypted state at rest — feature 005)
# =========================
#
# The whole state record (credentials + paciente + active tasks) is serialized to
# JSON and encrypted as one Fernet blob, so usuario/password are never on disk in
# plaintext and the paciente/task data are protected at rest too. The access token
# is intentionally NOT persisted: it is re-derived via ensure_token() on the next
# poll from the stored credentials, keeping the shortest-lived secret ephemeral.

STATE_VERSION = 1


def _task_to_dict(t: Task) -> Dict[str, Any]:
    return {
        "task_id": t.task_id,
        "especialidad": t.especialidad,
        "agenda_nombre": t.agenda_nombre,
        "cod_acme": t.cod_acme,
        "cod_instancia": t.cod_instancia,
        "month": t.month,
        "year": t.year,
        "paciente": t.paciente,
        "plan": t.plan,
        # `notified` is a set (not JSON-serializable); store as a sorted list.
        "notified": sorted(t.notified),
        "active": t.active,
        "agenda_nombres": t.agenda_nombres,
    }


def _task_from_dict(d: Dict[str, Any]) -> Task:
    return Task(
        task_id=str(d["task_id"]),
        especialidad=d.get("especialidad", ""),
        agenda_nombre=d.get("agenda_nombre", ""),
        cod_acme=str(d.get("cod_acme", "")),
        cod_instancia=int(d.get("cod_instancia", 0)),
        month=int(d["month"]),
        year=int(d["year"]),
        paciente=int(d["paciente"]),
        plan=int(d.get("plan", 94)),
        notified=set(d.get("notified") or []),
        active=bool(d.get("active", True)),
        agenda_nombres=d.get("agenda_nombres"),
    )


def serialize_users() -> Dict[str, Any]:
    """Snapshot durable per-user state. Only active tasks are persisted; the
    token, wizard, awaiting, and pending_patients are transient and dropped."""
    users: Dict[str, Any] = {}
    for uid, user in USERS.items():
        active_tasks = [t for t in user.tasks.values() if t.active]
        has_creds = bool(user.usuario and user.password)
        if not (has_creds or user.paciente is not None or active_tasks):
            continue
        users[str(uid)] = {
            "paciente": user.paciente,
            "plan": user.plan,
            "usuario": user.usuario,
            "password": user.password,
            "tasks": [_task_to_dict(t) for t in active_tasks],
        }
    return {"version": STATE_VERSION, "users": users}


def save_state() -> None:
    """Encrypt and atomically write the current state. No-op without a key."""
    if FERNET is None:
        return
    try:
        blob = json.dumps(serialize_users(), ensure_ascii=False).encode("utf-8")
        token = FERNET.encrypt(blob)
        tmp = f"{HA_STATE_PATH}.tmp"
        with open(tmp, "wb") as f:
            f.write(token)
        os.chmod(tmp, 0o600)
        os.replace(tmp, HA_STATE_PATH)
    except Exception as e:
        # Never surface state contents; a failed save must not crash the bot.
        log.warning("[STATE] save failed: %s", type(e).__name__)


def load_state() -> None:
    """Decrypt and rehydrate USERS on startup. Tolerates a missing, corrupt, or
    undecryptable file by starting empty (logged, contents never printed)."""
    if FERNET is None:
        return
    if not os.path.exists(HA_STATE_PATH):
        return
    try:
        with open(HA_STATE_PATH, "rb") as f:
            data = f.read()
        parsed = json.loads(FERNET.decrypt(data).decode("utf-8"))
        if not isinstance(parsed, dict):
            raise ValueError("state root is not an object")
        users = parsed.get("users", {})
        if not isinstance(users, dict):
            raise ValueError("state users is not an object")

        restored_users: Dict[int, UserState] = {}
        for uid_str, rec in users.items():
            try:
                uid = int(uid_str)
            except (TypeError, ValueError):
                continue
            if not isinstance(rec, dict):
                continue
            tasks = rec.get("tasks") or []
            if not isinstance(tasks, list):
                raise ValueError("state tasks is not a list")
            paciente = rec.get("paciente")
            if paciente is not None:
                paciente = int(paciente)
            usuario = rec.get("usuario")
            password = rec.get("password")
            if usuario is not None and not isinstance(usuario, str):
                raise TypeError("state usuario is not a string")
            if password is not None and not isinstance(password, str):
                raise TypeError("state password is not a string")

            # token stays None (re-derived via ensure_token); awaiting/wizard/
            # pending_patients start clean.
            user = UserState(
                paciente=paciente,
                plan=int(rec.get("plan") or 94),
                usuario=usuario,
                password=password,
            )
            for td in tasks:
                try:
                    task = _task_from_dict(td)
                except (KeyError, TypeError, ValueError):
                    continue
                user.tasks[task.task_id] = task
            restored_users[uid] = user
        USERS.clear()
        USERS.update(restored_users)
    except (InvalidToken, ValueError, TypeError, OSError) as e:
        USERS.clear()
        log.warning("[STATE] could not load state (%s); starting empty", type(e).__name__)
        return
    log.info("[STATE] restored %d user(s) from disk", len(USERS))


# =========================
# AUTH (login + token refresh)
# =========================

class AuthError(Exception):
    """Portal rejected the credentials (validacion=0) or returned no token."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _looks_like_jwt(value: Any) -> bool:
    return isinstance(value, str) and value.count(".") == 2 and len(value) > 40


def _extract_token(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    for key in ("accessToken", "token", "access_token", "jwt", "idToken"):
        if _looks_like_jwt(data.get(key)):
            return data[key]
    for value in data.values():
        if _looks_like_jwt(value):
            return value
        if isinstance(value, dict):
            nested = _extract_token(value)
            if nested:
                return nested
    return None


def ha_login(usuario: str, password: str) -> str:
    """POST auth/login and return the JWT access token, or raise AuthError."""
    headers = dict(HEADERS_BASE)
    headers["Content-Type"] = "application/json"
    headers["Referer"] = "https://www.hospitalaleman.com/tuportal/app/login"
    log.info("[HA API] POST %s (login)", URL_LOGIN)
    r = requests.post(
        URL_LOGIN,
        headers=headers,
        json={"usuario": usuario, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("validacion") == 0:
        raise AuthError(data.get("mensaje") or "Documento o contraseña incorrectos")
    token = _extract_token(data)
    if not token:
        raise AuthError("El portal no devolvió un token de acceso.")
    return token


def _jwt_payload(token: str) -> Optional[Dict[str, Any]]:
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception:
        return None


def token_expired(token: Optional[str], skew_seconds: int = 120) -> bool:
    """True if the JWT is missing or within skew_seconds of its exp.

    Opaque/unparseable tokens are treated as NOT expired: we cannot refresh them
    without credentials anyway, so the caller keeps using them until the API
    rejects them.
    """
    if not token:
        return True
    payload = _jwt_payload(token)
    if not payload or "exp" not in payload:
        return False
    try:
        return (time.time() + skew_seconds) >= float(payload["exp"])
    except Exception:
        return False


def ensure_token(user: UserState) -> Optional[str]:
    """Return a usable access token, refreshing via stored credentials if needed.

    Returns None only when no token can be obtained (bad/expired credentials and
    no manual token), signalling the caller to prompt the user.
    """
    if user.usuario and user.password:
        if not user.token or token_expired(user.token):
            try:
                user.token = ha_login(user.usuario, user.password)
                log.info("[AUTH] token refreshed via stored credentials")
            except AuthError as e:
                log.warning("[AUTH] auto-login rejected: %s", e.message)
                user.token = None
                user.usuario = None
                user.password = None
                return None
            except Exception as e:  # network/portal hiccup: keep whatever we had
                log.warning("[AUTH] auto-login error: %s", e)
                return user.token
    return user.token


# =========================
# HTTP HELPERS
# =========================

def auth_headers(token: str) -> Dict[str, str]:
    h = dict(HEADERS_BASE)
    h["Authorization"] = f"Bearer {token}"
    return h


def fetch_referencias(token: str) -> List[Dict[str, Any]]:
    log.info("[HA API] GET %s", URL_REFERENCIAS)
    r = requests.get(URL_REFERENCIAS, headers=auth_headers(token), timeout=30)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise ValueError("Unexpected referencias response type")
    return data


def fetch_turnos(token: str, payload: Dict[str, Any]) -> Any:
    safe_payload = {k: v for k, v in payload.items() if k != "paciente"}
    log.info("[HA API] POST %s payload=%s", URL_TURNOS, safe_payload)
    h = auth_headers(token)
    h["Content-Type"] = "application/json"
    r = requests.post(URL_TURNOS, headers=h, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_patients(token: str) -> List[Dict[str, Any]]:
    """Return the account's patients as [{'nombre', 'paciente', 'plan'}].

    The valid paciente ids come from the token's `ps` claim (the slot API
    validates the payload's `paciente` against it); names/plan are enriched from
    the titular profile and authorized minors. On non-auth enrichment failures it
    falls back to those claim ids with generic labels; token rejection returns no
    patients so the caller asks for fresh auth.
    """
    payload = _jwt_payload(token) or {}
    raw_ps = payload.get("ps")
    if isinstance(raw_ps, list):
        raw_patient_ids = raw_ps
    elif raw_ps:
        raw_patient_ids = [raw_ps]
    elif payload.get("paciente"):
        raw_patient_ids = [payload["paciente"]]
    else:
        raw_patient_ids = []

    allowed_ids: List[int] = []
    allowed_set = set()
    for raw_pid in raw_patient_ids:
        try:
            pid = int(raw_pid)
        except Exception:
            continue
        if pid in allowed_set:
            continue
        allowed_ids.append(pid)
        allowed_set.add(pid)

    nrodoc = payload.get("sub")
    nrosoc = payload.get("nrosoc")

    names: Dict[int, str] = {}
    plans: Dict[int, int] = {}
    credencial = None
    menores_count = 0

    # nrodoc/nrosoc/credencial are interpolated into request URLs; require plain
    # digits so a crafted token cannot inject path/query segments.
    if nrodoc is not None and str(nrodoc).isdigit():
        try:
            r = requests.get(URL_PERFIL_DNI.format(nrodoc=nrodoc), headers=auth_headers(token), timeout=30)
            r.raise_for_status()
            tit = r.json()
            if isinstance(tit, dict) and tit.get("paciente"):
                pid = int(tit["paciente"])
                credencial = tit.get("credencial")
                menores_count = int(tit.get("menores") or 0)
                if pid in allowed_set:
                    names[pid] = (tit.get("nombre") or "").strip() or f"Paciente {pid}"
                    if tit.get("plan"):
                        plans[pid] = int(tit["plan"])
        except Exception as e:
            if _is_invalid_token_error(e):
                log.warning("[HA API] perfil/dni rejected token: %s", type(e).__name__)
                return []
            log.warning("[HA API] perfil/dni failed: %s", type(e).__name__)

    if menores_count and nrosoc is not None and str(nrosoc).isdigit() and str(credencial).isdigit():
        try:
            r = requests.get(
                URL_MENORES.format(nrosoc=nrosoc, credencial=credencial),
                headers=auth_headers(token),
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            menores = data.get("menores") if isinstance(data, dict) else data
            for m in menores or []:
                if isinstance(m, dict) and m.get("paciente"):
                    pid = int(m["paciente"])
                    if pid in allowed_set:
                        names[pid] = (m.get("nombre") or "").strip() or f"Paciente {pid}"
                        if m.get("plan"):
                            plans[pid] = int(m["plan"])
        except Exception as e:
            if _is_invalid_token_error(e):
                log.warning("[HA API] menoresAutorizados rejected token: %s", type(e).__name__)
                return []
            log.warning("[HA API] menoresAutorizados failed: %s", type(e).__name__)

    result: List[Dict[str, Any]] = []
    for pid in allowed_ids:
        result.append({"nombre": names.get(pid, f"Paciente {pid}"), "paciente": pid, "plan": plans.get(pid, 94)})
    return result


# =========================
# UI HELPERS
# =========================

def main_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ /new", callback_data="main:new")],
        [InlineKeyboardButton("📋 /tasks", callback_data="main:tasks")],
    ])


def auth_mode_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔐 Логин и пароль (рекомендуется)", callback_data="auth:login")],
        [InlineKeyboardButton("🔑 Вставить токен вручную", callback_data="auth:token")],
    ])


def credential_storage_notice() -> str:
    if FERNET is None:
        return (
            "Данные для входа храню только в памяти бота для обновления токена; "
            "после рестарта нужно будет войти заново."
        )
    return (
        "Данные для входа сохраняю в зашифрованном файле состояния "
        "и использую только для обновления токена."
    )


def auth_intro_text() -> str:
    return (
        "Как авторизуемся на портале Hospital Alemán?\n\n"
        "🔐 *Логин и пароль* — бот сам получает токен и обновляет его автоматически, "
        f"больше ничего вставлять не нужно. {credential_storage_notice()}\n"
        "🔑 *Токен вручную* — вставляете access token сами; его придётся обновлять примерно раз в час."
    )


def months_next_12() -> List[Tuple[int, int, str]]:
    now = datetime.now()
    res = []
    for i in range(12):
        m = (now.month - 1 + i) % 12 + 1
        y = now.year + (now.month - 1 + i) // 12
        label = datetime(y, m, 1).strftime("%B %Y")
        res.append((m, y, label))
    return res


def chunk_buttons(buttons: List[InlineKeyboardButton], row: int = 2) -> List[List[InlineKeyboardButton]]:
    rows = []
    for i in range(0, len(buttons), row):
        rows.append(buttons[i:i + row])
    return rows


def _norm(s: Optional[str]) -> str:
    """Uppercase + accent-stripped form for accent-insensitive substring search."""
    s = s or ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.upper()


def filter_indices(items: List[str], query: str) -> List[int]:
    """Indices of items where every whitespace-separated token of query is a
    substring (accent-insensitive). Empty query keeps everything."""
    tokens = _norm(query).split()
    if not tokens:
        return list(range(len(items)))
    out = []
    for i, it in enumerate(items):
        n = _norm(it)
        if all(tok in n for tok in tokens):
            out.append(i)
    return out


def build_list_markup(
    items: List[str],
    indices: List[int],
    item_cb: str,
    page: int,
    page_cb: str,
    tail_rows: List[List[InlineKeyboardButton]],
) -> Tuple[InlineKeyboardMarkup, int, int]:
    """Render a single page of a (possibly filtered) list as one-button rows,
    plus a paging row when needed. Returns (markup, page, pages)."""
    total = len(indices)
    pages = max(1, (total + CHOICE_PAGE_SIZE - 1) // CHOICE_PAGE_SIZE)
    page = max(0, min(page, pages - 1))
    window = indices[page * CHOICE_PAGE_SIZE:(page + 1) * CHOICE_PAGE_SIZE]

    rows: List[List[InlineKeyboardButton]] = [
        [InlineKeyboardButton(items[i], callback_data=f"{item_cb}:{i}")] for i in window
    ]

    nav: List[InlineKeyboardButton] = []
    if page > 0:
        nav.append(InlineKeyboardButton("◀️", callback_data=f"{page_cb}:{page - 1}"))
    if pages > 1:
        nav.append(InlineKeyboardButton(f"{page + 1}/{pages}", callback_data="noop"))
    if page < pages - 1:
        nav.append(InlineKeyboardButton("▶️", callback_data=f"{page_cb}:{page + 1}"))
    if nav:
        rows.append(nav)

    rows.extend(tail_rows)
    return InlineKeyboardMarkup(rows), page, pages


def specialty_view(user: UserState, page: int) -> Tuple[str, InlineKeyboardMarkup]:
    w = user.wizard
    idxs = filter_indices(w.spec_list, w.spec_query)
    if not idxs:
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 Показать все A→Z", callback_data="wiz:specall")],
            [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
        ])
        return (
            f"По запросу «{w.spec_query}» ничего не найдено.\n"
            "Попробуйте другое слово или откройте полный список.",
            markup,
        )
    tail = [
        [InlineKeyboardButton("🔎 Искать заново", callback_data="wiz:specfind")],
        [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
    ]
    markup, page, pages = build_list_markup(w.spec_list, idxs, "wiz:speci", page, "wiz:specpage", tail)
    if w.spec_query:
        head = f"🔎 «{w.spec_query}» — найдено {len(idxs)}"
    else:
        head = f"📖 Все специальности A→Z ({len(idxs)})"
    if pages > 1:
        head += f" · стр. {page + 1}/{pages}"
    return head + ":", markup


def doctor_view(user: UserState, page: int) -> Tuple[str, InlineKeyboardMarkup]:
    w = user.wizard
    idxs = filter_indices(w.doc_list, w.doc_query)
    esp = w.selected_especialidad or ""
    if not idxs:
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 Показать всех", callback_data="wiz:docall")],
            [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back")],
            [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
        ])
        return (
            f"Специальность: {esp}\n\n"
            f"По запросу «{w.doc_query}» врач не найден. Попробуйте иначе или откройте список.",
            markup,
        )
    tail = [
        [InlineKeyboardButton("🔎 Искать заново", callback_data="wiz:docfind")],
        [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back")],
        [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
    ]
    markup, page, pages = build_list_markup(w.doc_list, idxs, "wiz:doci", page, "wiz:docpage", tail)
    head = f"Специальность: {esp}\n\n"
    if w.doc_query:
        head += f"🔎 «{w.doc_query}» — найдено {len(idxs)}"
    else:
        head += f"Выберите врача ({len(idxs)})"
    if pages > 1:
        head += f" · стр. {page + 1}/{pages}"
    return head + ":", markup


# =========================
# START / SETUP
# =========================

async def send_auth_setup(chat) -> None:
    await chat.send_message(auth_intro_text(), parse_mode="Markdown", reply_markup=auth_mode_keyboard())


async def present_patient_selection(send, user: UserState, token: str) -> bool:
    """Fetch the account's patients and either auto-select (single) or show
    name buttons. `send` is an async callable(text, reply_markup=None).
    Returns True when a patient is selected or the chooser is shown.
    """
    patients = fetch_patients(token)
    if not patients:
        await send("Не удалось получить список пациентов. Войдите заново: /login.")
        return False
    if len(patients) == 1:
        p = patients[0]
        user.paciente = p["paciente"]
        user.plan = p.get("plan", 94)
        user.pending_patients = None
        user.auth_fail_count = 0
        await send(
            f"Готово, мониторю за: {p['nombre']}.\n/new — создать задание\n/tasks — управление заданиями",
            reply_markup=main_menu_keyboard(),
        )
        return True
    user.pending_patients = patients
    buttons = [
        InlineKeyboardButton(p["nombre"], callback_data=f"pat:{p['paciente']}")
        for p in patients
    ]
    markup = InlineKeyboardMarkup(
        chunk_buttons(buttons, row=1) + [[InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")]]
    )
    await send("За кого мониторим запись?", reply_markup=markup)
    return True


def _reset_active_task_auth_failures(user: UserState) -> None:
    for task in user.tasks.values():
        if task.active:
            task.auth_fail_count = 0


async def _reprompt_manual_token(send, user: UserState) -> None:
    """Clear a bad manual token and keep the user in token-entry mode."""
    if user.usuario and user.password:
        return
    user.token = None
    user.paciente = None
    user.pending_patients = None
    user.awaiting = "token"
    user.auth_fail_count = 0
    await send("Token не принят. Пришлите новый access token (Bearer) или войдите по логину через /login.")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)

    if not has_auth(user):
        user.awaiting = None
        await send_auth_setup(update.effective_chat)
        return

    token = ensure_token(user)
    if token is None:
        await send_auth_setup(update.effective_chat)
        return

    if user.paciente is None:
        if not await present_patient_selection(update.effective_chat.send_message, user, token):
            await _reprompt_manual_token(update.effective_chat.send_message, user)
        return

    await update.effective_chat.send_message(
        "Главное меню:\n/new — создать задание\n/tasks — управление заданиями",
        reply_markup=main_menu_keyboard(),
    )


async def cmd_login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Re-run authorization (switch account / update password / paste new token)."""
    uid = update.effective_user.id
    user = get_user(uid)
    user.token = None
    user.usuario = None
    user.password = None
    user.paciente = None
    user.plan = 94
    user.pending_patients = None
    user.auth_fail_count = 0
    user.awaiting = None
    save_state()
    await send_auth_setup(update.effective_chat)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)
    text = (update.message.text or "").strip()

    if user.awaiting == "usuario":
        user.usuario = text
        user.awaiting = "password"
        await update.effective_chat.send_message(
            "Введите пароль от портала.\n"
            f"🔒 Сообщение с паролем я сразу удалю. {credential_storage_notice()}"
        )
        return

    if user.awaiting == "password":
        password = text
        # Remove the plaintext password message from the chat history.
        try:
            await update.message.delete()
        except Exception:
            pass
        await update.effective_chat.send_message("Проверяю доступ к порталу…")
        try:
            token = ha_login(user.usuario or "", password)
        except AuthError as e:
            user.awaiting = "usuario"
            await update.effective_chat.send_message(
                f"❌ {e.message}\nВведите номер документа (DNI) ещё раз:"
            )
            return
        except Exception as e:
            user.awaiting = None
            await update.effective_chat.send_message(
                f"Не удалось связаться с порталом: {e}\nПопробуйте позже или /login."
            )
            return
        user.password = password
        user.token = token
        user.awaiting = None
        user.auth_fail_count = 0
        _reset_active_task_auth_failures(user)
        save_state()
        await present_patient_selection(update.effective_chat.send_message, user, token)
        save_state()
        return

    if user.awaiting == "token":
        user.token = text
        user.awaiting = None
        user.auth_fail_count = 0
        _reset_active_task_auth_failures(user)
        token = ensure_token(user)
        if not token:
            await _reprompt_manual_token(update.effective_chat.send_message, user)
            return
        if not await present_patient_selection(update.effective_chat.send_message, user, token):
            await _reprompt_manual_token(update.effective_chat.send_message, user)
        save_state()
        return

    # Free-text acts as a live filter while choosing a specialty or a doctor.
    if user.wizard and user.wizard.step == "specialty":
        user.wizard.spec_query = text
        head, markup = specialty_view(user, 0)
        await update.effective_chat.send_message(head, reply_markup=markup)
        return

    if user.wizard and user.wizard.step == "doctor":
        user.wizard.doc_query = text
        head, markup = doctor_view(user, 0)
        await update.effective_chat.send_message(head, reply_markup=markup)
        return

    await update.effective_chat.send_message(
        "Используйте команды:\n/new — создать задание\n/tasks — управление заданиями",
        reply_markup=main_menu_keyboard(),
    )


# =========================
# COMMANDS
# =========================

async def cmd_new(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)

    if not has_auth(user):
        await send_auth_setup(update.effective_chat)
        return

    token = ensure_token(user)
    if token is None:
        user.awaiting = "usuario"
        await update.effective_chat.send_message(
            "❌ Не удалось войти с сохранёнными данными портала (возможно, изменился пароль).\n"
            "Введите номер документа (DNI) заново:"
        )
        return

    if user.paciente is None:
        if not await present_patient_selection(update.effective_chat.send_message, user, token):
            await _reprompt_manual_token(update.effective_chat.send_message, user)
        return

    try:
        referencias = fetch_referencias(token)
    except Exception as e:
        if _is_invalid_token_error(e):
            user.token = None
            if user.usuario and user.password:
                await update.effective_chat.send_message("Токен истёк, обновил его. Повторите /new.")
            else:
                user.awaiting = "token"
                await update.effective_chat.send_message(
                    "❌ Token недействителен/истёк. Пришлите новый access token (Bearer) или войдите по логину /login."
                )
            return
        await update.effective_chat.send_message(f"Ошибка запроса especialidades. {e}")
        return

    especialidades = sorted({
        (it.get("especialidad") or "").strip()
        for it in referencias
        if isinstance(it, dict) and it.get("especialidad")
    })
    if not especialidades:
        await update.effective_chat.send_message("Не удалось получить список специальностей.")
        return

    user.wizard = WizardState(step="specialty", referencias=referencias)
    user.wizard.history = []
    user.wizard.spec_list = especialidades
    user.wizard.doc_list = []
    user.wizard.spec_query = ""

    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("📖 Показать все A→Z", callback_data="wiz:specall")],
        [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
    ])
    await update.effective_chat.send_message(
        "Выберите специальность для мониторинга.\n\n"
        "🔎 Напишите название или его часть (например: oftal, trauma, cardio) — покажу совпадения.\n"
        "Или откройте полный список по алфавиту.",
        reply_markup=markup,
    )


async def cmd_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)

    if not user.tasks:
        await update.effective_chat.send_message(
            "Активных заданий нет.\n/new — создать задание",
            reply_markup=main_menu_keyboard(),
        )
        return

    buttons = []
    for t in user.tasks.values():
        if not t.active:
            continue
        label = f"{t.especialidad} — {t.agenda_nombre} ({t.month:02d}.{t.year})"
        buttons.append(InlineKeyboardButton(label, callback_data=f"tasks:open:{t.task_id}"))

    markup = InlineKeyboardMarkup(
        chunk_buttons(buttons, row=1) + [[InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")]]
    )

    await update.effective_chat.send_message("Ваши задания:", reply_markup=markup)


# =========================
# CALLBACKS
# =========================

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    user = get_user(uid)

    data = q.data or ""

    if data == "noop":
        return

    if data == "main:new":
        await cmd_new(update, context)
        return
    if data == "main:tasks":
        await cmd_tasks(update, context)
        return

    if data == "auth:login":
        user.token = None
        user.paciente = None
        user.plan = 94
        user.pending_patients = None
        user.auth_fail_count = 0
        user.awaiting = "usuario"
        save_state()
        await q.message.reply_text("Введите номер документа (DNI / usuario) для входа на портал:")
        return
    if data == "auth:token":
        user.token = None
        user.usuario = None
        user.password = None
        user.paciente = None
        user.plan = 94
        user.pending_patients = None
        user.auth_fail_count = 0
        user.awaiting = "token"
        save_state()
        await q.message.reply_text("Введите актуальный access token (Bearer):")
        return

    if data.startswith("pat:"):
        try:
            pid = int(data.split(":", 1)[1])
        except ValueError:
            await q.message.reply_text("Некорректный выбор пациента. Отправьте /start.")
            return
        chosen = next((p for p in (user.pending_patients or []) if p.get("paciente") == pid), None)
        if chosen is None:
            await q.message.reply_text("Список пациентов устарел. Отправьте /start, чтобы выбрать пациента.")
            return
        user.paciente = chosen["paciente"]
        user.plan = chosen.get("plan", 94)
        user.pending_patients = None
        user.auth_fail_count = 0
        save_state()
        await q.message.reply_text(
            f"Готово, мониторю за: {chosen['nombre']}.\n/new — создать задание\n/tasks — управление заданиями",
            reply_markup=main_menu_keyboard(),
        )
        return

    if data == "nav:home":
        user.wizard = None
        await q.message.reply_text(
            "Главное меню:\n/new — создать задание\n/tasks — управление заданиями",
            reply_markup=main_menu_keyboard(),
        )
        return

    if data == "nav:back":
        if not user.wizard or not user.wizard.history:
            await q.message.reply_text(
                "Главное меню:\n/new — создать задание\n/tasks — управление заданиями",
                reply_markup=main_menu_keyboard(),
            )
            return

        step, snapshot = user.wizard.history.pop()
        user.wizard.step = step
        for k, v in snapshot.items():
            setattr(user.wizard, k, v)

        await render_wizard_step(q, user)
        return

    if data.startswith("tasks:open:"):
        task_id = data.split(":", 2)[2]
        t = user.tasks.get(task_id)
        if not t or not t.active:
            await q.message.reply_text("Задание не найдено или уже остановлено.")
            return

        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("❌ Cancel", callback_data=f"tasks:cancel:{task_id}")],
            [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back_tasks")],
            [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
        ])
        await q.message.reply_text(
            f"Задание:\n{t.especialidad}\n{t.agenda_nombre}\nМесяц: {t.month:02d}.{t.year}\n\nДействия:",
            reply_markup=markup,
        )
        return

    if data == "nav:back_tasks":
        await cmd_tasks(update, context)
        return

    if data.startswith("tasks:cancel:"):
        task_id = data.split(":", 2)[2]
        t = user.tasks.get(task_id)
        if not t or not t.active:
            await q.message.reply_text("Задание не найдено или уже остановлено.")
            return
        t.active = False
        save_state()
        await q.message.reply_text("Задание отменено.")
        return

    # ----- specialty browsing (paging / show-all / re-search) -----
    if data == "wiz:specall" or data.startswith("wiz:specpage:"):
        if not user.wizard or user.wizard.step != "specialty":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return
        if data == "wiz:specall":
            user.wizard.spec_query = ""
            page = 0
        else:
            page = int(data.split(":", 2)[2])
        head, markup = specialty_view(user, page)
        await _edit_or_reply(q, head, markup)
        return

    if data == "wiz:specfind":
        if not user.wizard or user.wizard.step != "specialty":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return
        user.wizard.spec_query = ""
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 Показать все A→Z", callback_data="wiz:specall")],
            [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
        ])
        await _edit_or_reply(
            q,
            "🔎 Напишите название специальности или его часть (например: oftal).\n"
            "Или откройте полный список по алфавиту.",
            markup,
        )
        return

    # ----- doctor browsing -----
    if data == "wiz:docall" or data.startswith("wiz:docpage:"):
        if not user.wizard or user.wizard.step != "doctor":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return
        if data == "wiz:docall":
            user.wizard.doc_query = ""
            page = 0
        else:
            page = int(data.split(":", 2)[2])
        head, markup = doctor_view(user, page)
        await _edit_or_reply(q, head, markup)
        return

    if data == "wiz:docfind":
        if not user.wizard or user.wizard.step != "doctor":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return
        user.wizard.doc_query = ""
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 Показать всех", callback_data="wiz:docall")],
            [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back")],
            [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
        ])
        await _edit_or_reply(
            q,
            "🔎 Напишите фамилию врача или её часть.\nИли откройте полный список.",
            markup,
        )
        return

    if data.startswith("wiz:speci:"):
        if not user.wizard or user.wizard.step != "specialty":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return

        idx = int(data.split(":", 2)[2])
        if idx < 0 or idx >= len(user.wizard.spec_list):
            await q.message.reply_text("Некорректный выбор. Нажмите /new заново.")
            return

        selected = user.wizard.spec_list[idx]

        user.wizard.history.append(("specialty", {
            "selected_especialidad": user.wizard.selected_especialidad,
            "selected_descripcion": user.wizard.selected_descripcion,
            "selected_cod_acme": user.wizard.selected_cod_acme,
            "selected_cod_instancia": user.wizard.selected_cod_instancia,
            "spec_list": user.wizard.spec_list,
            "doc_list": user.wizard.doc_list,
            "spec_query": user.wizard.spec_query,
            "doc_query": user.wizard.doc_query,
            "step": user.wizard.step,
        }))

        user.wizard.selected_especialidad = selected
        user.wizard.step = "doctor"
        user.wizard.doc_query = ""
        await render_wizard_step(q, user)
        return

    if data.startswith("wiz:doci:"):
        if not user.wizard or user.wizard.step != "doctor":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return

        idx = int(data.split(":", 2)[2])
        if idx < 0 or idx >= len(user.wizard.doc_list):
            await q.message.reply_text("Некорректный выбор. Нажмите /new заново.")
            return

        selected_desc = user.wizard.doc_list[idx]

        user.wizard.history.append(("doctor", {
            "selected_descripcion": user.wizard.selected_descripcion,
            "selected_cod_acme": user.wizard.selected_cod_acme,
            "selected_cod_instancia": user.wizard.selected_cod_instancia,
            "spec_list": user.wizard.spec_list,
            "doc_list": user.wizard.doc_list,
            "spec_query": user.wizard.spec_query,
            "doc_query": user.wizard.doc_query,
            "step": user.wizard.step,
        }))

        user.wizard.selected_descripcion = selected_desc

        esp = user.wizard.selected_especialidad
        found = None
        for it in user.wizard.referencias:
            if not isinstance(it, dict):
                continue
            if (it.get("especialidad") or "").strip() == esp and (it.get("descripcion") or "").strip() == selected_desc:
                found = it
                break

        if not found:
            await q.message.reply_text("Не удалось найти codAcme/codInstancia для выбранного врача. Нажмите /new.")
            user.wizard = None
            return

        user.wizard.selected_cod_acme = str(found.get("codAcme"))
        user.wizard.selected_cod_instancia = int(found.get("codInstancia"))
        user.wizard.step = "month"
        await render_wizard_step(q, user)
        return

    if data.startswith("wiz:month:"):
        if not user.wizard or user.wizard.step != "month":
            await q.message.reply_text("Сессия выбора устарела. Нажмите /new заново.")
            return
        if user.paciente is None:
            user.wizard = None
            await q.message.reply_text("Сначала выберите пациента через /start, затем создайте задание заново.")
            return

        _, _, m_str, y_str = data.split(":")
        m = int(m_str)
        y = int(y_str)

        task_id = f"t{int(datetime.now().timestamp())}_{len(user.tasks)+1}"

        agenda_nombres = None
        agenda_nombre_display = user.wizard.selected_descripcion or ""
        if (user.wizard.selected_descripcion or "").strip() == "Todos":
            esp = (user.wizard.selected_especialidad or "").strip()
            all_descs = sorted({
                (it.get("descripcion") or "").strip()
                for it in user.wizard.referencias
                if isinstance(it, dict)
                and (it.get("especialidad") or "").strip() == esp
                and it.get("descripcion")
                and (it.get("descripcion") or "").strip() != "Todos"
            })
            agenda_nombres = all_descs
            agenda_nombre_display = "Todos"

        t = Task(
            task_id=task_id,
            especialidad=user.wizard.selected_especialidad or "",
            agenda_nombre=agenda_nombre_display,
            cod_acme=user.wizard.selected_cod_acme or "",
            cod_instancia=user.wizard.selected_cod_instancia or 0,
            month=m,
            year=y,
            paciente=int(user.paciente),
            plan=int(user.plan or 94),
            agenda_nombres=agenda_nombres,
        )
        user.tasks[task_id] = t
        user.wizard = None
        save_state()

        await q.message.reply_text(
            f"✅ Задание создано.\nБуду мониторить:\n{t.especialidad}\n{t.agenda_nombre}\nМесяц: {t.month:02d}.{t.year}",
            reply_markup=main_menu_keyboard(),
        )

        await check_task_once(uid, user, t, context)
        return

    await q.message.reply_text("Неизвестное действие. Используйте /new или /tasks.", reply_markup=main_menu_keyboard())


async def _edit_or_reply(q, text: str, markup: InlineKeyboardMarkup) -> None:
    """Edit the message that carried the buttons (keeps the list in place); fall
    back to a new message if the edit is rejected (e.g. identical content)."""
    try:
        await q.edit_message_text(text, reply_markup=markup)
    except Exception:
        try:
            await q.message.reply_text(text, reply_markup=markup)
        except Exception:
            pass


async def render_wizard_step(q, user: UserState):
    if not user.wizard:
        await q.message.reply_text("Сессия выбора отсутствует. /new")
        return

    if user.wizard.step == "specialty":
        head, markup = specialty_view(user, 0)
        await q.message.reply_text(head, reply_markup=markup)
        return

    if user.wizard.step == "doctor":
        esp = user.wizard.selected_especialidad
        descs = sorted({
            (it.get("descripcion") or "").strip()
            for it in user.wizard.referencias
            if isinstance(it, dict) and (it.get("especialidad") or "").strip() == esp and it.get("descripcion")
        })
        if not descs:
            await q.message.reply_text("Нет доступных врачей/agenda для выбранной специальности.")
            user.wizard = None
            return

        user.wizard.doc_list = descs
        head, markup = doctor_view(user, 0)
        await q.message.reply_text(head, reply_markup=markup)
        return

    if user.wizard.step == "month":
        months = months_next_12()
        buttons = [
            InlineKeyboardButton(label, callback_data=f"wiz:month:{m}:{y}")
            for (m, y, label) in months
        ]
        markup = InlineKeyboardMarkup(
            chunk_buttons(buttons, row=2) + [
                [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back")],
                [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
            ]
        )
        await q.message.reply_text(
            f"Вы выбрали:\n{user.wizard.selected_especialidad}\n{user.wizard.selected_descripcion}\n\nВыберите месяц мониторинга:",
            reply_markup=markup,
        )
        return

    await q.message.reply_text("Сессия выбора устарела. /new")


# =========================
# BACKGROUND MONITOR
# =========================

def make_fecha_first_of_month(month: int, year: int) -> str:
    return f"01{month:02d}{year}"


# ====== CHANGE #2 (Fuzzy name matching) ======
def _name_tokens(s: Optional[str]) -> List[str]:
    if not s:
        return []
    up = s.upper()
    # replace common punctuation with spaces, keep letters/numbers/spaces
    buf = []
    for ch in up:
        if ch.isalnum() or ch.isspace():
            buf.append(ch)
        else:
            buf.append(" ")
    cleaned = "".join(buf)
    tokens = [t for t in cleaned.split() if t]
    return tokens


def _matches_by_tokens(target_name: str, agenda_name: Optional[str]) -> bool:
    # all tokens from target_name should exist in agenda_name tokens
    t_tokens = _name_tokens(target_name)
    a_tokens = set(_name_tokens(agenda_name))
    if not t_tokens:
        return False
    for tok in t_tokens:
        if tok not in a_tokens:
            return False
    return True


async def _prompt_reauth(uid: int, user: UserState, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Ask the user to re-authorize when no token can be obtained. No-op if the
    user is already mid-input, so a background poll never clobbers an in-progress
    onboarding step or spams the same prompt every cycle."""
    if user.awaiting:
        return
    if user.usuario and user.password:
        user.awaiting = "usuario"
        msg = ("❌ Не удалось войти с сохранёнными данными портала (возможно, изменился пароль).\n"
               "Введите номер документа (DNI) заново, чтобы продолжить мониторинг:")
    else:
        user.awaiting = "token"
        msg = "Требуется авторизация для мониторинга. Отправьте /login, чтобы войти по логину или прислать токен."
    try:
        await context.bot.send_message(uid, msg)
    except Exception:
        pass


def _is_invalid_token_error(e: Exception) -> bool:
    """A 401 (or explicit 'Invalid token' body) means the token must be refreshed.
    requests' HTTPError string is '401 Client Error: ...' without the body, so we
    check the response status explicitly."""
    resp = getattr(e, "response", None)
    if resp is not None and getattr(resp, "status_code", None) == 401:
        return True
    body = ""
    if resp is not None:
        try:
            body = resp.text or ""
        except Exception:
            body = ""
    return "Invalid token" in body or "Invalid token" in str(e)


async def check_task_once(uid: int, user: UserState, t: Task, context: ContextTypes.DEFAULT_TYPE):
    if not t.active:
        return

    if t.auth_fail_count >= AUTH_FAIL_CAP:
        return  # paused after repeated rejections; user must re-authorize or recreate

    token = ensure_token(user)
    if token is None:
        await _prompt_reauth(uid, user, context)
        return

    if getattr(t, "paciente", None) is None:
        return  # legacy in-memory task without a patient snapshot

    payload = {
        "codAcme": int(t.cod_acme) if str(t.cod_acme).isdigit() else t.cod_acme,
        "codInstancia": int(t.cod_instancia),
        "agendaId": None,
        "fecha": make_fecha_first_of_month(t.month, t.year),
        "paciente": int(t.paciente),
        "banda": "O",
        "tipoArea": "IEC",
        "institucion": 50,
        "plan": int(t.plan or 94),
    }

    try:
        resp = fetch_turnos(token, payload)
    except Exception as e:
        if _is_invalid_token_error(e):
            await _handle_invalid_token(uid, user, t, context)
            return
        log.warning("Error polling task %s for user %s: %s", t.task_id, uid, e)
        return

    if isinstance(resp, dict) and resp.get("errorMessage") == "Invalid token":
        await _handle_invalid_token(uid, user, t, context)
        return

    if not isinstance(resp, list):
        log.info("[HA API] RESP non-list")
        return

    # A valid slot list means the token + patient are accepted again.
    t.auth_fail_count = 0
    log.info("[HA API] RESP %d slots", len(resp))

    notified_changed = False
    for slot in resp:
        if not isinstance(slot, dict):
            continue

        slot_agenda = slot.get("agendaNombre")

        # ====== CHANGE #2 (Fuzzy matching instead of strict equality) ======
        matched = False
        if t.agenda_nombres is None:
            matched = _matches_by_tokens(t.agenda_nombre, slot_agenda)
        else:
            # Todos: match ANY descripcion in agenda_nombres against agendaNombre
            for candidate in t.agenda_nombres:
                if _matches_by_tokens(candidate, slot_agenda):
                    matched = True
                    break

        if not matched:
            continue

        key = f"{slot_agenda} {slot.get('fecha','')} {slot.get('hora','')}".strip()
        if not key or key in t.notified:
            continue

        t.notified.add(key)
        notified_changed = True
        fecha = slot.get("fecha", "")
        hora = slot.get("hora", "")
        try:
            await context.bot.send_message(
                uid,
                f"Появилась запись к {t.especialidad} {slot_agenda} на {fecha} {hora}."
            )
        except Exception:
            pass

    if notified_changed:
        # Persist immediately so an already-announced slot is not re-notified
        # after a restart between poll cycles.
        save_state()


async def _handle_invalid_token(uid: int, user: UserState, t: Task, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Portal rejected the token/patient mid-flight. Credential users self-heal by
    re-logging in next cycle, but only up to AUTH_FAIL_CAP consecutive failures —
    then the affected task is paused and the user is told once, so one persistent
    401 can't loop silently forever or be reset by another successful task.
    Manual-token users are asked for a fresh token immediately (once)."""
    user.token = None
    t.auth_fail_count += 1

    if user.usuario and user.password:
        if t.auth_fail_count < AUTH_FAIL_CAP:
            log.info("[AUTH] token rejected; re-login from stored credentials (%d/%d)",
                     t.auth_fail_count, AUTH_FAIL_CAP)
            return
        if t.auth_fail_count == AUTH_FAIL_CAP:
            t.active = False
            try:
                await context.bot.send_message(
                    uid,
                    "❌ Портал повторно отклоняет запрос — это задание приостановлено.\n"
                    "Войдите заново через /login или пересоздайте задание /new.",
                )
            except Exception:
                pass
        return

    # manual token: cannot self-heal — ask once for a new token
    if t.auth_fail_count == 1:
        user.awaiting = "token"
        try:
            await context.bot.send_message(
                uid,
                "❌ Token недействителен/истёк. Пришлите новый access token (Bearer) "
                "или войдите по логину через /login, чтобы продолжить мониторинг.",
            )
        except Exception:
            pass
    elif t.auth_fail_count >= AUTH_FAIL_CAP:
        t.active = False
        try:
            await context.bot.send_message(
                uid,
                "❌ Портал повторно отклоняет token для этого задания — задание приостановлено.\n"
                "Пришлите новый token или войдите через /login, затем создайте задание заново.",
            )
        except Exception:
            pass


async def poll_tasks(context: ContextTypes.DEFAULT_TYPE):
    for uid, user in USERS.items():
        active_tasks = [t for t in user.tasks.values() if t.active]
        if not active_tasks:
            continue

        token = ensure_token(user)
        if token is None:
            # ensure_token may have cleared rejected credentials; persist that.
            save_state()
            await _prompt_reauth(uid, user, context)
            continue

        for t in active_tasks:
            await check_task_once(uid, user, t, context)

    # Capture any per-cycle drift (paused tasks, cleared credentials) in one write.
    save_state()


# =========================
# MAIN
# =========================

def main():
    load_state()

    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("login", cmd_login))
    app.add_handler(CommandHandler("new", cmd_new))
    app.add_handler(CommandHandler("tasks", cmd_tasks))

    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    app.job_queue.run_repeating(poll_tasks, interval=CHECK_INTERVAL_SECONDS, first=10)

    app.run_polling()


if __name__ == "__main__":
    main()
