#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/jobpilot"

sudo apt update
sudo apt install -y nginx git curl python3 python3-pip python3-venv certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

sudo mkdir -p "$APP_DIR"
sudo mkdir -p "$APP_DIR/work/uploads" "$APP_DIR/work/exports" "$APP_DIR/work/logs" "$APP_DIR/work/data"
sudo chown -R "$USER":"$USER" "$APP_DIR"

echo "Server base dependencies installed."
echo "Next steps:"
echo "1) git clone your repository into $APP_DIR"
echo "2) cp .env.example .env and fill values"
echo "3) npm install"
echo "4) python3 -m pip install -r requirements.txt"
echo "5) configure systemd and nginx from deploy/"
