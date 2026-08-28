#!/usr/bin/env bash

set -Eeuo pipefail

ADMIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@47.110.246.245}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
BASE_IMAGE="${BASE_IMAGE:-deer-flow-gateway:latest}"
DOCKERFILE="${DOCKERFILE:-$ADMIN_DIR/Dockerfile.gateway-admin-overlay}"
BUILD_CONTEXT="${BUILD_CONTEXT:-$ADMIN_DIR}"
VERIFY_FINANCE_DASHBOARD="${VERIFY_FINANCE_DASHBOARD:-0}"
RELEASE_TAG="${RELEASE_TAG:-zhiheng-$(date -u +%Y%m%dT%H%M%SZ)}"
IMAGE="deer-flow-gateway:${RELEASE_TAG}"
REMOTE_DEPLOY_HELPER="${REMOTE_DEPLOY_HELPER:-/opt/oss-finance/deer-flow/scripts/deploy.sh}"

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
  "grep -q 'title=\"知衡 API Gateway\"' /app/backend/app/gateway/app.py && \
   grep -q 'run_dsa_automation_loop' /app/backend/app/gateway/app.py && \
   test -f /app/backend/packages/harness/deerflow/persistence/migrations/versions/0004_dsa_auto_research.py && \
   ! grep -Eq 'DeerFlow|deer-flow' /app/backend/app/gateway/app.py"

if [ "$VERIFY_FINANCE_DASHBOARD" = "1" ]; then
  docker run --rm --platform linux/amd64 --entrypoint sh "$IMAGE" -lc \
    "test -f /app/backend/app/gateway/routers/finance_portfolios.py && \
     test -f /app/backend/packages/harness/deerflow/community/finance_agent/bridge.py && \
     grep -q 'portfolio-dashboard' /app/backend/app/gateway/routers/finance_portfolios.py && \
     grep -q 'portfolio-setup' /app/backend/app/gateway/routers/finance_portfolios.py"
fi

echo "Checking production preconditions..."
"${ssh_cmd[@]}" bash -s -- "$REMOTE_DEPLOY_HELPER" <<'REMOTE_PREFLIGHT'
set -Eeuo pipefail
deploy_helper="$1"

if snap list docker >/dev/null 2>&1; then
  echo "Refusing deployment: duplicate Snap Docker is installed." >&2
  exit 1
fi

test "$(pgrep -xc dockerd)" -eq 1
test -S /run/docker.sock
docker info >/dev/null
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

echo "Switching the gateway with rollback protection..."
"${ssh_cmd[@]}" bash -s -- "$IMAGE" "$REMOTE_DEPLOY_HELPER" <<'REMOTE_DEPLOY'
set -Eeuo pipefail
image="$1"
deploy_helper="$2"
rollback="deer-flow-gateway:rollback-$(date -u +%Y%m%dT%H%M%SZ)"

current_id=$(docker image inspect deer-flow-gateway:latest --format '{{.Id}}')
docker tag "$current_id" "$rollback"
docker tag "$image" deer-flow-gateway:latest

rollback_release() {
  echo "Health check failed; rolling back to ${rollback}." >&2
  docker tag "$rollback" deer-flow-gateway:latest
  docker rm -f deer-flow-gateway >/dev/null 2>&1 || true
  bash "$deploy_helper" start
}
trap rollback_release ERR

docker rm -f deer-flow-gateway >/dev/null
bash "$deploy_helper" start
test "$(docker inspect deer-flow-gateway --format '{{.Image}}')" = \
  "$(docker image inspect deer-flow-gateway:latest --format '{{.Id}}')"

for attempt in $(seq 1 60); do
  gateway_ip=$(docker inspect deer-flow-gateway \
    --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}')
  if openapi=$(curl -fsS --max-time 10 "http://${gateway_ip}:8001/openapi.json"); then
    if grep -q '知衡 API Gateway' <<<"$openapi" && \
       grep -q '/api/v1/dsa-automation/settings' <<<"$openapi" && \
       grep -q '/api/v1/notifications' <<<"$openapi" && \
       grep -q '/api/finance/portfolio-dashboard' <<<"$openapi" && \
       grep -q '/api/finance/portfolio-setup' <<<"$openapi" && \
       ! grep -Eq 'DeerFlow|deer-flow' <<<"$openapi"; then
      trap - ERR
      echo "Deployment healthy: ${image}"
      exit 0
    fi
  fi
  sleep 2
done

false
REMOTE_DEPLOY
