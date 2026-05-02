#!/usr/bin/env bash
set -e

# Run as root to register systemd services
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script as root (e.g. sudo bash install.sh)"
  exit 1
fi

echo "Checking dependencies..."
MISSING=""
command -v git >/dev/null 2>&1 || MISSING="$MISSING git"
command -v go >/dev/null 2>&1 || MISSING="$MISSING golang"
command -v node >/dev/null 2>&1 || MISSING="$MISSING node.js"
command -v npm >/dev/null 2>&1 || MISSING="$MISSING npm"

if [ -n "$MISSING" ]; then
  echo ""
  echo "ERROR: Missing required dependencies:$MISSING"
  echo "Please install them and try again. This script will not download them automatically."
  exit 1
fi

INSTALL_DIR="/opt/cluster-hub-dev"
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing existing installation at $INSTALL_DIR..."
  systemctl stop cluster-hub-backend 2>/dev/null || true
  systemctl stop cluster-hub-frontend 2>/dev/null || true
  rm -rf "$INSTALL_DIR"
fi

echo "Cloning project to $INSTALL_DIR..."
git clone https://github.com/pedrolemoz/cluster-hub.git "$INSTALL_DIR"

echo "Building Backend..."
cd "$INSTALL_DIR/backend"
go mod tidy
go build -o main

echo "Building Frontend..."
cd "$INSTALL_DIR/frontend"
npm install
npm run build

echo "Creating systemd services..."
# We use bash -lc to ensure profile is loaded so it can find go and npm paths

cat <<EOF > /etc/systemd/system/cluster-hub-backend.service
[Unit]
Description=Cluster Hub Backend Dev
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$INSTALL_DIR/backend/main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF > /etc/systemd/system/cluster-hub-frontend.service
[Unit]
Description=Cluster Hub Frontend Dev
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/frontend
ExecStart=/usr/bin/env bash -lc "npm start"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Enabling and starting services..."
systemctl daemon-reload
systemctl enable cluster-hub-backend
systemctl enable cluster-hub-frontend
systemctl start cluster-hub-backend
systemctl start cluster-hub-frontend

echo ""
echo "Installation complete! Cluster Hub will run automatically on startup."
echo "Backend should be available at: http://localhost:3001"
echo "Frontend should be available at: http://localhost:3000"
echo ""
echo "To check logs, run:"
echo "  sudo journalctl -u cluster-hub-backend -f"
echo "  sudo journalctl -u cluster-hub-frontend -f"
