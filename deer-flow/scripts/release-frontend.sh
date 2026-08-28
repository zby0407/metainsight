#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@47.110.246.245}"
REMOTE_ROOT="${REMOTE_ROOT:-/opt/oss-finance/deer-flow}"
SSH_KEY="${SSH_KEY:-/Users/zhuanz/Downloads/pipecat/.codex_mem0_ssh_key}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
ALLOW_DIRTY_RELEASE="${ALLOW_DIRTY_RELEASE:-0}"
REUSE_REMOTE_IMAGE="${REUSE_REMOTE_IMAGE:-0}"

for command_name in docker git gzip scp ssh shasum; do
  command -v "${command_name}" >/dev/null || {
    printf 'release: missing command: %s\n' "${command_name}" >&2
    exit 1
  }
done
if [[ ! -f "${SSH_KEY}" ]]; then
  printf 'release: SSH key not found: %s\n' "${SSH_KEY}" >&2
  exit 1
fi
if [[ ! "${REMOTE_ROOT}" =~ ^/opt/[A-Za-z0-9._/-]+$ ]]; then
  printf 'release: unsafe remote root: %s\n' "${REMOTE_ROOT}" >&2
  exit 1
fi

cd "${ROOT_DIR}"
grep -q "ResearchNotificationCenter" frontend/src/components/workspace/workspace-nav-menu.tsx
grep -q "useNotification" frontend/src/components/workspace/research-notification-center.tsx
grep -q "DsaAutoResearchPanel" frontend/src/components/market/watchlist-workspace.tsx
grep -q 'DSA_API = "/api/v1/market"' frontend/src/components/market/watchlist-workspace.tsx
grep -q 'NEWS_API_BASE = "/api/v1/news"' frontend/src/core/finance/news.ts
if rg -n '"/finance-api/|`/finance-api/' frontend/src --glob '*.{ts,tsx}' >/dev/null; then
  printf 'release: frontend still contains a direct finance-api route\n' >&2
  exit 1
fi
test -f frontend/src/core/auth/account-storage.ts
revision="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY_RELEASE}" != "1" ]]; then
  printf 'release: working tree is dirty; commit the release or set ALLOW_DIRTY_RELEASE=1 for an audited emergency release\n' >&2
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
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release_id="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${revision}-${source_digest:0:12}}"
if [[ ! "${release_id}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf 'release: invalid release id: %s\n' "${release_id}" >&2
  exit 1
fi

release_image="deer-flow-frontend:release-${release_id}"
ssh_args=(-i "${SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=15)

if [[ "${REUSE_REMOTE_IMAGE}" == "1" && -z "${RELEASE_ID:-}" ]]; then
  printf 'release: REUSE_REMOTE_IMAGE requires an explicit RELEASE_ID\n' >&2
  exit 1
fi

if [[ "${REUSE_REMOTE_IMAGE}" == "1" ]]; then
  printf 'release: reusing previously transferred immutable image %s\n' "${release_image}"
  docker image inspect "${release_image}" >/dev/null
  ssh "${ssh_args[@]}" "${REMOTE_HOST}" docker image inspect "${release_image}" >/dev/null
else
printf 'release: building %s for %s off-host\n' "${release_image}" "${TARGET_PLATFORM}"
docker buildx build \
  --platform "${TARGET_PLATFORM}" \
  --load \
  --target prod \
  --build-arg "NPM_REGISTRY=${NPM_REGISTRY}" \
  --build-arg "RELEASE_CREATED=${created_at}" \
  --build-arg "RELEASE_REVISION=${revision}" \
  --build-arg "RELEASE_SOURCE_DIGEST=${source_digest}" \
  --tag "${release_image}" \
  --file frontend/Dockerfile \
  .

docker save "${release_image}" | gzip -1 | ssh "${ssh_args[@]}" "${REMOTE_HOST}" 'gzip -d | docker load'
fi
scp "${ssh_args[@]}" docker/docker-compose.yaml docker/docker-compose.finance.yaml \
  scripts/configure-production-compose.py \
  "${REMOTE_HOST}:/tmp/"

ssh "${ssh_args[@]}" "${REMOTE_HOST}" bash -s -- \
  "${REMOTE_ROOT}" "${release_id}" "${release_image}" <<'REMOTE_RELEASE'
set -euo pipefail

remote_root="$1"
release_id="$2"
release_image="$3"
compose_dir="${remote_root}/docker"
environment_file="${remote_root}/.env"
backup_dir="/opt/backups/deer-flow-frontend-releases"
rollback_tag="deer-flow-frontend:rollback-release-${release_id}"
compose_backup="${backup_dir}/docker-compose.before-${release_id}.yaml"

mkdir -p "${backup_dir}"
docker image inspect deer-flow-frontend:latest >/dev/null
docker image inspect "${release_image}" >/dev/null
install -m 0755 /tmp/configure-production-compose.py "${remote_root}/scripts/configure-production-compose.py"
python3 "${remote_root}/scripts/configure-production-compose.py" "${remote_root}"
cp "${compose_dir}/docker-compose.yaml" "${compose_backup}"
docker image tag deer-flow-frontend:latest "${rollback_tag}"

rollback() {
  printf 'release: frontend health gate failed; rolling back to %s\n' "${rollback_tag}" >&2
  docker image tag "${rollback_tag}" deer-flow-frontend:latest
  install -m 0644 "${compose_backup}" "${compose_dir}/docker-compose.yaml"
  cd "${compose_dir}"
  docker compose --env-file "${environment_file}" -p deer-flow \
    -f docker-compose.yaml -f docker-compose.finance.yaml \
    up -d --no-build --force-recreate frontend || true
  docker exec deer-flow-nginx nginx -s reload || true
}
trap rollback ERR

install -m 0644 /tmp/docker-compose.yaml "${compose_dir}/docker-compose.yaml"
install -m 0644 /tmp/docker-compose.finance.yaml "${compose_dir}/docker-compose.finance.yaml"
docker image tag "${release_image}" deer-flow-frontend:latest
cd "${compose_dir}"
docker compose --env-file "${environment_file}" -p deer-flow \
  -f docker-compose.yaml -f docker-compose.finance.yaml config -q
docker compose --env-file "${environment_file}" -p deer-flow \
  -f docker-compose.yaml -f docker-compose.finance.yaml \
  up -d --no-build --force-recreate frontend

for attempt in $(seq 1 36); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' deer-flow-frontend)"
  if [[ "${health}" == "healthy" ]]; then
    break
  fi
  if [[ "${health}" == "unhealthy" || "${attempt}" == "36" ]]; then
    printf 'release: frontend health gate failed with status %s\n' "${health}" >&2
    exit 1
  fi
  sleep 5
done

docker exec deer-flow-nginx nginx -t
docker exec deer-flow-nginx nginx -s reload
docker exec deer-flow-frontend sh -lc \
  'grep -R -q "/api/v1/news" /app/frontend/.next \
    && grep -R -q "新闻资讯" /app/frontend/.next'
login_status="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://mem.aieduspark.com/login)"
news_status="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://mem.aieduspark.com/workspace/news)"
[[ "${login_status}" == "200" ]]
[[ "${news_status}" == "307" || "${news_status}" == "200" ]]
trap - ERR

mapfile -t obsolete_release_tags < <(
  docker image ls deer-flow-frontend --format '{{.Repository}}:{{.Tag}}' |
    grep -E '^deer-flow-frontend:(release-|rollback-release-)' |
    grep -Fvx "${release_image}" |
    grep -Fvx "${rollback_tag}" || true
)
if ((${#obsolete_release_tags[@]})); then
  docker image rm "${obsolete_release_tags[@]}" >/dev/null || true
fi

printf 'release: deployed frontend %s\n' "${release_id}"
REMOTE_RELEASE

printf 'release: success %s source=%s\n' "${release_id}" "${source_digest}"
