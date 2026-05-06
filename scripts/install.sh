#!/usr/bin/env bash
set -e

# Expand PATH to common tool install locations (handles nvm, go, homebrew, etc.)
export PATH="$PATH:/usr/local/go/bin:/usr/local/bin:/usr/bin"
[ -f /etc/profile ] && source /etc/profile
[ -f "$HOME/.profile" ] && source "$HOME/.profile"
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

# Load nvm from the invoking user's home (sudo resets $HOME to /root)
REAL_HOME=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)
export NVM_DIR="$REAL_HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"

# Run as root to register systemd services
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script as root (e.g. sudo -E bash install.sh)"
  exit 1
fi

echo "Checking dependencies..."
MISSING=""
command -v git >/dev/null 2>&1  || MISSING="$MISSING git"
command -v go >/dev/null 2>&1   || MISSING="$MISSING golang"
command -v node >/dev/null 2>&1 || MISSING="$MISSING node.js"
command -v npm >/dev/null 2>&1  || MISSING="$MISSING npm"

if [ -n "$MISSING" ]; then
  echo ""
  echo "ERROR: Missing required dependencies:$MISSING"
  echo "Please install them and try again. This script will not download them automatically."
  exit 1
fi

INSTALL_DIR="$REAL_HOME/cluster-hub-dev"
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing existing installation at $INSTALL_DIR..."
  systemctl stop cluster-hub-backend 2>/dev/null || true
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
mkdir -p "$INSTALL_DIR/backend/web"
cp -r "$INSTALL_DIR/frontend/out/." "$INSTALL_DIR/backend/web/"

echo "Fixing ownership..."
chown -R "${SUDO_USER:-$USER}":"${SUDO_USER:-$USER}" "$INSTALL_DIR"

echo "Creating systemd service..."

cat <<EOF > /etc/systemd/system/cluster-hub-backend.service
[Unit]
Description=Cluster Hub
After=network.target

[Service]
Type=simple
User=${SUDO_USER:-$USER}
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$INSTALL_DIR/backend/main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable cluster-hub-backend
systemctl start cluster-hub-backend

echo "Installing update script..."
cat <<'UPDATESCRIPT' > /usr/local/bin/cluster-hub-update
#!/usr/bin/env bash
set -e

export PATH="$PATH:/usr/local/go/bin:/usr/local/bin:/usr/bin"
[ -f /etc/profile ] && source /etc/profile

REAL_HOME=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)
export NVM_DIR="$REAL_HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

BACKUP_DIR="${1:-/tmp/cluster-hub-update}"

sleep 2

echo "[update] Running uninstall..."
curl -fsSL https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/uninstall.sh | bash

echo "[update] Running install..."
curl -fsSL https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/install.sh | bash

echo "[update] Waiting for service to be ready..."
TRIES=0
until curl -sf http://localhost:3001/api/machines > /dev/null 2>&1; do
  sleep 3
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -gt 40 ]; then
    echo "[update] Timeout waiting for service"
    rm -rf "$BACKUP_DIR"
    exit 1
  fi
done

if [ -f "$BACKUP_DIR/machines.json" ]; then
  echo "[update] Restoring machine config..."
  curl -sf -X POST http://localhost:3001/api/machines/import \
    -H 'Content-Type: application/json' \
    -d @"$BACKUP_DIR/machines.json"
fi

rm -rf "$BACKUP_DIR"
echo "[update] Done."
UPDATESCRIPT
chmod +x /usr/local/bin/cluster-hub-update

echo "Configuring sudoers for update..."
echo "${SUDO_USER:-$USER} ALL=(ALL) NOPASSWD: /usr/local/bin/cluster-hub-update" > /etc/sudoers.d/cluster-hub
chmod 440 /etc/sudoers.d/cluster-hub

echo ""
echo "Installation complete! Cluster Hub will run automatically on startup."
echo "Available at: http://localhost:3001"
echo ""
echo "To check logs, run:"
echo "  sudo journalctl -u cluster-hub-backend -f"
