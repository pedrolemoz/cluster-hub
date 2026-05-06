#!/usr/bin/env bash
set -e

# Run as root to remove systemd services
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root (e.g. sudo bash uninstall.sh)"
  exit 1
fi

REAL_HOME=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)

echo "Stopping and disabling service..."
systemctl stop cluster-hub-backend 2>/dev/null || true
systemctl disable cluster-hub-backend 2>/dev/null || true

echo "Removing systemd service file..."
rm -f /etc/systemd/system/cluster-hub-backend.service
systemctl daemon-reload

INSTALL_DIR="$REAL_HOME/cluster-hub-dev"
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing installation directory $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
fi

echo "Removing update script and sudoers rule..."
rm -f /usr/local/bin/cluster-hub-update
rm -f /etc/sudoers.d/cluster-hub

echo "Uninstallation complete."
