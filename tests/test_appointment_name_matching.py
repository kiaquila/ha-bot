"""Regression tests for appointment doctor-name matching.

Run from the repository root:

    python3 -m unittest tests.test_appointment_name_matching -v
"""
import os
import unittest
from unittest.mock import patch


os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.pop("HA_CRED_KEY", None)

import bot  # noqa: E402


class RecordingTelegram:
    def __init__(self) -> None:
        self.messages: list[tuple[int, str]] = []

    async def send_message(self, chat_id: int, text: str) -> None:
        self.messages.append((chat_id, text))


class FakeContext:
    def __init__(self) -> None:
        self.bot = RecordingTelegram()


class AppointmentNameMatchingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_fernet = bot.FERNET
        bot.FERNET = None
        bot.USERS.clear()
        self.user = bot.UserState(paciente=123, token="test-access-token")
        self.context = FakeContext()
        self.slot = {
            "agendaNombre": "DRA ALVAREZ SOFIA",
            "fecha": "14-AUG-26",
            "hora": "09:00",
        }

    def tearDown(self) -> None:
        bot.USERS.clear()
        bot.FERNET = self.original_fernet

    def task(self, *, agenda_nombre: str, agenda_nombres: list[str] | None = None) -> bot.Task:
        return bot.Task(
            task_id="task-name-match",
            especialidad="ENDOCRINOLOGIA",
            agenda_nombre=agenda_nombre,
            cod_acme="1",
            cod_instancia=2,
            month=8,
            year=2026,
            paciente=123,
            agenda_nombres=agenda_nombres,
        )

    async def poll_once(
        self,
        task: bot.Task,
        slots: list[dict[str, str]] | None = None,
    ) -> None:
        with (
            patch.object(bot, "ensure_token", return_value="test-access-token"),
            patch.object(
                bot,
                "fetch_turnos",
                return_value=slots if slots is not None else [self.slot],
            ),
        ):
            await bot.check_task_once(999, self.user, task, self.context)

    def test_canonical_tokens_ignore_case_accents_punctuation_and_title(self) -> None:
        self.assertTrue(
            bot._matches_by_tokens("Dra. Álvarez, Sofía", "ALVAREZ SOFIA")
        )

    def test_canonical_tokens_keep_meaningful_name_boundary(self) -> None:
        self.assertFalse(
            bot._matches_by_tokens("Dra. Álvarez, Sofía", "ALVAREZ SUSANA")
        )

    async def test_canonical_equivalent_selected_doctor_notifies_once(self) -> None:
        task = self.task(agenda_nombre="Dra. Álvarez, Sofía")

        await self.poll_once(task)
        await self.poll_once(task)

        self.assertEqual(len(self.context.bot.messages), 1)
        self.assertIn("DRA ALVAREZ SOFIA", self.context.bot.messages[0][1])

    async def test_canonical_equivalent_todos_candidate_notifies(self) -> None:
        task = self.task(
            agenda_nombre="Todos",
            agenda_nombres=["Dra. Álvarez, Sofía"],
        )

        await self.poll_once(task)

        self.assertEqual(len(self.context.bot.messages), 1)

    async def test_different_doctor_is_rejected_with_safe_aggregate_diagnostic(self) -> None:
        task = self.task(agenda_nombre="Dra. Álvarez, Sofía")
        self.slot["agendaNombre"] = "ALVAREZ SUSANA"
        other_slot = {
            **self.slot,
            "agendaNombre": "RODRIGUEZ ANA",
            "fecha": "15-AUG-26",
        }

        with self.assertLogs("ha_bot", level="INFO") as captured:
            await self.poll_once(task, [self.slot, other_slot])

        output = "\n".join(captured.output)
        self.assertEqual(self.context.bot.messages, [])
        self.assertIn(
            "[HA API] skipped 2 slot(s): agenda name did not match selected agenda",
            output,
        )
        self.assertEqual(output.count("[HA API] skipped"), 1)
        self.assertNotIn("SOFIA", output)
        self.assertNotIn("SUSANA", output)
        self.assertNotIn("RODRIGUEZ", output)
        self.assertNotIn("14-AUG-26", output)
        self.assertNotIn("15-AUG-26", output)
        self.assertNotIn("123", output)
        self.assertNotIn("test-access-token", output)


if __name__ == "__main__":
    unittest.main()
