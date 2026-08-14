#!/usr/bin/env sh
set -eu

project_name="razer-raders-https-e2e"
postgres_port="${RAZER_HTTPS_E2E_POSTGRES_PORT:-5434}"
http_port="${RAZER_HTTPS_E2E_HTTP_PORT:-8082}"
https_port="${RAZER_HTTPS_E2E_HTTPS_PORT:-8445}"

compose_https() {
  RAZER_PUBLIC_HOSTNAME="localhost" POSTGRES_PORT="$postgres_port" RAZER_HTTP_BIND_ADDRESS="127.0.0.1" RAZER_HTTP_PORT="$http_port" RAZER_HTTPS_BIND_ADDRESS="127.0.0.1" RAZER_HTTPS_PORT="$https_port" docker compose -p "$project_name" -f compose.yaml -f compose.https.yaml "$@"
}

cleanup() {
  compose_https down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

for service in migrate web worker; do
  docker image inspect "razer-raders-${service}:latest" >/dev/null
  docker tag "razer-raders-${service}:latest" "${project_name}-${service}:latest"
done

compose_https up --detach --no-build

attempt=0
until curl --fail --silent --insecure "https://localhost:${https_port}/api/brief" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    compose_https logs >&2
    echo "HTTPS Public Brief 未能在 30 秒内通过反向代理读取。" >&2
    exit 1
  fi
  sleep 1
done

web_binding="$(docker inspect --format '{{range .NetworkSettings.Ports}}{{if .}}{{range .}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}{{end}}' "$(compose_https ps -q web)")"
if [ -n "$web_binding" ]; then
  echo "Web Service 不应直接发布 3000 端口，实际为 ${web_binding}。" >&2
  exit 1
fi

worker_binding="$(docker inspect --format '{{range .NetworkSettings.Ports}}{{if .}}{{range .}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}{{end}}' "$(compose_https ps -q worker)")"
if [ -n "$worker_binding" ]; then
  echo "Worker 不应发布宿主机端口，实际为 ${worker_binding}。" >&2
  exit 1
fi

postgres_binding="$(compose_https port postgres 5432)"
if [ "$postgres_binding" != "127.0.0.1:${postgres_port}" ]; then
  echo "PostgreSQL 应仅绑定到 127.0.0.1，实际为 ${postgres_binding}。" >&2
  exit 1
fi
