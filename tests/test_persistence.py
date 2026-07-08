"""Logic tests for the encrypted state persistence layer (feature 005).

Run from the repo root with the project dependencies installed:

    python -m unittest tests.test_persistence -v
"""
import os
import shutil
import stat
import sys
import tempfile
import unittest

# bot.py requires BOT_TOKEN at import; keep persistence off during import so the
# module never touches disk before a test configures its own key/path.
os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.pop("HA_CRED_KEY", None)

import bot  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.key = Fernet.generate_key()
        self.tmpdir = tempfile.mkdtemp()
        self.path = os.path.join(self.tmpdir, "state.enc")
        bot.FERNET = Fernet(self.key)
        bot.HA_STATE_PATH = self.path
        bot.USERS.clear()

    def tearDown(self):
        bot.USERS.clear()
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _seed_user_with_task(self):
        user = bot.UserState(paciente=111, plan=94, usuario="30111222", password="s3cr3t-PW")
        t = bot.Task(
            task_id="t1",
            especialidad="OFTALMOLOGIA",
            agenda_nombre="DR EXAMPLE",
            cod_acme="123",
            cod_instancia=5,
            month=3,
            year=2026,
            paciente=111,
            plan=94,
        )
        t.notified.add("DR EXAMPLE 02-MAR-26 10:00")
        t.notified.add("DR EXAMPLE 03-MAR-26 11:00")
        user.tasks[t.task_id] = t
        bot.USERS[42] = user
        return user, t

    def test_roundtrip_restores_state_and_notified_set(self):
        self._seed_user_with_task()
        bot.save_state()
        bot.USERS.clear()
        bot.load_state()

        self.assertIn(42, bot.USERS)
        u = bot.USERS[42]
        self.assertEqual(u.paciente, 111)
        self.assertEqual(u.plan, 94)
        self.assertEqual(u.usuario, "30111222")
        self.assertEqual(u.password, "s3cr3t-PW")
        self.assertIsNone(u.token)  # token is never persisted

        self.assertIn("t1", u.tasks)
        t = u.tasks["t1"]
        self.assertIsInstance(t.notified, set)
        self.assertEqual(
            t.notified,
            {"DR EXAMPLE 02-MAR-26 10:00", "DR EXAMPLE 03-MAR-26 11:00"},
        )
        self.assertEqual(t.paciente, 111)
        self.assertTrue(t.active)

    def test_credentials_not_plaintext_on_disk(self):
        self._seed_user_with_task()
        bot.save_state()
        with open(self.path, "rb") as f:
            raw = f.read()
        # Neither password nor DNI (usuario) may appear in the ciphertext file.
        self.assertNotIn(b"s3cr3t-PW", raw)
        self.assertNotIn(b"30111222", raw)
        # ...but the correct key recovers them.
        decrypted = Fernet(self.key).decrypt(raw)
        self.assertIn(b"s3cr3t-PW", decrypted)

    def test_token_not_persisted(self):
        user, _ = self._seed_user_with_task()
        user.token = "header.payload.signature-should-not-persist"
        bot.save_state()
        with open(self.path, "rb") as f:
            decrypted = Fernet(self.key).decrypt(f.read())
        self.assertNotIn(b"signature-should-not-persist", decrypted)
        bot.USERS.clear()
        bot.load_state()
        self.assertIsNone(bot.USERS[42].token)

    def test_key_absent_writes_nothing(self):
        self._seed_user_with_task()
        bot.FERNET = None
        bot.save_state()
        self.assertFalse(os.path.exists(self.path))
        bot.USERS.clear()
        bot.load_state()  # no-op
        self.assertEqual(bot.USERS, {})

    def test_corrupt_file_starts_empty(self):
        with open(self.path, "wb") as f:
            f.write(b"not-a-valid-fernet-token")
        bot.USERS.clear()
        bot.load_state()  # must not raise
        self.assertEqual(bot.USERS, {})

    def test_wrong_key_starts_empty(self):
        self._seed_user_with_task()
        bot.save_state()
        bot.FERNET = Fernet(Fernet.generate_key())  # rotated / mismatched key
        bot.USERS.clear()
        bot.load_state()  # InvalidToken tolerated
        self.assertEqual(bot.USERS, {})

    def test_only_active_tasks_persisted(self):
        user, _ = self._seed_user_with_task()
        cancelled = bot.Task(
            task_id="t2",
            especialidad="X",
            agenda_nombre="Y",
            cod_acme="1",
            cod_instancia=1,
            month=4,
            year=2026,
            paciente=111,
            plan=94,
            active=False,
        )
        user.tasks[cancelled.task_id] = cancelled
        bot.save_state()
        bot.USERS.clear()
        bot.load_state()
        self.assertIn("t1", bot.USERS[42].tasks)
        self.assertNotIn("t2", bot.USERS[42].tasks)

    def test_manual_token_user_persists_tasks_without_credentials(self):
        user = bot.UserState(paciente=222, plan=94)  # no usuario/password
        t = bot.Task(
            task_id="tm",
            especialidad="X",
            agenda_nombre="Y",
            cod_acme="1",
            cod_instancia=1,
            month=4,
            year=2026,
            paciente=222,
            plan=94,
        )
        user.tasks[t.task_id] = t
        bot.USERS[7] = user
        bot.save_state()
        bot.USERS.clear()
        bot.load_state()
        self.assertIn(7, bot.USERS)
        self.assertIsNone(bot.USERS[7].usuario)
        self.assertIsNone(bot.USERS[7].token)
        self.assertIn("tm", bot.USERS[7].tasks)

    def test_atomic_write_leaves_no_tmp_file(self):
        self._seed_user_with_task()
        bot.save_state()
        self.assertTrue(os.path.exists(self.path))
        self.assertFalse(os.path.exists(self.path + ".tmp"))

    @unittest.skipUnless(os.name == "posix", "POSIX file mode only")
    def test_state_file_written_0600(self):
        self._seed_user_with_task()
        bot.save_state()
        mode = stat.S_IMODE(os.stat(self.path).st_mode)
        self.assertEqual(mode, 0o600, f"state file mode {oct(mode)} is not 0600")

    def test_invalid_key_disables_persistence(self):
        # A non-empty but malformed HA_CRED_KEY must degrade to in-memory only
        # (return None), never raise at startup.
        saved = bot.HA_CRED_KEY
        try:
            bot.HA_CRED_KEY = "not-a-valid-fernet-key"
            self.assertIsNone(bot._init_state_cipher())
        finally:
            bot.HA_CRED_KEY = saved
        # And a save with FERNET disabled writes nothing.
        bot.FERNET = None
        self._seed_user_with_task()
        bot.save_state()
        self.assertFalse(os.path.exists(self.path))

    def test_todos_task_agenda_nombres_roundtrip(self):
        # A "Todos" monitor stores a list in agenda_nombres that drives a distinct
        # poll branch; it must survive save/load as a list.
        user = bot.UserState(paciente=333, plan=94, usuario="30333444", password="pw")
        t = bot.Task(
            task_id="ttodos",
            especialidad="OFTALMOLOGIA",
            agenda_nombre="Todos",
            cod_acme="9",
            cod_instancia=2,
            month=5,
            year=2026,
            paciente=333,
            plan=94,
            agenda_nombres=["DR ALPHA", "DR BETA"],
        )
        user.tasks[t.task_id] = t
        bot.USERS[99] = user
        bot.save_state()
        bot.USERS.clear()
        bot.load_state()
        restored = bot.USERS[99].tasks["ttodos"]
        self.assertEqual(restored.agenda_nombres, ["DR ALPHA", "DR BETA"])


if __name__ == "__main__":
    unittest.main()
