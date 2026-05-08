#!/usr/bin/env bash
set -euo pipefail

# Скрипт деплоя UGAME на Ubuntu:
# 1) Устанавливает Node.js + Nginx
# 2) Ставит зависимости и собирает фронтенд
# 3) Настраивает Nginx на порт 8081
# 4) Включает автозапуск Nginx и (при наличии UFW) открывает порт

APP_NAME="ugame"
APP_PORT_DEFAULT="8081"
APP_PORT="${APP_PORT_DEFAULT}"
APP_ROOT="/opt/${APP_NAME}"
WEB_ROOT="/var/www/${APP_NAME}"
NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}-${APP_PORT}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${APP_NAME}-${APP_PORT}.conf"

PROJECT_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

is_port_in_use() {
  local port="$1"
  ss -ltn "( sport = :${port} )" 2>/dev/null | tail -n +2 | grep -q .
}

select_deploy_port() {
  local candidate

  # Предпочитаем 8081, если свободен или уже занят nginx.
  if is_port_in_use "${APP_PORT_DEFAULT}"; then
    local listeners
    listeners="$(ss -ltnp 2>/dev/null | grep ":${APP_PORT_DEFAULT} " || true)"
    if [[ "${listeners}" == *"nginx"* ]]; then
      APP_PORT="${APP_PORT_DEFAULT}"
      return
    fi
  else
    APP_PORT="${APP_PORT_DEFAULT}"
    return
  fi

  # Ищем свободный порт в безопасных диапазонах, исключая 80/443.
  for candidate in $(seq 8082 8099) $(seq 9000 9099); do
    if [[ "${candidate}" == "80" || "${candidate}" == "443" ]]; then
      continue
    fi

    if ! is_port_in_use "${candidate}"; then
      APP_PORT="${candidate}"
      return
    fi
  done

  echo "Не найден свободный порт для деплоя (проверены 8081-8099 и 9000-9099)."
  exit 1
}

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

  NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}-${APP_PORT}.conf"
  NGINX_LINK="/etc/nginx/sites-enabled/${APP_NAME}-${APP_PORT}.conf"

  cat > "${NGINX_CONF}" <<EOF
server {
    listen ${APP_PORT};
    listen [::]:${APP_PORT};
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

  # Удаляем старые конфиги этого приложения на других портах.
  find /etc/nginx/sites-enabled -maxdepth 1 -type l -name "${APP_NAME}-*.conf" ! -name "$(basename "${NGINX_LINK}")" -delete || true

  ln -sf "${NGINX_CONF}" "${NGINX_LINK}"
  nginx -t
  systemctl enable nginx
  if ! systemctl restart nginx; then
    echo
    echo "Не удалось запустить nginx. Диагностика:"
    systemctl status nginx --no-pager -l || true
    journalctl -xeu nginx --no-pager -n 80 || true
    exit 1
  fi
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
select_deploy_port
sync_project
build_project
publish_dist
configure_nginx
open_firewall_port
print_summary
