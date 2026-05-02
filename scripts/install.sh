#!/bin/sh
# Cluster Hub Agent installer
# Usage: curl -fsSL https://domain.com/install.sh | sh
set -e

SERVICE_NAME="cluster-hub-agent"
INSTALL_DIR="/opt/cluster-hub"
BINARY="$INSTALL_DIR/cluster-hub-agent"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
BASE_URL="https://domain.com/releases/latest/linux"

echo ""
echo "=== Cluster Hub Agent Installer ==="
echo ""

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: run as root (sudo sh install.sh)" >&2
  exit 1
fi

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)         ARCH_TAG="amd64" ;;
  aarch64|arm64)  ARCH_TAG="arm64" ;;
  armv7l|armv6l)  ARCH_TAG="armv7" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

DOWNLOAD_URL="$BASE_URL/cluster-hub-agent-linux-$ARCH_TAG"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download binary
echo "Downloading agent ($ARCH_TAG) from $DOWNLOAD_URL ..."
curl -fsSL "$DOWNLOAD_URL" -o "$BINARY"
chmod +x "$BINARY"
echo "Saved to $BINARY"

# Stop existing service if running
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Stopping existing service..."
    systemctl stop "$SERVICE_NAME"
  fi

  # Write systemd unit
  echo "Creating systemd service..."
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Cluster Hub Agent
Documentation=https://domain.com
After=network.target

[Service]
Type=simple
ExecStart=$BINARY
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl start "$SERVICE_NAME"

  sleep 1
  STATUS=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
  echo ""
  echo "Done! Service status: $STATUS"
else
  # No systemd — fallback: print run instructions
  echo ""
  echo "systemd not found. Run the agent manually:"
  echo "  $BINARY &"
fi

echo ""
echo "Agent runs on port 8080 by default."
echo ""
echo "Manage:"
echo "  Status:    systemctl status $SERVICE_NAME"
echo "  Stop:      systemctl stop $SERVICE_NAME"
echo "  Uninstall: curl -fsSL https://domain.com/uninstall.sh | sh"
echo ""
