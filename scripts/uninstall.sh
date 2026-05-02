#!/bin/sh
# Cluster Hub Agent uninstaller
# Usage: curl -fsSL https://domain.com/uninstall.sh | sh
set -e

SERVICE_NAME="cluster-hub-agent"
INSTALL_DIR="/opt/cluster-hub"
BINARY="$INSTALL_DIR/cluster-hub-agent"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

echo ""
echo "=== Cluster Hub Agent Uninstaller ==="
echo ""

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: run as root (sudo sh uninstall.sh)" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Stopping service..."
    systemctl stop "$SERVICE_NAME"
  fi

  if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Disabling service..."
    systemctl disable "$SERVICE_NAME"
  fi

  if [ -f "$SERVICE_FILE" ]; then
    echo "Removing service file..."
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
  fi
fi

if [ -f "$BINARY" ]; then
  echo "Removing binary..."
  rm -f "$BINARY"
fi

# Remove install dir only if empty
rmdir "$INSTALL_DIR" 2>/dev/null && echo "Removed $INSTALL_DIR" || true

echo ""
echo "Cluster Hub Agent uninstalled."
echo ""
