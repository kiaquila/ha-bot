"""Local heartbeat writer and Docker liveness probe for the HA Bot worker."""

import os
import stat
import sys
import time


DEFAULT_HEARTBEAT_PATH = "/tmp/ha-bot-heartbeat"
DEFAULT_MAX_AGE_SECONDS = 90

PathLike = str | os.PathLike[str]


def configured_heartbeat_path() -> str:
    return os.environ.get("HA_HEALTHCHECK_PATH", DEFAULT_HEARTBEAT_PATH).strip()


def mark_heartbeat(path: PathLike | None = None) -> None:
    """Create or refresh a regular heartbeat file without following symlinks."""
    selected_path = configured_heartbeat_path() if path is None else path
    if not selected_path:
        raise OSError("heartbeat path is empty")
    flags = os.O_WRONLY | os.O_CREAT | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    descriptor = os.open(selected_path, flags, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise OSError("heartbeat path is not a regular file")
        os.utime(descriptor, None)
    finally:
        os.close(descriptor)


def is_heartbeat_fresh(
    path: PathLike,
    *,
    max_age_seconds: int,
    now: float | None = None,
) -> bool:
    """Return whether *path* is a regular, non-symlink, recent heartbeat."""
    if max_age_seconds <= 0:
        return False
    try:
        metadata = os.lstat(path)
    except OSError:
        return False
    if not stat.S_ISREG(metadata.st_mode):
        return False

    checked_at = time.time() if now is None else now
    age = checked_at - metadata.st_mtime
    return 0 <= age <= max_age_seconds


def main() -> int:
    path = configured_heartbeat_path()
    raw_max_age = os.environ.get(
        "HA_HEALTHCHECK_MAX_AGE_SECONDS",
        str(DEFAULT_MAX_AGE_SECONDS),
    ).strip()
    try:
        max_age_seconds = int(raw_max_age)
    except ValueError:
        max_age_seconds = 0

    if path and is_heartbeat_fresh(path, max_age_seconds=max_age_seconds):
        return 0
    print("healthcheck: worker heartbeat is missing or stale", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
