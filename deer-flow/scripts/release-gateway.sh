#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@47.110.246.245}"
REMOTE_ROOT="${REMOTE_ROOT:-/opt/oss-finance/deer-flow}"
SSH_KEY="${SSH_KEY:-/Users/zhuanz/Downloads/pipecat/.codex_mem0_ssh_key}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
APT_MIRROR="${APT_MIRROR:-mirrors.aliyun.com}"
GATEWAY_DOCKERFILE="${GATEWAY_DOCKERFILE:-backend/Dockerfile}"
BASE_IMAGE="${BASE_IMAGE:-deer-flow-gateway:latest}"
ALLOW_DIRTY_RELEASE="${ALLOW_DIRTY_RELEASE:-0}"
REUSE_REMOTE_IMAGE="${REUSE_REMOTE_IMAGE:-0}"

for command_name in docker git gzip scp ssh shasum; do
  command -v "${command_name}" >/dev/null || {
    printf 'release: missing command: %s\n' "${command_name}" >&2
    exit 1
  }
done
[[ -f "${SSH_KEY}" ]] || { printf 'release: SSH key not found\n' >&2; exit 1; }
[[ "${REMOTE_ROOT}" =~ ^/opt/[A-Za-z0-9._/-]+$ ]] || {
  printf 'release: unsafe remote root: %s\n' "${REMOTE_ROOT}" >&2
  exit 1
}

cd "${ROOT_DIR}"
test -f "${GATEWAY_DOCKERFILE}"
grep -q "run_dsa_automation_loop" backend/app/gateway/app.py
grep -q "dsa_automation.notification_router" backend/app/gateway/app.py
grep -q "market_proxy.router" backend/app/gateway/app.py
grep -q "news_proxy.router" backend/app/gateway/app.py
grep -q "news_preferences.router" backend/app/gateway/app.py
test -f backend/packages/harness/deerflow/persistence/migrations/versions/0004_dsa_auto_research.py
test -f backend/packages/harness/deerflow/persistence/migrations/versions/0005_dsa_tenant_isolation.py
test -f backend/packages/harness/deerflow/persistence/migrations/versions/0006_news_preferences.py

revision="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY_RELEASE}" != "1" ]]; then
  printf 'release: working tree is dirty; commit or set ALLOW_DIRTY_RELEASE=1\n' >&2
  exit 1
fi
source_digest="$({
  git diff --no-ext-diff --binary HEAD
  git ls-files --others --exclude-standard |
    LC_ALL=C sort |
    while IFS= read -r source_file; do
      [[ -f "${source_file}" ]] && shasum -a 256 "${source_file}"
    done
} | shasum -a 256 | awk '{print $1}')"
release_id="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${revision}-${source_digest:0:12}}"
[[ "${release_id}" =~ ^[A-Za-z0-9._-]+$ ]] || {
  printf 'release: invalid release id: %s\n' "${release_id}" >&2
  exit 1
}

release_image="deer-flow-gateway:release-${release_id}"
ssh_args=(-i "${SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=15)

if [[ "${REUSE_REMOTE_IMAGE}" == "1" && -z "${RELEASE_ID:-}" ]]; then
  printf 'release: REUSE_REMOTE_IMAGE requires an explicit RELEASE_ID\n' >&2
  exit 1
fi

if [[ "${REUSE_REMOTE_IMAGE}" == "1" ]]; then
  printf 'release: reusing previously transferred immutable image %s\n' "${release_image}"
  ssh "${ssh_args[@]}" "${REMOTE_HOST}" docker image inspect "${release_image}" >/dev/null
else
printf 'release: building %s for %s off-host\n' "${release_image}" "${TARGET_PLATFORM}"
docker buildx build \
  --platform "${TARGET_PLATFORM}" \
  --build-arg "APT_MIRROR=${APT_MIRROR}" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --load \
  --tag "${release_image}" \
  --file "${GATEWAY_DOCKERFILE}" \
  .

docker run --rm --platform "${TARGET_PLATFORM}" --entrypoint sh "${release_image}" -lc \
  'grep -q "run_dsa_automation_loop" /app/backend/app/gateway/app.py \
    && grep -q "dsa_automation.notification_router" /app/backend/app/gateway/app.py \
    && grep -q "market_proxy.router" /app/backend/app/gateway/app.py \
    && grep -q "news_proxy.router" /app/backend/app/gateway/app.py \
    && grep -q "news_preferences.router" /app/backend/app/gateway/app.py \
    && test -f /app/backend/packages/harness/deerflow/persistence/migrations/versions/0004_dsa_auto_research.py \
    && test -f /app/backend/packages/harness/deerflow/persistence/migrations/versions/0005_dsa_tenant_isolation.py \
    && test -f /app/backend/packages/harness/deerflow/persistence/migrations/versions/0006_news_preferences.py'

docker save "${release_image}" | gzip -1 | ssh "${ssh_args[@]}" "${REMOTE_HOST}" 'gzip -d | docker load'
fi
scp "${ssh_args[@]}" docker/docker-compose.yaml docker/docker-compose.finance.yaml \
  scripts/configure-production-compose.py "${REMOTE_HOST}:/tmp/"

ssh "${ssh_args[@]}" "${REMOTE_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${release_id}" "${release_image}" <<'REMOTE_RELEASE'
set -euo pipefail

remote_root="$1"
release_id="$2"
release_image="$3"
compose_dir="${remote_root}/docker"
environment_file="${remote_root}/.env"
backup_dir="/opt/backups/deer-flow-gateway-releases"
rollback_tag="deer-flow-gateway:rollback-release-${release_id}"
compose_backup="${backup_dir}/docker-compose.before-${release_id}.yaml"
database_path="${remote_root}/backend/.deer-flow/data/deerflow.db"
database_backup="${backup_dir}/deerflow.before-${release_id}.db"

mkdir -p "${backup_dir}"
docker image inspect deer-flow-gateway:latest >/dev/null
docker image inspect "${release_image}" >/dev/null
test -s "${database_path}"
install -m 0755 /tmp/configure-production-compose.py "${remote_root}/scripts/configure-production-compose.py"
python3 "${remote_root}/scripts/configure-production-compose.py" "${remote_root}"
cp "${compose_dir}/docker-compose.yaml" "${compose_backup}"
docker image tag deer-flow-gateway:latest "${rollback_tag}"
python3 - "${database_path}" "${database_backup}" <<'PY_BACKUP'
import sqlite3
import sys

source = sqlite3.connect(sys.argv[1])
backup = sqlite3.connect(sys.argv[2])
try:
    source.backup(backup)
finally:
    backup.close()
    source.close()
PY_BACKUP
test -s "${database_backup}"

rollback() {
  trap - ERR
  printf 'release: gateway health gate failed; rolling back to %s\n' "${rollback_tag}" >&2
  cd "${compose_dir}"
  docker compose --env-file "${environment_file}" -p deer-flow \
    -f docker-compose.yaml -f docker-compose.finance.yaml \
    stop gateway || true
  cp --preserve=mode,ownership,timestamps "${database_backup}" "${database_path}"
  docker image tag "${rollback_tag}" deer-flow-gateway:latest
  install -m 0644 "${compose_backup}" "${compose_dir}/docker-compose.yaml"
  docker compose --env-file "${environment_file}" -p deer-flow \
    -f docker-compose.yaml -f docker-compose.finance.yaml \
    up -d --no-build --force-recreate gateway || true
  exit 1
}
trap rollback ERR

install -m 0644 /tmp/docker-compose.yaml "${compose_dir}/docker-compose.yaml"
install -m 0644 /tmp/docker-compose.finance.yaml "${compose_dir}/docker-compose.finance.yaml"
docker image tag "${release_image}" deer-flow-gateway:latest
cd "${compose_dir}"
docker compose --env-file "${environment_file}" -p deer-flow \
  -f docker-compose.yaml -f docker-compose.finance.yaml config -q
docker compose --env-file "${environment_file}" -p deer-flow \
  -f docker-compose.yaml -f docker-compose.finance.yaml \
  up -d --no-build --force-recreate gateway

for attempt in $(seq 1 50); do
  if curl -fsS --max-time 8 http://127.0.0.1:2026/health >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" == "50" ]]; then
    docker logs --tail 200 deer-flow-gateway >&2
    exit 1
  fi
  sleep 3
done

admin_id="$(docker exec deer-flow-gateway sh -lc \
  'cd /app/backend && PYTHONPATH=. .venv/bin/python -c "import sqlite3; from deerflow.config.paths import get_paths; p=get_paths().base_dir / '\''data'\'' / '\''deerflow.db'\''; c=sqlite3.connect(p); r=c.execute('\''SELECT id FROM users WHERE system_role = \"admin\" ORDER BY created_at, id LIMIT 1'\'').fetchone(); print(r[0] if r else '\'''\'')"')"
if [[ -n "${admin_id}" ]]; then
  [[ "${admin_id}" =~ ^[A-Za-z0-9_-]+$ ]]
  docker exec deer-flow-gateway sh -lc \
    "cd /app/backend && PYTHONPATH=. .venv/bin/python scripts/migrate_user_isolation.py --user-id '${admin_id}'"
fi

docker exec deer-flow-gateway sh -lc \
  'cd /app/backend \
    && PYTHONPATH=. .venv/bin/python -c "from app.gateway.app import app; paths={r.path for r in app.routes}; assert \"/api/v1/notifications\" in paths; assert \"/api/v1/dsa-automation/settings\" in paths; assert \"/api/v1/market/{path:path}\" in paths; assert \"/api/v1/news/{path:path}\" in paths; assert \"/api/v1/news-preferences\" in paths" \
    && PYTHONPATH=. .venv/bin/python -c "import sqlite3; from deerflow.config.paths import get_paths; c=sqlite3.connect(get_paths().base_dir / '\''data'\'' / '\''deerflow.db'\''); tables={r[0] for r in c.execute('\''SELECT name FROM sqlite_master WHERE type=\"table\"'\'')}; assert {'\''zhiheng_dsa_tenant_watchlist'\'', '\''zhiheng_dsa_tenant_tasks'\'', '\''zhiheng_dsa_legacy_imports'\'', '\''zhiheng_news_preferences'\''} <= tables" \
    && test -s /app/backend/.deer-flow/data/deerflow.db'
docker logs --since 3m deer-flow-gateway 2>&1 | grep -q 'DSA automation loop started'
trap - ERR

printf 'release: deployed gateway %s\n' "${release_id}"
REMOTE_RELEASE

printf 'release: success %s source=%s\n' "${release_id}" "${source_digest}"
