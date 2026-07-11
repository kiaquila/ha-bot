import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest


SOURCE = "https://github.com/kiaquila/ha_bot"
REPOSITORY = "ghcr.io/kiaquila/ha_bot"
DEPLOY_SHA = "d" * 40


def digest(char: str) -> str:
    return f"{REPOSITORY}@sha256:{char * 64}"


def image(image_id: str, ref: str, *, source: str = SOURCE) -> dict:
    return {
        "id": image_id,
        "source": source,
        "revision": DEPLOY_SHA,
        "architecture": "arm64",
        "repo_digests": [ref],
    }


class DeployProductionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        (self.root / "scripts").mkdir()
        shutil.copy2(
            Path(__file__).parents[1] / "scripts" / "deploy-production.sh",
            self.root / "scripts" / "deploy-production.sh",
        )
        (self.root / "compose.production.yml").write_text("services: {bot: {}}\n")
        (self.root / ".env").write_text("BOT_TOKEN=test-only-placeholder\n")
        (self.root / ".env").chmod(0o600)
        self.fakebin = self.root / "fakebin"
        self.fakebin.mkdir()
        self.state_path = self.root / "docker-state.json"
        self.log_path = self.root / "commands.log"
        self._write_fakes()

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _write_executable(self, name: str, contents: str) -> None:
        path = self.fakebin / name
        path.write_text(textwrap.dedent(contents).lstrip())
        path.chmod(0o755)

    def _write_fakes(self) -> None:
        self._write_executable(
            "flock",
            """
            #!/bin/sh
            exit 0
            """,
        )
        self._write_executable(
            "git",
            """
            #!/bin/sh
            [ "$1" = rev-parse ] && [ "$2" = HEAD ] || exit 2
            printf '%s\n' "$DEPLOY_SHA"
            """,
        )
        self._write_executable(
            "sudo",
            """
            #!/bin/sh
            printf 'sudo' >>"$COMMAND_LOG"
            for arg in "$@"; do printf ' <%s>' "$arg" >>"$COMMAND_LOG"; done
            printf '\n' >>"$COMMAND_LOG"
            if [ "$1" = -n ]; then shift; fi
            exec "$@"
            """,
        )
        self._write_executable(
            "systemctl",
            """
            #!/bin/sh
            printf 'systemctl' >>"$COMMAND_LOG"
            for arg in "$@"; do printf ' <%s>' "$arg" >>"$COMMAND_LOG"; done
            printf '\n' >>"$COMMAND_LOG"
            if [ "$1" = is-active ]; then printf 'inactive\n'; exit 3; fi
            if [ "$1" = is-enabled ]; then printf 'disabled\n'; exit 1; fi
            exit 0
            """,
        )
        self._write_executable(
            "docker",
            r'''
            #!/usr/bin/env python3
            import json
            import os
            from pathlib import Path
            import shlex
            import sys

            state_path = Path(os.environ["DOCKER_STATE"])
            log_path = Path(os.environ["COMMAND_LOG"])
            state = json.loads(state_path.read_text())
            args = sys.argv[1:]
            with log_path.open("a") as log:
                log.write("docker " + shlex.join(args) + "\n")

            def save():
                state_path.write_text(json.dumps(state))

            def find_image(target):
                for item in state["images"]:
                    if target == item["id"] or target in item["repo_digests"]:
                        return item
                return None

            def find_container(target):
                for item in state["containers"]:
                    if item["id"] == target:
                        return item
                return None

            if args[0] == "version":
                print("29.2.1")
                raise SystemExit(0)

            if args[0] == "compose":
                assert args[1:5] == ["--project-name", "ha-bot", "--file", "compose.production.yml"]
                command = args[5]
                rest = args[6:]
                if command == "version":
                    print("Docker Compose version v5")
                elif command == "config" and rest == ["--quiet"]:
                    pass
                elif command == "config" and rest == ["--images"]:
                    print(os.environ["HA_BOT_IMAGE"])
                elif command == "config" and rest == ["--format", "json"]:
                    service = {
                        "image": os.environ["HA_BOT_IMAGE"],
                        "platform": "linux/arm64",
                        "pull_policy": "never",
                        "user": f"{os.environ['HA_BOT_UID']}:{os.environ['HA_BOT_GID']}",
                        "read_only": True,
                        "cap_drop": ["ALL"],
                        "security_opt": ["no-new-privileges:true"],
                        "networks": {"default": None},
                        "labels": {"io.github.kiaquila.ha-bot.managed": "true"},
                        "volumes": [{
                            "type": "bind",
                            "source": str(Path.cwd() / "runtime-data"),
                            "target": "/data",
                        }],
                    }
                    if state.get("unsafe_compose_ports"):
                        service["ports"] = [{"published": "8000", "target": 8000}]
                    if state.get("unsafe_compose_create_host_path"):
                        service["volumes"][0]["bind"] = {"create_host_path": True}
                    print(json.dumps({
                        "services": {"bot": service},
                        "networks": {"default": {"name": "ha-bot_default"}},
                    }))
                elif command == "up":
                    assert rest == ["-d", "--wait", "--wait-timeout", os.environ.get("HA_BOT_WAIT_TIMEOUT", "60")]
                    if state.get("fail_up"):
                        raise SystemExit(42)
                    if state.get("mutate_foreign_on_up"):
                        for container in state["containers"]:
                            if container.get("project") != "ha-bot" and container["status"] == "running":
                                container["status"] = "exited"
                                break
                    state["containers"] = [c for c in state["containers"] if c.get("project") != "ha-bot"]
                    expected = find_image(os.environ["HA_BOT_IMAGE"])
                    state["containers"].append({
                        "id": "ha-container",
                        "project": "ha-bot",
                        "service": "bot",
                        "managed": "true",
                        "image": expected["id"],
                        "status": "running",
                        "running": True,
                        "restart_count": 0,
                        "ports": "{}",
                        "networks": ["ha-bot_default"],
                    })
                    state["network"] = {"project": "ha-bot", "role": "default"}
                    save()
                elif command == "ps":
                    print("NAME STATUS")
                else:
                    raise SystemExit(f"unsupported compose call: {args}")
                raise SystemExit(0)

            if args[:2] == ["network", "ls"]:
                if state.get("fail_network_list"):
                    raise SystemExit(63)
                if state.get("network") is not None:
                    print("ha-bot_default")
                raise SystemExit(0)

            if args[:2] == ["network", "inspect"]:
                network = state.get("network")
                if network is None:
                    raise SystemExit(1)
                fmt = args[args.index("--format") + 1]
                if ".Containers" in fmt:
                    for container in state["containers"]:
                        if "ha-bot_default" in container.get("networks", []):
                            print(container["id"])
                elif "project" in fmt:
                    print(network["project"])
                else:
                    print(network["role"])
                raise SystemExit(0)

            if args[:2] == ["image", "inspect"]:
                fmt = args[args.index("--format") + 1]
                item = find_image(args[-1])
                if item is None:
                    raise SystemExit(1)
                if fmt == "{{.Id}}":
                    print(item["id"])
                elif "org.opencontainers.image.source" in fmt:
                    print(item["source"])
                elif "org.opencontainers.image.revision" in fmt:
                    print(item["revision"])
                elif fmt == "{{.Architecture}}":
                    print(item["architecture"])
                elif ".RepoDigests" in fmt:
                    print(" ".join(item["repo_digests"]))
                else:
                    raise SystemExit(f"unsupported image format: {fmt}")
                raise SystemExit(0)

            if args[:2] == ["image", "ls"]:
                for item in state["images"]:
                    print(item["id"])
                raise SystemExit(0)

            if args[:2] == ["image", "rm"]:
                assert args[2] == "--no-prune"
                ref = args[3]
                state.setdefault("remove_attempts", []).append(ref)
                save()
                if ref in state.get("fail_remove_refs", []):
                    raise SystemExit(55)
                state.setdefault("removed_refs", []).append(ref)
                for item in state["images"]:
                    if ref in item["repo_digests"]:
                        item["repo_digests"].remove(ref)
                save()
                raise SystemExit(0)

            if args[:2] == ["container", "ls"]:
                if state.get("fail_running_container_list") and "status=running" in args:
                    raise SystemExit(61)
                if state.get("fail_all_container_list") and "--all" in args and "--filter" not in args:
                    raise SystemExit(62)
                containers = state["containers"]
                if "--filter" in args:
                    value = args[args.index("--filter") + 1]
                    if value == "status=running":
                        containers = [c for c in containers if c["status"] == "running"]
                    elif value == "label=com.docker.compose.project=ha-bot":
                        containers = [c for c in containers if c.get("project") == "ha-bot"]
                for item in containers:
                    print(item["id"])
                raise SystemExit(0)

            if args[:2] == ["container", "inspect"]:
                fmt = args[args.index("--format") + 1]
                item = find_container(args[-1])
                if item is None:
                    raise SystemExit(1)
                if "io.github.kiaquila.ha-bot.managed" in fmt:
                    print(item.get("managed", "<no value>"))
                elif "com.docker.compose.service" in fmt:
                    print(item.get("service", "<no value>"))
                elif "com.docker.compose.project" in fmt:
                    print(item.get("project", "<no value>"))
                elif fmt == "{{.State.Status}}":
                    print(item["status"])
                elif fmt == "{{.State.Running}}":
                    print(str(item.get("running", item["status"] == "running")).lower())
                elif fmt == "{{.RestartCount}}":
                    print(item.get("restart_count", 0))
                elif fmt == "{{.Image}}":
                    print(item["image"])
                elif ".HostConfig.PortBindings" in fmt:
                    print(item.get("ports", "{}"))
                elif ".NetworkSettings.Networks" in fmt:
                    print(" ".join(item.get("networks", [])) + " ")
                else:
                    raise SystemExit(f"unsupported container format: {fmt}")
                raise SystemExit(0)

            raise SystemExit(f"unsupported docker call: {args}")
            ''',
        )

    def _base_state(self, current_ref: str) -> dict:
        return {
            "images": [image("sha256:current", current_ref)],
            "containers": [
                {
                    "id": "foreign-running",
                    "project": "app",
                    "service": "web",
                    "image": "sha256:foreign",
                    "status": "running",
                    "running": True,
                    "restart_count": 0,
                    "ports": "{}",
                    "networks": ["app_default"],
                }
            ],
        }

    def _run(
        self,
        state: dict,
        current_ref: str,
        *,
        env_overrides: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        self.state_path.write_text(json.dumps(state))
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.fakebin}:{env['PATH']}",
                "DOCKER_STATE": str(self.state_path),
                "COMMAND_LOG": str(self.log_path),
                "HA_BOT_IMAGE": current_ref,
                "HA_BOT_IMAGE_SOURCE": SOURCE,
                "HA_BOT_UID": str(os.getuid()),
                "HA_BOT_GID": str(os.getgid()),
                "HA_BOT_STABILITY_SECONDS": "0",
                "HA_BOT_WAIT_TIMEOUT": "60",
                "DEPLOY_SHA": DEPLOY_SHA,
                "LEGACY_SERVICE": "ha_bot.service",
            }
        )
        if env_overrides:
            env.update(env_overrides)
        return subprocess.run(
            [str(self.root / "scripts" / "deploy-production.sh")],
            cwd=self.root,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def _log(self) -> str:
        return self.log_path.read_text() if self.log_path.exists() else ""

    def _state(self) -> dict:
        return json.loads(self.state_path.read_text())

    def test_script_has_no_global_or_foreign_mutation_commands(self) -> None:
        script = (self.root / "scripts" / "deploy-production.sh").read_text()
        executable = "\n".join(line.split("#", 1)[0] for line in script.splitlines())

        for forbidden in (
            "docker system prune",
            "docker image prune",
            "docker compose down",
            " --force",
            "systemctl start",
            "systemctl enable",
            "systemctl restart",
            "service docker restart",
            "shutdown",
            "reboot",
            "--project-name app",
            "--project-name deploy",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, executable)

    def test_successful_cutover_is_scoped_and_records_stable_image(self) -> None:
        current = digest("a")
        result = self._run(self._base_state(current), current)

        self.assertEqual(result.returncode, 0, result.stderr)
        log = self._log()
        prefix = "docker compose --project-name ha-bot --file compose.production.yml"
        self.assertIn(f"{prefix} config --quiet", log)
        self.assertIn(f"{prefix} up -d --wait --wait-timeout 60", log)
        self.assertIn("docker network ls --format", log)
        self.assertNotIn("docker network ls --filter", log)
        self.assertIn("systemctl <disable> <--now> <ha_bot.service>", log)
        self.assertEqual(
            log.count("systemctl <is-active> <ha_bot.service>"), 2
        )
        self.assertEqual(log.count("systemctl <is-enabled> <ha_bot.service>"), 2)
        self.assertNotIn("systemctl <start>", log)
        self.assertNotIn("docker system prune", log)
        marker = (self.root / ".deploy-state" / "stable-images").read_text()
        self.assertEqual(marker, f"current={current}\nprevious=\n")
        foreign = next(c for c in self._state()["containers"] if c["id"] == "foreign-running")
        self.assertEqual(foreign["status"], "running")

    def test_running_container_enumeration_failure_aborts_before_cutover(self) -> None:
        current = digest("0")
        state = self._base_state(current)
        state["fail_running_container_list"] = True

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("could not enumerate running containers", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_unsafe_rendered_compose_model_aborts_before_cutover(self) -> None:
        current = digest("8")
        state = self._base_state(current)
        state["unsafe_compose_ports"] = True

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("service key ports is forbidden", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_compose_cannot_enable_bind_source_creation(self) -> None:
        current = digest("7")
        state = self._base_state(current)
        state["unsafe_compose_create_host_path"] = True

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not enable bind source creation", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_non_bot_systemd_target_is_rejected_before_any_command(self) -> None:
        current = digest("5")

        result = self._run(
            self._base_state(current),
            current,
            env_overrides={"LEGACY_SERVICE": "docker.service"},
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be exactly ha_bot.service", result.stderr)
        self.assertFalse(self.log_path.exists())

    def test_foreign_image_scope_is_rejected_before_any_command(self) -> None:
        foreign_ref = "ghcr.io/example/other@sha256:" + "5" * 64

        result = self._run(self._base_state(foreign_ref), foreign_ref)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be an immutable digest from", result.stderr)
        self.assertFalse(self.log_path.exists())

    def test_failed_compose_up_leaves_systemd_disabled_without_rollback(self) -> None:
        current = digest("b")
        state = self._base_state(current)
        state["fail_up"] = True

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no systemd rollback was attempted", result.stderr)
        log = self._log()
        self.assertIn("systemctl <disable> <--now> <ha_bot.service>", log)
        self.assertNotIn("systemctl <start>", log)
        self.assertNotIn("systemctl <enable>", log)
        self.assertFalse((self.root / ".deploy-state" / "stable-images").exists())

    def test_foreign_container_state_change_fails_deployment(self) -> None:
        current = digest("c")
        state = self._base_state(current)
        state["mutate_foreign_on_up"] = True

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("foreign container foreign-running changed state", result.stderr)
        self.assertNotIn("systemctl <start>", self._log())

    def test_foreign_container_on_project_network_fails_before_cutover(self) -> None:
        current = digest("3")
        state = self._base_state(current)
        state["network"] = {"project": "ha-bot", "role": "default"}
        state["containers"][0]["networks"] = ["app_default", "ha-bot_default"]

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("foreign container foreign-running is attached", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_corrupt_stable_ledger_fails_before_systemd_cutover(self) -> None:
        current = digest("7")
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"previous={digest('8')}\ncurrent={digest('9')}\n"
        )

        result = self._run(self._base_state(current), current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deployment ledger is corrupt", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_image_revision_mismatch_fails_before_systemd_cutover(self) -> None:
        current = digest("5")
        state = self._base_state(current)
        state["images"][0]["revision"] = "e" * 40

        result = self._run(state, current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("revision label does not match", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_missing_ledger_image_fails_before_systemd_cutover(self) -> None:
        current = digest("4")
        missing = digest("3")
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"current={missing}\nprevious=\n"
        )

        result = self._run(self._base_state(current), current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("recorded in the deployment ledger is missing", result.stderr)
        self.assertNotIn("systemctl", self._log())
        self.assertNotIn(" up -d ", self._log())

    def test_insecure_env_permissions_fail_before_docker_or_systemd(self) -> None:
        current = digest("6")
        (self.root / ".env").chmod(0o644)

        result = self._run(self._base_state(current), current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(".env must not be readable", result.stderr)
        self.assertFalse(self.log_path.exists())

    def test_runtime_data_symlink_is_rejected_before_chown_or_cutover(self) -> None:
        current = digest("2")
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "runtime-data").symlink_to(outside, target_is_directory=True)

        result = self._run(self._base_state(current), current)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("runtime-data must not be a symlink", result.stderr)
        self.assertFalse(self.log_path.exists())

    def test_retention_keeps_current_previous_unrelated_and_in_use_images(self) -> None:
        current = digest("d")
        previous = digest("e")
        stale = digest("f")
        in_use = digest("1")
        retired = digest("9")
        unrelated = "ghcr.io/example/other@sha256:" + "2" * 64
        state = self._base_state(current)
        state["images"].extend(
            [
                image("sha256:previous", previous),
                image("sha256:stale", stale),
                image("sha256:in-use", in_use),
                image("sha256:retired", retired),
                image("sha256:unrelated", unrelated, source="https://github.com/example/other"),
            ]
        )
        state["containers"].append(
            {
                "id": "foreign-stopped",
                "project": "deploy",
                "service": "worker",
                "image": "sha256:in-use",
                "status": "exited",
                "running": False,
                "restart_count": 0,
                "ports": "{}",
                "networks": ["deploy_default"],
            }
        )
        runtime = self.root / "runtime-data"
        runtime.mkdir()
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"current={previous}\nprevious={retired}\n"
        )

        result = self._run(state, current)

        self.assertEqual(result.returncode, 0, result.stderr)
        removed = self._state().get("removed_refs", [])
        self.assertCountEqual(removed, [stale, retired])
        self.assertIn(f"docker image rm --no-prune {stale}", self._log())
        self.assertIn(f"docker image rm --no-prune {retired}", self._log())
        self.assertNotIn(in_use, removed)
        self.assertNotIn(unrelated, removed)
        marker = (deploy_state / "stable-images").read_text()
        self.assertEqual(marker, f"current={current}\nprevious={previous}\n")

    def test_same_digest_redeploy_preserves_previous_stable_image(self) -> None:
        current = digest("a")
        previous = digest("b")
        state = self._base_state(current)
        state["images"].append(image("sha256:previous", previous))
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"current={current}\nprevious={previous}\n"
        )

        result = self._run(state, current)

        self.assertEqual(result.returncode, 0, result.stderr)
        marker = (deploy_state / "stable-images").read_text()
        self.assertEqual(marker, f"current={current}\nprevious={previous}\n")
        self.assertNotIn(previous, self._state().get("removed_refs", []))

    def test_cleanup_failure_is_nonfatal_after_atomic_ledger_update(self) -> None:
        current = digest("c")
        previous = digest("d")
        stale = digest("e")
        state = self._base_state(current)
        state["images"].extend(
            [image("sha256:previous", previous), image("sha256:stale", stale)]
        )
        state["fail_remove_refs"] = [stale]
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"current={previous}\nprevious=\n"
        )

        result = self._run(state, current)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("warning: could not remove stale HA Bot image", result.stderr)
        marker = (deploy_state / "stable-images").read_text()
        self.assertEqual(marker, f"current={current}\nprevious={previous}\n")
        self.assertIn(stale, self._state()["remove_attempts"])
        self.assertNotIn(stale, self._state().get("removed_refs", []))

    def test_cleanup_retains_images_when_container_enumeration_fails(self) -> None:
        current = digest("a")
        previous = digest("b")
        stale = digest("c")
        state = self._base_state(current)
        state["images"].extend(
            [image("sha256:previous", previous), image("sha256:stale", stale)]
        )
        state["fail_all_container_list"] = True
        deploy_state = self.root / ".deploy-state"
        deploy_state.mkdir()
        (deploy_state / "stable-images").write_text(
            f"current={previous}\nprevious=\n"
        )

        result = self._run(state, current)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("could not enumerate containers; retaining image", result.stderr)
        self.assertNotIn(stale, self._state().get("remove_attempts", []))
        marker = (deploy_state / "stable-images").read_text()
        self.assertEqual(marker, f"current={current}\nprevious={previous}\n")


class DeploymentWorkflowTest(unittest.TestCase):
    @staticmethod
    def _workflow() -> str:
        return (
            Path(__file__).parents[1]
            / ".github"
            / "workflows"
            / "deploy-production.yml"
        ).read_text()

    def test_remote_pull_precedes_the_tested_cutover_script(self) -> None:
        workflow = self._workflow()

        login = workflow.index('docker --config "$docker_config" login ghcr.io')
        pull = workflow.index('docker --config "$docker_config" pull "$HA_BOT_IMAGE"')
        forget_token = workflow.index("unset GITHUB_REGISTRY_TOKEN")
        deploy = workflow.index("bash scripts/deploy-production.sh")
        self.assertLess(login, pull)
        self.assertLess(pull, forget_token)
        self.assertLess(forget_token, deploy)

    def test_remote_registry_auth_cleanup_handles_exit_and_signals(self) -> None:
        workflow = self._workflow()

        self.assertIn("trap cleanup_registry_auth EXIT", workflow)
        self.assertIn("trap 'exit 129' HUP", workflow)
        self.assertIn("trap 'exit 130' INT", workflow)
        self.assertIn("trap 'exit 143' TERM", workflow)
        self.assertIn('rm -rf "$docker_config"', workflow)


if __name__ == "__main__":
    unittest.main()
