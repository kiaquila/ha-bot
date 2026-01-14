import os
from dotenv import load_dotenv
load_dotenv()
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

import requests
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

URL_REFERENCIAS = "https://www.hospitalaleman.com/tuportal/api/referencias/agenda/datosProfesionalEspecialidad"
URL_TURNOS = "https://www.hospitalaleman.com/tuportal/api/turnos/turnosDisponiblesMes"

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
    notified: set = field(default_factory=set)  # keys like "<agendaNombre> 02-MAR-26 10:00"
    active: bool = True

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


@dataclass
class UserState:
    paciente: Optional[int] = None
    token: Optional[str] = None
    awaiting: Optional[str] = None  # "paciente" | "token"
    wizard: Optional[WizardState] = None
    tasks: Dict[str, Task] = field(default_factory=dict)


USERS: Dict[int, UserState] = {}


def get_user(uid: int) -> UserState:
    if uid not in USERS:
        USERS[uid] = UserState()
    return USERS[uid]


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
    log.info("[HA API] POST %s payload=%s", URL_TURNOS, payload)
    h = auth_headers(token)
    h["Content-Type"] = "application/json"
    r = requests.post(URL_TURNOS, headers=h, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


# =========================
# UI HELPERS
# =========================

def main_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ /new", callback_data="main:new")],
        [InlineKeyboardButton("📋 /tasks", callback_data="main:tasks")],
    ])


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


# =========================
# START / SETUP
# =========================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)

    if user.paciente is None:
        user.awaiting = "paciente"
        await update.effective_chat.send_message("Введите номер пациента (paciente):")
        return

    if user.token is None:
        user.awaiting = "token"
        await update.effective_chat.send_message("Введите актуальный access token (Bearer):")
        return

    await update.effective_chat.send_message(
        "Главное меню:\n/new — создать задание\n/tasks — управление заданиями",
        reply_markup=main_menu_keyboard(),
    )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)
    text = (update.message.text or "").strip()

    if user.awaiting == "paciente":
        if not text.isdigit():
            await update.effective_chat.send_message("paciente должен быть числом. Введите paciente:")
            return
        user.paciente = int(text)
        user.awaiting = "token"
        await update.effective_chat.send_message("Введите актуальный access token (Bearer):")
        return

    if user.awaiting == "token":
        user.token = text
        user.awaiting = None
        await update.effective_chat.send_message(
            "Готово.\n/new — создать задание\n/tasks — управление заданиями",
            reply_markup=main_menu_keyboard(),
        )
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

    if user.paciente is None:
        user.awaiting = "paciente"
        await update.effective_chat.send_message("Введите номер пациента (paciente):")
        return
    if user.token is None:
        user.awaiting = "token"
        await update.effective_chat.send_message("Введите актуальный access token (Bearer):")
        return

    try:
        referencias = fetch_referencias(user.token)
    except requests.HTTPError as e:
        await update.effective_chat.send_message(f"Ошибка запроса especialidades (HTTP). {e}")
        return
    except Exception as e:
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

    buttons = [
        InlineKeyboardButton(es, callback_data=f"wiz:speci:{i}")
        for i, es in enumerate(especialidades)
    ]
    markup = InlineKeyboardMarkup(chunk_buttons(buttons, row=1) + [
        [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")]
    ])

    await update.effective_chat.send_message(
        "Выберите специальность для мониторинга:",
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

    if data == "main:new":
        await cmd_new(update, context)
        return
    if data == "main:tasks":
        await cmd_tasks(update, context)
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
        await q.message.reply_text("Задание отменено.")
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
            "step": user.wizard.step,
        }))

        user.wizard.selected_especialidad = selected
        user.wizard.step = "doctor"
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
            agenda_nombres=agenda_nombres,
        )
        user.tasks[task_id] = t
        user.wizard = None

        await q.message.reply_text(
            f"✅ Задание создано.\nБуду мониторить:\n{t.especialidad}\n{t.agenda_nombre}\nМесяц: {t.month:02d}.{t.year}",
            reply_markup=main_menu_keyboard(),
        )

        await check_task_once(uid, user, t, context)
        return

    await q.message.reply_text("Неизвестное действие. Используйте /new или /tasks.", reply_markup=main_menu_keyboard())


async def render_wizard_step(q, user: UserState):
    if not user.wizard:
        await q.message.reply_text("Сессия выбора отсутствует. /new")
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

        buttons = [
            InlineKeyboardButton(d, callback_data=f"wiz:doci:{i}")
            for i, d in enumerate(descs)
        ]
        markup = InlineKeyboardMarkup(
            chunk_buttons(buttons, row=1) + [
                [InlineKeyboardButton("⬅️ Назад", callback_data="nav:back")],
                [InlineKeyboardButton("🏠 В основное меню", callback_data="nav:home")],
            ]
        )

        await q.message.reply_text(
            f"Специальность: {esp}\n\nВыберите врача (descripcion):",
            reply_markup=markup,
        )
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


async def check_task_once(uid: int, user: UserState, t: Task, context: ContextTypes.DEFAULT_TYPE):
    if not t.active:
        return

    if user.paciente is None:
        user.awaiting = "paciente"
        try:
            await context.bot.send_message(uid, "Введите номер пациента (paciente), чтобы продолжить мониторинг.")
        except Exception:
            pass
        return

    if user.token is None:
        user.awaiting = "token"
        try:
            await context.bot.send_message(uid, "Требуется актуальный access token (Bearer) для продолжения мониторинга. Пришлите token.")
        except Exception:
            pass
        return

    payload = {
        "codAcme": int(t.cod_acme) if str(t.cod_acme).isdigit() else t.cod_acme,
        "codInstancia": int(t.cod_instancia),
        "agendaId": None,
        "fecha": make_fecha_first_of_month(t.month, t.year),
        "paciente": int(user.paciente),
        "banda": "O",
        "tipoArea": "IEC",
        "institucion": 50,
        "plan": 94,
    }

    try:
        resp = fetch_turnos(user.token, payload)
    except Exception as e:
        if "Invalid token" in str(e):
            user.token = None
            user.awaiting = "token"
            try:
                await context.bot.send_message(uid, "❌ Token недействителен/истёк. Пришлите новый access token (Bearer), чтобы продолжить мониторинг.")
            except Exception:
                pass
            return
        log.warning("Error polling task %s for user %s: %s", t.task_id, uid, e)
        return

    if isinstance(resp, dict) and resp.get("errorMessage") == "Invalid token":
        user.token = None
        user.awaiting = "token"
        try:
            await context.bot.send_message(uid, "❌ Token недействителен/истёк. Пришлите новый access token (Bearer), чтобы продолжить мониторинг.")
        except Exception:
            pass
        return

    # ====== CHANGE #1 (Log response) ======
    log.info("[HA API] RESP %s", resp)

    if not isinstance(resp, list):
        return

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
        fecha = slot.get("fecha", "")
        hora = slot.get("hora", "")
        try:
            await context.bot.send_message(
                uid,
                f"Появилась запись к {t.especialidad} {slot_agenda} на {fecha} {hora}."
            )
        except Exception:
            pass


async def poll_tasks(context: ContextTypes.DEFAULT_TYPE):
    for uid, user in USERS.items():
        active_tasks = [t for t in user.tasks.values() if t.active]
        if not active_tasks:
            continue

        if user.paciente is None:
            user.awaiting = "paciente"
            try:
                await context.bot.send_message(uid, "Введите номер пациента (paciente), чтобы продолжить мониторинг.")
            except Exception:
                pass
            continue

        if user.token is None:
            user.awaiting = "token"
            try:
                await context.bot.send_message(uid, "Требуется актуальный access token (Bearer) для продолжения мониторинга. Пришлите token.")
            except Exception:
                pass
            continue

        for t in active_tasks:
            await check_task_once(uid, user, t, context)


# =========================
# MAIN
# =========================

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("new", cmd_new))
    app.add_handler(CommandHandler("tasks", cmd_tasks))

    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    app.job_queue.run_repeating(poll_tasks, interval=CHECK_INTERVAL_SECONDS, first=10)

    app.run_polling()


if __name__ == "__main__":
    main()