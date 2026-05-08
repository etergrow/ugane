#!/usr/bin/env bash
set -euo pipefail

# Скрипт деплоя UGAME на Ubuntu:
# 1) Устанавливает Node.js + Nginx
# 2) Ставит зависимости и собирает фронтенд
# 3) Настраивает Nginx на порт 8081
# 4) Включает автозапуск Nginx и (при наличии UFW) открывает порт

APP_NAME="ugame"
APP_PORT="8081"
APP_ROOT="/opt/${APP_NAME}"
WEB_ROOT="/var/www/${APP_NAME}"
NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}-${APP_PORT}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${APP_NAME}-${APP_PORT}.conf"

PROJECT_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '\n\033[1;36m[%s]\033[0m %s\n' "$APP_NAME" "$1"
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запусти скрипт с правами root: sudo bash scripts/deploy_ubuntu_8081.sh"
  exit 1
fi

install_base_packages() {
  log "Установка базовых пакетов"
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg lsb-release rsync nginx
}

install_nodejs_20() {
  local need_install="false"

  if ! command -v node >/dev/null 2>&1; then
    need_install="true"
  else
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "${major}" -lt 20 ]]; then
      need_install="true"
    fi
  fi

  if [[ "${need_install}" == "false" ]]; then
    log "Node.js уже установлен: $(node -v)"
    return
  fi

  log "Установка Node.js 20.x"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list

  apt-get update -y
  apt-get install -y nodejs
}

sync_project() {
  log "Копирование проекта в ${APP_ROOT}"
  mkdir -p "${APP_ROOT}"

  rsync -a --delete \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude "dist" \
    --exclude ".idea" \
    "${PROJECT_SOURCE_DIR}/" "${APP_ROOT}/"
}

build_project() {
  log "Установка зависимостей и сборка"
  cd "${APP_ROOT}"

  if [[ -f "package-lock.json" ]]; then
    npm ci
  else
    npm install
  fi

  npm run build
}

publish_dist() {
  log "Публикация статических файлов в ${WEB_ROOT}"
  mkdir -p "${WEB_ROOT}"
  rsync -a --delete "${APP_ROOT}/dist/" "${WEB_ROOT}/"
}

configure_nginx() {
  log "Настройка Nginx (порт ${APP_PORT})"

  cat > "${NGINX_CONF}" <<EOF
server {
    listen ${APP_PORT} default_server;
    listen [::]:${APP_PORT} default_server;
    server_name _;

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
EOF

  ln -sf "${NGINX_CONF}" "${NGINX_LINK}"
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

open_firewall_port() {
  if command -v ufw >/dev/null 2>&1; then
    local ufw_status
    ufw_status="$(ufw status | head -n1 || true)"
    if [[ "${ufw_status}" == *"Status: active"* ]]; then
      log "Открытие порта ${APP_PORT} в UFW"
      ufw allow "${APP_PORT}/tcp" || true
    fi
  fi
}

print_summary() {
  local server_ip
  server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -z "${server_ip}" ]]; then
    server_ip="<IP_сервера>"
  fi

  log "Готово"
  echo "Приложение доступно по адресу: http://${server_ip}:${APP_PORT}"
  echo "Если сервер в облаке, проверь security group / cloud firewall для порта ${APP_PORT}/tcp."
}

install_base_packages
install_nodejs_20
sync_project
build_project
publish_dist
configure_nginx
open_firewall_port
print_summary
