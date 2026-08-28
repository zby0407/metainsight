#!/usr/bin/env bash

set -Eeuo pipefail

ADMIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@47.110.246.245}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
BASE_IMAGE="${BASE_IMAGE:-deer-flow-frontend-builder:user-admin}"
DOCKERFILE="${DOCKERFILE:-$ADMIN_DIR/Dockerfile.frontend-admin-overlay}"
BUILD_CONTEXT="${BUILD_CONTEXT:-$ADMIN_DIR}"
VERIFY_AGENT_HUB="${VERIFY_AGENT_HUB:-0}"
RELEASE_TAG="${RELEASE_TAG:-zhiheng-$(date -u +%Y%m%dT%H%M%SZ)}"
IMAGE="deer-flow-frontend:${RELEASE_TAG}"
REMOTE_COMPOSE="${REMOTE_COMPOSE:-/opt/oss-finance/deer-flow/docker/docker-compose.yaml}"
REMOTE_DEPLOY_HELPER="${REMOTE_DEPLOY_HELPER:-/opt/oss-finance/deer-flow/scripts/deploy.sh}"
PUBLIC_HOST="${PUBLIC_HOST:-mem.aieduspark.com}"

ssh_cmd=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$DEPLOY_HOST")

docker image inspect "$BASE_IMAGE" >/dev/null

echo "Building ${IMAGE} locally for linux/amd64..."
docker build \
  --platform linux/amd64 \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --file "$DOCKERFILE" \
  --tag "$IMAGE" \
  "$BUILD_CONTEXT"

test "$(docker image inspect "$IMAGE" --format '{{.Architecture}}')" = "amd64"
docker run --rm --platform linux/amd64 --entrypoint sh "$IMAGE" -lc \
  'test -f /app/frontend/.next/BUILD_ID \
    && test -f /app/frontend/public/images/zhiheng-mark.svg \
    && grep -q "singleTilde: false" /app/frontend/src/core/streamdown/plugins.ts \
    && grep -q "data-zhiheng-source-link" /app/frontend/src/components/workspace/messages/markdown-content.tsx \
    && grep -q "打开来源" /app/frontend/src/components/workspace/citations/citation-link.tsx \
    && grep -q "DsaAutoResearchPanel" /app/frontend/src/components/market/watchlist-workspace.tsx \
    && grep -q "ResearchNotificationCenter" /app/frontend/src/components/workspace/workspace-nav-menu.tsx'

if [ "$VERIFY_AGENT_HUB" = "1" ]; then
  docker run --rm --platform linux/amd64 --entrypoint sh "$IMAGE" -lc \
    'grep -q "PortfolioDashboard" /app/frontend/src/components/workspace/agents/agent-gallery.tsx \
      && grep -q "portfolio-dashboard" /app/frontend/src/core/finance/api.ts \
      && grep -q "PortfolioSetupWizard" /app/frontend/src/components/workspace/agents/portfolio-dashboard.tsx \
      && grep -q "createPortfolioWorkflowChatHref" /app/frontend/src/components/workspace/agents/portfolio-dashboard.tsx \
      && grep -q "autostart" /app/frontend/src/app/workspace/chats/\[thread_id\]/page.tsx \
      && ! grep -q "runs.wait" /app/frontend/src/core/finance/workflows.ts \
      && grep -q "normalizeAgentChatPrompt" /app/frontend/src/app/workspace/chats/\[thread_id\]/providers.tsx \
      && grep -q "投资智能体" /app/frontend/src/core/i18n/locales/zh-CN.ts \
      && ! grep -Eqi "deerflow" /app/frontend/src/core/i18n/locales/zh-CN.ts'
fi

echo "Checking production preconditions..."
"${ssh_cmd[@]}" bash -s -- "$REMOTE_COMPOSE" "$REMOTE_DEPLOY_HELPER" <<'REMOTE_PREFLIGHT'
set -Eeuo pipefail
compose_file="$1"
deploy_helper="$2"

if snap list docker >/dev/null 2>&1; then
  echo "Refusing deployment: duplicate Snap Docker is installed." >&2
  exit 1
fi

test "$(pgrep -xc dockerd)" -eq 1
test -S /run/docker.sock
docker info >/dev/null
test -f "$compose_file"
test -f "$deploy_helper"
bash -n "$deploy_helper"

if ps -eo args= | grep -Eq '[n]ext build|[p]npm build|[d]ocker build'; then
  echo "Refusing deployment: a build process is running on production." >&2
  exit 1
fi

available_kb=$(df --output=avail / | tail -1)
test "$available_kb" -ge 2097152
REMOTE_PREFLIGHT

echo "Streaming the prebuilt image to production (no remote build)..."
docker save "$IMAGE" | gzip -1 | "${ssh_cmd[@]}" 'gzip -dc | docker load'

echo "Switching the frontend with rollback protection..."
"${ssh_cmd[@]}" bash -s -- "$IMAGE" "$REMOTE_DEPLOY_HELPER" "$PUBLIC_HOST" <<'REMOTE_DEPLOY'
set -Eeuo pipefail
image="$1"
deploy_helper="$2"
public_host="$3"
rollback="deer-flow-frontend:rollback-$(date -u +%Y%m%dT%H%M%SZ)"

current_id=$(docker image inspect deer-flow-frontend:latest --format '{{.Id}}')
docker tag "$current_id" "$rollback"
docker tag "$image" deer-flow-frontend:latest

rollback_release() {
  echo "Health check failed; rolling back to ${rollback}." >&2
  docker tag "$rollback" deer-flow-frontend:latest
  docker rm -f deer-flow-frontend >/dev/null 2>&1 || true
  bash "$deploy_helper" start
}
trap rollback_release ERR

docker rm -f deer-flow-frontend >/dev/null
bash "$deploy_helper" start
test "$(docker inspect deer-flow-frontend --format '{{.Image}}')" = \
  "$(docker image inspect deer-flow-frontend:latest --format '{{.Id}}')"

for attempt in $(seq 1 30); do
  if body=$(curl -kfsS --max-time 10 "https://127.0.0.1/login" -H "Host: ${public_host}"); then
    if grep -q '知衡' <<<"$body" && ! grep -Eq 'DeerFlow|deer-flow' <<<"$body"; then
      trap - ERR
      echo "Deployment healthy: ${image}"
      exit 0
    fi
  fi
  sleep 2
done

false
REMOTE_DEPLOY
