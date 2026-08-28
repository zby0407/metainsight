#!/usr/bin/env bash
set -euo pipefail

TEST_HOME=/tmp/deerflow-admin-test
TEST_PASSWORD='AdminTest-7xQ!92'
ROOT=/opt/oss-finance/deer-flow

docker run --rm \
  --env-file "$ROOT/.env" \
  -v "$ROOT/config.yaml":/app/backend/config.yaml:ro \
  -v "$TEST_HOME":/app/backend/.deer-flow \
  -e DEER_FLOW_PROJECT_ROOT=/app \
  -e DEER_FLOW_HOME=/app/backend/.deer-flow \
  -e DEER_FLOW_CONFIG_PATH=/app/backend/config.yaml \
  deer-flow-gateway:user-admin \
  sh -c "cd /app/backend && PYTHONPATH=. uv run --no-sync python -c 'import asyncio; from deerflow.config.app_config import get_app_config; from deerflow.persistence.engine import init_engine_from_config; asyncio.run(init_engine_from_config(get_app_config().database))'"

docker run --rm \
  --env-file "$ROOT/.env" \
  -v "$ROOT/config.yaml":/app/backend/config.yaml:ro \
  -v "$TEST_HOME":/app/backend/.deer-flow \
  -e TEST_PASSWORD="$TEST_PASSWORD" \
  deer-flow-gateway:user-admin \
  sh -c "cd /app/backend && PYTHONPATH=. uv run --no-sync python -c 'import os, sqlite3; from app.gateway.auth.password import hash_password; db=sqlite3.connect(\".deer-flow/data/deerflow.db\"); db.execute(\"update users set password_hash=?, token_version=0, needs_setup=0, is_active=1 where system_role=\\\"admin\\\"\", (hash_password(os.environ[\"TEST_PASSWORD\"]),)); db.commit(); db.close()'"

docker rm -f deer-flow-gateway-admin-test >/dev/null 2>&1 || true
docker run -d --name deer-flow-gateway-admin-test -p 127.0.0.1:18001:8001 \
  --env-file "$ROOT/.env" \
  -v "$ROOT/config.yaml":/app/backend/config.yaml:ro \
  -v "$ROOT/extensions_config.json":/app/backend/extensions_config.json:ro \
  -v "$TEST_HOME":/app/backend/.deer-flow \
  -e DEER_FLOW_PROJECT_ROOT=/app \
  -e DEER_FLOW_HOME=/app/backend/.deer-flow \
  -e DEER_FLOW_CONFIG_PATH=/app/backend/config.yaml \
  -e DEER_FLOW_EXTENSIONS_CONFIG_PATH=/app/backend/extensions_config.json \
  deer-flow-gateway:user-admin >/dev/null

cleanup() {
  docker rm -f deer-flow-gateway-admin-test >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18001/health >/dev/null; then
    break
  fi
  sleep 1
done

UNAUTH=$(curl -s -o /tmp/admin-unauth.json -w "%{http_code}" http://127.0.0.1:18001/api/v1/admin/users)
ADMIN_EMAIL=$(python3 -c "import sqlite3; db=sqlite3.connect('$TEST_HOME/data/deerflow.db'); print(db.execute('select email from users where system_role=\"admin\" limit 1').fetchone()[0]); db.close()")

curl -fsS -c /tmp/admin-test.cookies \
  -X POST http://127.0.0.1:18001/api/v1/auth/login/local \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$ADMIN_EMAIL" \
  --data-urlencode "password=$TEST_PASSWORD" >/tmp/admin-login.json

CSRF=$(awk '$6 == "csrf_token" {print $7}' /tmp/admin-test.cookies)
LIST=$(curl -s -o /tmp/admin-list.json -w "%{http_code}" \
  -b /tmp/admin-test.cookies http://127.0.0.1:18001/api/v1/admin/users)
CREATE=$(curl -s -o /tmp/admin-create.json -w "%{http_code}" \
  -b /tmp/admin-test.cookies \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"email":"managed-test@example.com","temporary_password":"Managed-7xQ!92","system_role":"user"}' \
  http://127.0.0.1:18001/api/v1/admin/users)
MANAGED_ID=$(python3 -c 'import json; print(json.load(open("/tmp/admin-create.json"))["id"])')
SUSPEND=$(curl -s -o /tmp/admin-suspend.json -w "%{http_code}" \
  -b /tmp/admin-test.cookies -X PATCH \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}' \
  "http://127.0.0.1:18001/api/v1/admin/users/$MANAGED_ID")
REGISTER=$(curl -s -o /tmp/admin-register.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{"email":"public-test@example.com","password":"Public-7xQ!92"}' \
  http://127.0.0.1:18001/api/v1/auth/register)

printf 'unauth=%s list=%s create=%s suspend=%s public_register=%s\n' \
  "$UNAUTH" "$LIST" "$CREATE" "$SUSPEND" "$REGISTER"
python3 -c 'import json; d=json.load(open("/tmp/admin-list.json")); print("users", len(d["users"]), "registration", d["public_registration_enabled"])'
