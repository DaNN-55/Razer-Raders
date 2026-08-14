#!/usr/bin/env sh
set -eu

project_name="razer-raders-e2e"
postgres_port="${RAZER_E2E_POSTGRES_PORT:-5433}"
web_port="3003"
database_url="postgresql://razer_raders:local-development-only@127.0.0.1:${postgres_port}/razer_raders"
web_pid=""

cleanup() {
  if [ -n "$web_pid" ]; then
    kill "$web_pid" >/dev/null 2>&1 || true
    wait "$web_pid" 2>/dev/null || true
  fi
  POSTGRES_PASSWORD="local-development-only" POSTGRES_PORT="$postgres_port" docker compose -p "$project_name" down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

POSTGRES_PASSWORD="local-development-only" POSTGRES_PORT="$postgres_port" docker compose -p "$project_name" up --detach postgres >/dev/null

attempt=0
until POSTGRES_PASSWORD="local-development-only" POSTGRES_PORT="$postgres_port" docker compose -p "$project_name" exec -T postgres pg_isready -U razer_raders -d razer_raders >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "E2E PostgreSQL 未能在 30 秒内启动。" >&2
    exit 1
  fi
  sleep 1
done

DATABASE_URL="$database_url" pnpm db:migrate
pnpm build >/dev/null
DATABASE_URL="$database_url" HOSTNAME="127.0.0.1" PORT="$web_port" node .next/standalone/server.js >/tmp/razer-raders-e2e-web.log 2>&1 &
web_pid="$!"

attempt=0
until curl --fail --silent "http://127.0.0.1:${web_port}/api/brief" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    cat /tmp/razer-raders-e2e-web.log >&2
    echo "E2E Web 未能在 30 秒内启动。" >&2
    exit 1
  fi
  sleep 1
done

DATABASE_URL="$database_url" RADAR_E2E_BASE_URL="http://127.0.0.1:${web_port}" node --experimental-strip-types --test --test-concurrency=1 test/e2e/*.test.ts
DATABASE_URL="$database_url" RADAR_E2E_BASE_URL="http://127.0.0.1:${web_port}" pnpm test:e2e:browser
