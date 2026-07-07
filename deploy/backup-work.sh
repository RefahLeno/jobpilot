#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/jobpilot"
BACKUP_DIR="/var/backups/jobpilot"
STAMP="$(date +%F-%H%M%S)"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/jobpilot-work-$STAMP.tar.gz" -C "$APP_DIR" work

find "$BACKUP_DIR" -type f -name 'jobpilot-work-*.tar.gz' -mtime +7 -delete

echo "Backup created at $BACKUP_DIR/jobpilot-work-$STAMP.tar.gz"
