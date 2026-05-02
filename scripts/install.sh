#!/bin/sh
# Cluster Hub installer — installs backend hub + frontend web UI
# Usage: curl -fsSL https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/install.sh | sh
set -e

HUB_SERVICE="cluster-hub"
FRONTEND_SERVICE="cluster-hub-frontend"
INSTALL_DIR="/opt/cluster-hub"
HUB_BINARY="$INSTALL_DIR/cluster-hub-agent"
FRONTEND_DIR="$INSTALL_DIR/frontend"
HUB_SERVICE_FILE="/etc/systemd/system/$HUB_SERVICE.service"
FRONTEND_SERVICE_FILE="/etc/systemd/system/$FRONTEND_SERVICE.service"

echo ""
echo "=== Cluster Hub Installer ==="
echo ""

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: run as root (sudo sh install.sh)" >&2
  exit 1
fi

# Require Node.js 18+
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found. Install Node.js 18+ and re-run." >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" >&2
  echo "  apt-get install -y nodejs" >&2
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found $NODE_MAJOR)" >&2
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

# Fetch latest release tag
echo "Fetching latest release..."
LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/pedrolemoz/cluster-hub/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
if [ -z "$LATEST_TAG" ]; then
  echo "Error: could not fetch latest release tag" >&2
  exit 1
fi
echo "Latest release: $LATEST_TAG"

BASE_URL="https://github.com/pedrolemoz/cluster-hub/releases/download/$LATEST_TAG"

# Create install directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$FRONTEND_DIR"

# --- Download hub binary ---
echo ""
echo "Downloading hub backend ($ARCH_TAG)..."
curl -fsSL "$BASE_URL/cluster-hub-agent-linux-$ARCH_TAG" -o "$HUB_BINARY"
chmod +x "$HUB_BINARY"
echo "Saved to $HUB_BINARY"

# --- Download + extract frontend ---
echo ""
echo "Downloading frontend..."
curl -fsSL "$BASE_URL/cluster-hub-frontend.tar.gz" -o /tmp/cluster-hub-frontend.tar.gz
tar -xzf /tmp/cluster-hub-frontend.tar.gz -C "$FRONTEND_DIR"
rm /tmp/cluster-hub-frontend.tar.gz
echo "Extracted to $FRONTEND_DIR"

# --- Systemd services ---
if ! command -v systemctl >/dev/null 2>&1; then
  echo ""
  echo "systemd not found. Run manually:"
  echo "  Hub:      $HUB_BINARY"
  echo "  Frontend: node $FRONTEND_DIR/server.js"
  exit 0
fi

stop_if_running() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then
    echo "Stopping $1..."
    systemctl stop "$1"
  fi
}

stop_if_running "$HUB_SERVICE"
stop_if_running "$FRONTEND_SERVICE"

echo "Creating systemd services..."

cat > "$HUB_SERVICE_FILE" << EOF
[Unit]
Description=Cluster Hub Backend
Documentation=https://github.com/pedrolemoz/cluster-hub
After=network.target

[Service]
Type=simple
ExecStart=$HUB_BINARY
Environment=PORT=3001
Environment=DB_PATH=$INSTALL_DIR/cluster.db
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cat > "$FRONTEND_SERVICE_FILE" << EOF
[Unit]
Description=Cluster Hub Frontend
Documentation=https://github.com/pedrolemoz/cluster-hub
After=network.target $HUB_SERVICE.service

[Service]
Type=simple
ExecStart=$(command -v node) $FRONTEND_DIR/server.js
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=BACKEND_URL=http://localhost:3001
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

for SVC in "$HUB_SERVICE" "$FRONTEND_SERVICE"; do
  systemctl enable "$SVC"
  systemctl start "$SVC"
done

sleep 2

HUB_STATUS=$(systemctl is-active "$HUB_SERVICE" 2>/dev/null || echo "unknown")
FE_STATUS=$(systemctl is-active "$FRONTEND_SERVICE" 2>/dev/null || echo "unknown")

echo ""
echo "Done!"
echo "  Hub backend:  $HUB_STATUS  (port 3001)"
echo "  Frontend:     $FE_STATUS  (port 3000)"
echo ""
echo "Open http://$(hostname -I | awk '{print $1}'):3000 in your browser."
echo ""
echo "Manage:"
echo "  Status:    systemctl status $HUB_SERVICE $FRONTEND_SERVICE"
echo "  Stop:      systemctl stop $HUB_SERVICE $FRONTEND_SERVICE"
echo "  Uninstall: curl -fsSL https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/uninstall.sh | sh"
echo ""
