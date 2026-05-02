# Cluster Hub

Raspberry Pi web app to monitor and control PCs on your LAN.

## Requirements

- Raspberry Pi with Go 1.22+ and Node.js 20+
- Each PC runs `system-agent` on port 8080 (GET /health, GET /metrics, POST /shutdown)

## Development

### Backend
```bash
cd backend
go mod tidy
go run main.go
# API on :3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# UI on :3000, proxies /api/* → localhost:3001
```

Open http://localhost:3000

## Production (Raspberry Pi)

### 1. Build

```bash
# Backend
cd backend
go mod tidy
go build -o cluster-hub-server .

# Frontend
cd frontend
npm install
npm run build
```

### 2. Run manually

```bash
# Terminal 1 — backend
PORT=3001 DB_PATH=/opt/cluster-hub/cluster.db ./backend/cluster-hub-server

# Terminal 2 — frontend
cd frontend
PORT=3000 BACKEND_URL=http://localhost:3001 npm start
```

### 3. systemd auto-start

Create `/etc/systemd/system/cluster-hub-backend.service`:

```ini
[Unit]
Description=Cluster Hub Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/cluster-hub
ExecStart=/opt/cluster-hub/cluster-hub-server
Environment=PORT=3001
Environment=DB_PATH=/opt/cluster-hub/cluster.db
Environment=BIND_ADDR=0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/cluster-hub-frontend.service`:

```ini
[Unit]
Description=Cluster Hub Frontend
After=cluster-hub-backend.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/cluster-hub/frontend
ExecStart=/usr/bin/npm start
Environment=PORT=3000
Environment=BACKEND_URL=http://localhost:3001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cluster-hub-backend cluster-hub-frontend
sudo systemctl start cluster-hub-backend cluster-hub-frontend
```

### 4. Open from phone on same Wi-Fi

Find your Pi's IP:
```bash
hostname -I
```

Open `http://<pi-ip>:3000` on any device on the same Wi-Fi.

To use port 80 instead, add an nginx reverse proxy or use `PORT=80` with sudo.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend port |
| `DB_PATH` | `./cluster.db` | SQLite database path |
| `BIND_ADDR` | `0.0.0.0` | Backend bind address |
| `BACKEND_URL` | `http://localhost:3001` | Frontend → backend URL |
