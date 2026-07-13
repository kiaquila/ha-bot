"""Tests for the local worker heartbeat and image healthcheck contract."""

import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch


os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.pop("HA_CRED_KEY", None)

import bot  # noqa: E402
import healthcheck  # noqa: E402


class HeartbeatProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.path = Path(self.tempdir.name) / "heartbeat"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_mark_heartbeat_creates_a_fresh_regular_file(self) -> None:
        healthcheck.mark_heartbeat(self.path)

        self.assertTrue(self.path.is_file())
        self.assertTrue(
            healthcheck.is_heartbeat_fresh(self.path, max_age_seconds=90)
        )

    def test_probe_rejects_missing_heartbeat(self) -> None:
        self.assertFalse(
            healthcheck.is_heartbeat_fresh(self.path, max_age_seconds=90)
        )

    def test_probe_rejects_stale_heartbeat(self) -> None:
        self.path.touch()
        os.utime(self.path, (100, 100))

        self.assertFalse(
            healthcheck.is_heartbeat_fresh(
                self.path,
                max_age_seconds=90,
                now=191,
            )
        )

    def test_probe_rejects_future_dated_heartbeat(self) -> None:
        self.path.touch()
        os.utime(self.path, (200, 200))

        self.assertFalse(
            healthcheck.is_heartbeat_fresh(
                self.path,
                max_age_seconds=90,
                now=199,
            )
        )

    def test_probe_rejects_directory_and_symlink(self) -> None:
        directory = Path(self.tempdir.name) / "directory"
        directory.mkdir()
        self.path.symlink_to(directory)

        self.assertFalse(
            healthcheck.is_heartbeat_fresh(directory, max_age_seconds=90)
        )
        self.assertFalse(
            healthcheck.is_heartbeat_fresh(self.path, max_age_seconds=90)
        )

    def test_environment_configures_the_writer_and_probe_path_together(self) -> None:
        with patch.dict(
            os.environ,
            {
                "HA_HEALTHCHECK_PATH": str(self.path),
                "HA_HEALTHCHECK_MAX_AGE_SECONDS": "90",
            },
        ):
            healthcheck.mark_heartbeat()

            self.assertEqual(healthcheck.main(), 0)


class FakeJobQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[object, int, int]] = []

    def run_repeating(self, callback, *, interval: int, first: int) -> None:
        self.calls.append((callback, interval, first))


class BotHeartbeatSchedulingTests(unittest.IsolatedAsyncioTestCase):
    def test_schedule_uses_bounded_interval_without_pre_init_success(self) -> None:
        queue = FakeJobQueue()

        with patch.object(bot, "mark_heartbeat") as mark:
            bot.schedule_healthcheck(queue)

        mark.assert_not_called()
        self.assertEqual(
            queue.calls,
            [(bot.healthcheck_heartbeat, 30, 10)],
        )

    async def test_job_callback_refreshes_heartbeat(self) -> None:
        with patch.object(bot, "mark_heartbeat") as mark:
            await bot.healthcheck_heartbeat(object())

        mark.assert_called_once_with()

    async def test_task_polling_records_progress_between_tasks(self) -> None:
        original_users = bot.USERS.copy()
        user = bot.UserState(token="test-access-token")
        user.tasks = {
            "one": SimpleNamespace(active=True),
            "two": SimpleNamespace(active=True),
        }
        bot.USERS.clear()
        bot.USERS[123] = user
        try:
            with (
                patch.object(bot, "ensure_token", return_value=user.token),
                patch.object(bot, "check_task_once", new_callable=AsyncMock),
                patch.object(bot, "mark_heartbeat") as mark,
                patch.object(bot, "save_state"),
            ):
                await bot.poll_tasks(object())

            self.assertEqual(mark.call_count, 2)
        finally:
            bot.USERS.clear()
            bot.USERS.update(original_users)


class DockerHealthcheckContractTests(unittest.TestCase):
    def test_image_defines_local_exec_form_healthcheck(self) -> None:
        root = Path(__file__).parents[1]
        dockerfile = (root / "Dockerfile").read_text()
        dockerignore = (root / ".dockerignore").read_text().splitlines()

        self.assertIn("!healthcheck.py", dockerignore)
        self.assertIn("COPY --chown=65532:65532 bot.py healthcheck.py", dockerfile)
        self.assertIn("HEALTHCHECK --interval=30s --timeout=3s", dockerfile)
        self.assertIn('CMD ["python", "healthcheck.py"]', dockerfile)
        healthcheck_block = dockerfile[dockerfile.index("HEALTHCHECK"):]
        self.assertNotIn("http://", healthcheck_block)
        self.assertNotIn("https://", healthcheck_block)


if __name__ == "__main__":
    unittest.main()
