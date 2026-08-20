#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_NAME="ha-bot"
readonly COMPOSE_FILE="compose.production.yml"
readonly COMPOSE_SERVICE="bot"
readonly MANAGED_LABEL="io.github.kiaquila.ha-bot.managed"
readonly EXPECTED_NETWORK="${PROJECT_NAME}_default"
readonly EXPECTED_LEGACY_SERVICE="ha_bot.service"
readonly LEGACY_IMAGE_REPOSITORY="ghcr.io/kiaquila/ha_bot"
readonly LEGACY_IMAGE_SOURCE="https://github.com/kiaquila/ha_bot"
readonly CANONICAL_IMAGE_REPOSITORY="ghcr.io/kiaquila/ha-bot"
readonly CANONICAL_IMAGE_SOURCE="https://github.com/kiaquila/ha-bot"

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

die() {
  printf 'deploy-production: %s\n' "$*" >&2
  exit 1
}

require_uint() {
  local name="$1"
  local value="$2"
  case "$value" in
    ''|*[!0-9]*) die "$name must be a non-negative integer" ;;
  esac
}

image_identity_is_supported() {
  local ref="$1"
  local source="$2"
  [[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]] || return 1
  case "$source" in
    "$LEGACY_IMAGE_SOURCE")
      [[ "$ref" == "$LEGACY_IMAGE_REPOSITORY"@sha256:* ]]
      ;;
    "$CANONICAL_IMAGE_SOURCE")
      [[ "$ref" == "$CANONICAL_IMAGE_REPOSITORY"@sha256:* ]]
      ;;
    *)
      return 1
      ;;
  esac
}

HA_BOT_IMAGE="${HA_BOT_IMAGE:-}"
HA_BOT_IMAGE_SOURCE="${HA_BOT_IMAGE_SOURCE:-}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
HA_BOT_UID="${HA_BOT_UID:-}"
HA_BOT_GID="${HA_BOT_GID:-}"
HA_BOT_WAIT_TIMEOUT="${HA_BOT_WAIT_TIMEOUT:-60}"
HA_BOT_STABILITY_SECONDS="${HA_BOT_STABILITY_SECONDS:-10}"
LEGACY_SERVICE="${LEGACY_SERVICE:-}"

image_identity_is_supported "$HA_BOT_IMAGE" "$HA_BOT_IMAGE_SOURCE" ||
  die 'HA_BOT_IMAGE must be an immutable digest from a supported repository/source identity pair'
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || die 'DEPLOY_SHA must be a full Git commit SHA'
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] ||
  die 'the deploy checkout does not match DEPLOY_SHA'
[[ "$LEGACY_SERVICE" == "$EXPECTED_LEGACY_SERVICE" ]] ||
  die "LEGACY_SERVICE must be exactly $EXPECTED_LEGACY_SERVICE"
[[ -n "$HA_BOT_UID" && -n "$HA_BOT_GID" ]] ||
  die 'HA_BOT_UID and HA_BOT_GID are required'
require_uint HA_BOT_UID "$HA_BOT_UID"
require_uint HA_BOT_GID "$HA_BOT_GID"
require_uint HA_BOT_WAIT_TIMEOUT "$HA_BOT_WAIT_TIMEOUT"
require_uint HA_BOT_STABILITY_SECONDS "$HA_BOT_STABILITY_SECONDS"
(( HA_BOT_UID > 0 && HA_BOT_GID > 0 )) || die 'HA_BOT_UID and HA_BOT_GID must be non-root'
(( HA_BOT_WAIT_TIMEOUT > 0 )) || die 'HA_BOT_WAIT_TIMEOUT must be greater than zero'
(( HA_BOT_STABILITY_SECONDS <= 60 )) || die 'HA_BOT_STABILITY_SECONDS must not exceed 60'

readonly RUNTIME_DATA="$REPO_ROOT/runtime-data"
readonly DEPLOY_STATE_DIR="$REPO_ROOT/.deploy-state"
readonly STABLE_LEDGER="$DEPLOY_STATE_DIR/stable-images"
readonly DEPLOY_LOCK="$DEPLOY_STATE_DIR/deploy.lock"

[[ -r "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE is missing or unreadable"
[[ -f .env && ! -L .env && -r .env ]] || die '.env must be a readable regular file, not a symlink'
env_mode="$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env)"
[[ "$env_mode" =~ ^[0-7]{3,4}$ ]] || die 'could not validate .env permissions'
(( (8#$env_mode & 077) == 0 )) || die '.env must not be readable or writable by group or other users'
awk '
  /^[[:space:]]*(#|$)/ { next }
  {
    line = $0
    sub(/^[[:space:]]*(export[[:space:]]+)?/, "", line)
    if (line ~ /^BOT_TOKEN[[:space:]]*=/) {
      sub(/^BOT_TOKEN[[:space:]]*=[[:space:]]*/, "", line)
      sub(/[[:space:]]+#.*$/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line != "" && line != "\"\"" && line != "\047\047") found = 1
    }
  }
  END { exit(found ? 0 : 1) }
' .env || die '.env must contain a non-empty BOT_TOKEN value'

[[ ! -L "$RUNTIME_DATA" ]] || die 'runtime-data must not be a symlink'
[[ ! -L "$DEPLOY_STATE_DIR" ]] || die '.deploy-state must not be a symlink'
mkdir -p "$RUNTIME_DATA"
mkdir -p "$DEPLOY_STATE_DIR"
[[ -d "$RUNTIME_DATA" && -d "$DEPLOY_STATE_DIR" ]] || die 'deployment state paths must be directories'
chmod 0700 "$DEPLOY_STATE_DIR"
current_owner="$(stat -c '%u:%g' "$RUNTIME_DATA" 2>/dev/null || stat -f '%u:%g' "$RUNTIME_DATA")"
if [[ "$current_owner" != "$HA_BOT_UID:$HA_BOT_GID" ]]; then
  sudo -n chown "$HA_BOT_UID:$HA_BOT_GID" "$RUNTIME_DATA"
fi
sudo -n chmod 0750 "$RUNTIME_DATA"

[[ ! -L "$DEPLOY_LOCK" ]] || die 'the deployment lock must not be a symlink'
exec 9>"$DEPLOY_LOCK"
flock -n 9 || die 'another HA Bot deployment is already running'

foreign_snapshot="$(mktemp)"
project_containers="$(mktemp)"
running_containers="$(mktemp)"
all_containers="$(mktemp)"
image_candidates="$(mktemp)"
network_containers="$(mktemp)"
ledger_temp=""
cutover_started=0

cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  rm -f \
    "$foreign_snapshot" \
    "$project_containers" \
    "$running_containers" \
    "$all_containers" \
    "$image_candidates" \
    "$network_containers"
  if [[ -n "$ledger_temp" ]]; then
    rm -f "$ledger_temp"
  fi
  if (( status != 0 )); then
    if (( cutover_started )); then
      printf '%s\n' 'deploy-production: deployment failed after the legacy service was stopped; no systemd rollback was attempted' >&2
      compose ps >&2 || true
    else
      printf '%s\n' 'deploy-production: pre-cutover validation failed; the legacy service was not changed' >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

compose() {
  docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

docker version --format '{{.Server.Version}}' >/dev/null
compose version >/dev/null
command -v python3 >/dev/null || die 'python3 is required to validate the rendered Compose model'

export HA_BOT_IMAGE HA_BOT_UID HA_BOT_GID
compose config --quiet >/dev/null
configured_images="$(compose config --images)"
[[ "$configured_images" == "$HA_BOT_IMAGE" ]] ||
  die 'Compose must resolve to exactly HA_BOT_IMAGE'
compose config --format json | python3 -c '
import json
import os
import sys

config = json.load(sys.stdin)
runtime_data, expected_network, managed_label, expected_image, expected_user = sys.argv[1:]

def require(condition, message):
    if not condition:
        raise SystemExit(f"unsafe production Compose model: {message}")

require(set(config.get("services", {})) == {"bot"}, "expected exactly one bot service")
service = config["services"]["bot"]
for key in ("ports", "expose", "network_mode", "container_name", "devices", "cap_add", "pid", "ipc"):
    require(key not in service, f"service key {key} is forbidden")
require(not service.get("privileged", False), "privileged mode is forbidden")
require(service.get("image") == expected_image, "image does not match the requested digest")
require(service.get("platform") == "linux/arm64", "platform must be linux/arm64")
require(service.get("pull_policy") == "never", "Compose must use the pre-pulled image")
require(service.get("user") == expected_user, "container user does not match the deploy UID/GID")
require(service.get("read_only") is True, "root filesystem must be read-only")
require(service.get("cap_drop") == ["ALL"], "all Linux capabilities must be dropped")
require(service.get("security_opt") == ["no-new-privileges:true"], "no-new-privileges is required")
require(service.get("networks") == {"default": None}, "service must use only the project default network")
require(service.get("labels", {}).get(managed_label) == "true", "managed ownership label is required")

volumes = service.get("volumes", [])
require(len(volumes) == 1, "expected exactly one runtime-data bind mount")
volume = volumes[0]
require(volume.get("type") == "bind", "runtime storage must be a bind mount")
require(volume.get("target") == "/data", "runtime storage must mount at /data")
require(os.path.realpath(volume.get("source", "")) == os.path.realpath(runtime_data), "runtime bind source is unexpected")
# Compose releases differ on whether an explicit false survives JSON rendering.
# Reject an enabled value; the checked-in model still sets false and the script
# creates and validates the source directory before Compose is invoked.
require(volume.get("bind", {}).get("create_host_path") in (None, False), "Compose must not enable bind source creation")
require(not config.get("volumes"), "named or external volumes are forbidden")

networks = config.get("networks", {})
require(set(networks) == {"default"}, "expected exactly one project network")
network = networks["default"]
require(network.get("name") == expected_network, "project network name is unexpected")
require(not network.get("external", False), "external networks are forbidden")
' "$RUNTIME_DATA" "$EXPECTED_NETWORK" "$MANAGED_LABEL" "$HA_BOT_IMAGE" "$HA_BOT_UID:$HA_BOT_GID"

expected_image_id="$(docker image inspect --format '{{.Id}}' "$HA_BOT_IMAGE" 2>/dev/null)" ||
  die 'HA_BOT_IMAGE is not present locally; pull the exact digest before cutover'
[[ -n "$expected_image_id" ]] || die 'HA_BOT_IMAGE resolved to an empty image ID'
repo_digests="$(docker image inspect --format '{{join .RepoDigests " "}}' "$HA_BOT_IMAGE")"
case " $repo_digests " in
  *" $HA_BOT_IMAGE "*) ;;
  *) die 'the local image does not expose the requested repository digest' ;;
esac
image_source="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$HA_BOT_IMAGE")"
[[ "$image_source" == "$HA_BOT_IMAGE_SOURCE" ]] ||
  die 'the local image source label does not identify this repository'
image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$HA_BOT_IMAGE")"
[[ "$image_revision" == "$DEPLOY_SHA" ]] ||
  die 'the local image revision label does not match DEPLOY_SHA'
image_architecture="$(docker image inspect --format '{{.Architecture}}' "$HA_BOT_IMAGE")"
[[ "$image_architecture" == arm64 ]] || die 'HA_BOT_IMAGE must be built for linux/arm64'
image_healthcheck="$(docker image inspect --format '{{json .Config.Healthcheck}}' "$HA_BOT_IMAGE")"
python3 -c '
import json
import sys

healthcheck = json.loads(sys.argv[1])

def require(condition, message):
    if not condition:
        raise SystemExit(f"unsafe candidate image: {message}")

require(isinstance(healthcheck, dict), "image healthcheck is required")
require(healthcheck.get("Test") == ["CMD", "python", "healthcheck.py"], "image healthcheck command is unexpected")
require(healthcheck.get("Interval") == 30_000_000_000, "image healthcheck interval is unexpected")
require(healthcheck.get("Timeout") == 3_000_000_000, "image healthcheck timeout is unexpected")
require(healthcheck.get("StartPeriod") == 20_000_000_000, "image healthcheck start period is unexpected")
require(healthcheck.get("Retries") == 3, "image healthcheck retry count is unexpected")
' "$image_healthcheck"

# A pre-existing Compose project is accepted only when every container carries
# our explicit ownership label. This makes repeat deployments idempotent while
# refusing an unrelated project that happens to have the same name.
docker container ls --all \
  --filter "label=com.docker.compose.project=$PROJECT_NAME" \
  --no-trunc --format '{{.ID}}' >"$project_containers"
while IFS= read -r container_id; do
  [[ -n "$container_id" ]] || continue
  managed="$(docker container inspect --format "{{ index .Config.Labels \"$MANAGED_LABEL\" }}" "$container_id")"
  service="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_id")"
  [[ "$managed" == true && "$service" == "$COMPOSE_SERVICE" ]] ||
    die "Compose project-name collision detected for container $container_id"
done <"$project_containers"

validate_project_network() {
  local require_present="$1"
  local all_network_names network_names network_project network_role container_id container_project container_managed

  if ! all_network_names="$(docker network ls --format '{{.Name}}')"; then
    die 'could not enumerate the HA Bot project network'
  fi
  network_names="$(printf '%s\n' "$all_network_names" | awk -v expected="$EXPECTED_NETWORK" '$0 == expected')"
  if [[ -z "$network_names" ]]; then
    [[ "$require_present" == false ]] || die "expected network $EXPECTED_NETWORK is missing"
    return
  fi
  [[ "$network_names" == "$EXPECTED_NETWORK" ]] || die "network-name collision detected for $EXPECTED_NETWORK"
  if ! network_project="$(docker network inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$EXPECTED_NETWORK")"; then
    die "could not inspect network $EXPECTED_NETWORK"
  fi
  if ! network_role="$(docker network inspect --format '{{ index .Labels "com.docker.compose.network" }}' "$EXPECTED_NETWORK")"; then
    die "could not inspect network $EXPECTED_NETWORK"
  fi
  [[ "$network_project" == "$PROJECT_NAME" && "$network_role" == default ]] ||
    die "network-name collision detected for $EXPECTED_NETWORK"
  if ! docker network inspect \
    --format '{{range $id, $_ := .Containers}}{{$id}}{{"\n"}}{{end}}' \
    "$EXPECTED_NETWORK" >"$network_containers"; then
    die "could not enumerate containers attached to $EXPECTED_NETWORK"
  fi
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    if ! container_project="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")"; then
      die "could not inspect container $container_id attached to $EXPECTED_NETWORK"
    fi
    if ! container_managed="$(docker container inspect --format "{{ index .Config.Labels \"$MANAGED_LABEL\" }}" "$container_id")"; then
      die "could not inspect container $container_id attached to $EXPECTED_NETWORK"
    fi
    [[ "$container_project" == "$PROJECT_NAME" && "$container_managed" == true ]] ||
      die "foreign container $container_id is attached to $EXPECTED_NETWORK"
  done <"$network_containers"
}
validate_project_network false

existing_project_count="$(awk 'NF { count++ } END { print count + 0 }' "$project_containers")"
if [[ ! -e "$STABLE_LEDGER" && "$existing_project_count" == 0 ]]; then
  runtime_entry="$(find "$RUNTIME_DATA" -mindepth 1 -maxdepth 1 -print -quit)"
  [[ -z "$runtime_entry" ]] ||
    die 'runtime-data must be empty for the first container cutover'
fi

validate_stable_image() {
  local ref="$1"
  local stable_id stable_source stable_digests
  stable_id="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null)" ||
    die "stable image recorded in the deployment ledger is missing: $ref"
  [[ -n "$stable_id" ]] || die 'a stable image resolved to an empty image ID'
  stable_source="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$ref")"
  image_identity_is_supported "$ref" "$stable_source" ||
    die 'a stable image in the deployment ledger has an unsupported repository/source identity pair'
  stable_digests="$(docker image inspect --format '{{join .RepoDigests " "}}' "$ref")"
  case " $stable_digests " in
    *" $ref "*) ;;
    *) die 'a stable image in the deployment ledger does not expose its recorded digest' ;;
  esac
}

old_current=""
old_previous=""
if [[ -e "$STABLE_LEDGER" ]]; then
  [[ -f "$STABLE_LEDGER" && ! -L "$STABLE_LEDGER" && -r "$STABLE_LEDGER" ]] ||
    die 'the stable-image deployment ledger is not a readable regular file'
  ledger_lines="$(awk 'END { print NR }' "$STABLE_LEDGER")"
  [[ "$ledger_lines" == 2 ]] || die 'the stable-image deployment ledger is corrupt'
  ledger_first_key="$(awk -F= 'NR == 1 { print $1 }' "$STABLE_LEDGER")"
  ledger_second_key="$(awk -F= 'NR == 2 { print $1 }' "$STABLE_LEDGER")"
  [[ "$ledger_first_key" == current && "$ledger_second_key" == previous ]] ||
    die 'the stable-image deployment ledger is corrupt'
  old_current="$(awk -F= '$1 == "current" { sub(/^[^=]*=/, ""); print; exit }' "$STABLE_LEDGER")"
  old_previous="$(awk -F= '$1 == "previous" { sub(/^[^=]*=/, ""); print; exit }' "$STABLE_LEDGER")"
  [[ "$old_current" =~ @sha256:[0-9a-f]{64}$ ]] ||
    die 'the current stable-image ledger entry is invalid'
  validate_stable_image "$old_current"
  if [[ -n "$old_previous" ]]; then
    [[ "$old_previous" =~ @sha256:[0-9a-f]{64}$ ]] ||
      die 'the previous stable-image ledger entry is invalid'
    validate_stable_image "$old_previous"
  fi
fi

next_previous=""
if [[ -n "$old_current" && "$old_current" != "$HA_BOT_IMAGE" ]]; then
  next_previous="$old_current"
elif [[ -n "$old_previous" ]]; then
  next_previous="$old_previous"
fi

previous_image_id=""
if [[ -n "$next_previous" ]]; then
  previous_image_id="$(docker image inspect --format '{{.Id}}' "$next_previous")"
fi

# Snapshot only containers that are running now and are outside our project.
# Later verification addresses every snapshotted ID directly, so an unrelated
# stop, removal, or state transition makes the deployment fail.
: >"$foreign_snapshot"
if ! docker container ls --filter status=running --no-trunc --format '{{.ID}}' |
  LC_ALL=C sort >"$running_containers"; then
  die 'could not enumerate running containers before cutover'
fi
while IFS= read -r container_id; do
  [[ -n "$container_id" ]] || continue
  if ! project="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")"; then
    die "could not inspect container $container_id before cutover"
  fi
  [[ "$project" == "$PROJECT_NAME" ]] && continue
  if ! state="$(docker container inspect --format '{{.State.Status}}' "$container_id")"; then
    die "could not inspect foreign container $container_id before cutover"
  fi
  printf '%s\t%s\n' "$container_id" "$state" >>"$foreign_snapshot"
done <"$running_containers"

cutover_started=1
sudo -n systemctl disable --now "$LEGACY_SERVICE"

verify_legacy_service_disabled() {
  local active_state enabled_state
  active_state="$(sudo -n systemctl is-active "$LEGACY_SERVICE" 2>/dev/null || true)"
  [[ "$active_state" == inactive ]] || die 'the legacy systemd service is not inactive'
  enabled_state="$(sudo -n systemctl is-enabled "$LEGACY_SERVICE" 2>/dev/null || true)"
  [[ "$enabled_state" == disabled ]] || die 'the legacy systemd service is not disabled'
}
verify_legacy_service_disabled

compose up -d --wait --wait-timeout "$HA_BOT_WAIT_TIMEOUT"

docker container ls --all \
  --filter "label=com.docker.compose.project=$PROJECT_NAME" \
  --no-trunc --format '{{.ID}}' >"$project_containers"
container_count="$(awk 'NF { count++ } END { print count + 0 }' "$project_containers")"
[[ "$container_count" == 1 ]] || die "expected exactly one $PROJECT_NAME container"
bot_container_id="$(awk 'NF { print; exit }' "$project_containers")"

managed="$(docker container inspect --format "{{ index .Config.Labels \"$MANAGED_LABEL\" }}" "$bot_container_id")"
service="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$bot_container_id")"
project="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$bot_container_id")"
[[ "$managed" == true && "$service" == "$COMPOSE_SERVICE" && "$project" == "$PROJECT_NAME" ]] ||
  die 'the deployed container does not have the expected ownership labels'

actual_image_id="$(docker container inspect --format '{{.Image}}' "$bot_container_id")"
[[ "$actual_image_id" == "$expected_image_id" ]] || die 'the deployed container is not using HA_BOT_IMAGE'
state="$(docker container inspect --format '{{.State.Status}}' "$bot_container_id")"
running="$(docker container inspect --format '{{.State.Running}}' "$bot_container_id")"
[[ "$state" == running && "$running" == true ]] || die 'the deployed container is not running'
health="$(docker container inspect --format '{{.State.Health.Status}}' "$bot_container_id")"
[[ "$health" == healthy ]] || die 'the deployed container is not healthy'

published_ports="$(docker container inspect --format '{{json .HostConfig.PortBindings}}' "$bot_container_id")"
[[ "$published_ports" == null || "$published_ports" == '{}' ]] || die 'the deployed container publishes host ports'
networks="$(docker container inspect --format '{{range $name, $value := .NetworkSettings.Networks}}{{$name}} {{end}}' "$bot_container_id")"
networks="$(printf '%s\n' "$networks" | awk '{$1=$1; print}')"
[[ "$networks" == "$EXPECTED_NETWORK" ]] || die 'the deployed container is attached to a foreign network'
validate_project_network true

restart_count_before="$(docker container inspect --format '{{.RestartCount}}' "$bot_container_id")"
require_uint restart_count "$restart_count_before"
if (( HA_BOT_STABILITY_SECONDS > 0 )); then
  sleep "$HA_BOT_STABILITY_SECONDS"
fi
state="$(docker container inspect --format '{{.State.Status}}' "$bot_container_id")"
health="$(docker container inspect --format '{{.State.Health.Status}}' "$bot_container_id")"
restart_count_after="$(docker container inspect --format '{{.RestartCount}}' "$bot_container_id")"
[[ "$state" == running && "$health" == healthy && "$restart_count_after" == "$restart_count_before" ]] ||
  die 'the deployed container lost health or restarted during the stability window'

verify_foreign_containers() {
  local container_id expected_state actual_state
  while IFS=$'\t' read -r container_id expected_state; do
    [[ -n "$container_id" ]] || continue
    actual_state="$(docker container inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null)" ||
      die "foreign container $container_id disappeared"
    [[ "$actual_state" == "$expected_state" ]] ||
      die "foreign container $container_id changed state"
  done <"$foreign_snapshot"
}
verify_foreign_containers
verify_legacy_service_disabled

# Commit the stable-image ledger atomically before best-effort cleanup. Once
# this point is reached, the running digest has passed every acceptance check.
ledger_temp="$(mktemp "$DEPLOY_STATE_DIR/stable-images.XXXXXX")"
{
  printf 'current=%s\n' "$HA_BOT_IMAGE"
  printf 'previous=%s\n' "$next_previous"
} >"$ledger_temp"
chmod 0600 "$ledger_temp"
mv -f "$ledger_temp" "$STABLE_LEDGER"
ledger_temp=""

image_is_used() {
  local candidate="$1"
  local container_id used_image

  if ! docker container ls --all --no-trunc --format '{{.ID}}' >"$all_containers"; then
    printf 'deploy-production: warning: could not enumerate containers; retaining image %s\n' "$candidate" >&2
    return 0
  fi
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    if ! used_image="$(docker container inspect --format '{{.Image}}' "$container_id")"; then
      printf 'deploy-production: warning: could not inspect container %s; retaining image %s\n' "$container_id" "$candidate" >&2
      return 0
    fi
    [[ "$used_image" == "$candidate" ]] && return 0
  done <"$all_containers"
  return 1
}

# Retain the new stable image and one preceding stable image. A deletion
# candidate must satisfy both repository and OCI-source scopes. Only matching
# repository refs are removed, never --force and never a global prune.
if docker image ls --all --no-trunc --format '{{.ID}}' >"$image_candidates" &&
  LC_ALL=C sort -u -o "$image_candidates" "$image_candidates"; then
  while IFS= read -r image_id; do
    [[ -n "$image_id" ]] || continue
    [[ "$image_id" == "$expected_image_id" || ( -n "$previous_image_id" && "$image_id" == "$previous_image_id" ) ]] && continue
    if ! candidate_source="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$image_id")"; then
      printf 'deploy-production: warning: could not inspect image %s; retaining it\n' "$image_id" >&2
      continue
    fi
    if ! candidate_digests="$(docker image inspect --format '{{join .RepoDigests " "}}' "$image_id")"; then
      printf 'deploy-production: warning: could not inspect image refs for %s; retaining it\n' "$image_id" >&2
      continue
    fi
    scoped_refs=""
    for ref in $candidate_digests; do
      if image_identity_is_supported "$ref" "$candidate_source"; then
        scoped_refs="$scoped_refs $ref"
      fi
    done
    [[ -n "$scoped_refs" ]] || continue
    if image_is_used "$image_id"; then
      printf 'deploy-production: retaining in-use or unverifiable HA Bot image %s\n' "$image_id"
      continue
    fi
    for ref in $scoped_refs; do
      if ! docker image rm --no-prune "$ref"; then
        printf 'deploy-production: warning: could not remove stale HA Bot image ref %s; retaining it\n' "$ref" >&2
      fi
    done
  done <"$image_candidates"
else
  printf '%s\n' 'deploy-production: warning: could not enumerate images; skipping retention cleanup' >&2
fi

verify_foreign_containers
printf 'deploy-production: %s is running image %s\n' "$PROJECT_NAME" "$HA_BOT_IMAGE"
