#!/usr/bin/env bash
set -e

# Run as root to remove systemd services
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root (e.g. sudo bash uninstall.sh)"
  exit 1
fi

echo "Stopping and disabling services..."
systemctl stop cluster-hub-backend 2>/dev/null || true
systemctl stop cluster-hub-frontend 2>/dev/null || true
systemctl disable cluster-hub-backend 2>/dev/null || true
systemctl disable cluster-hub-frontend 2>/dev/null || true

echo "Removing systemd service files..."
rm -f /etc/systemd/system/cluster-hub-backend.service
rm -f /etc/systemd/system/cluster-hub-frontend.service
systemctl daemon-reload

INSTALL_DIR="/opt/cluster-hub-dev"
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing installation directory $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
fi

echo "Uninstallation complete."
