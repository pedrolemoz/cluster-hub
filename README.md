# ClusterHub

ClusterHub is a private web dashboard for monitoring and controlling computers on a local network. It detects each machine through its `/health` endpoint, sends Wake-on-LAN magic packets, and optionally requests remote shutdown.

## Features

- First-run account setup and password login
- Scrypt password hashing and signed HTTP-only sessions
- Login rate limiting and no password recovery path
- Persistent computer registry with up to 10 IP address or host alias and port pairs per machine
- Automatic health checks every 5 seconds and manual refresh
- Wake-on-LAN and opt-in shutdown control
- Per-computer power-action cooldown to prevent duplicate wake or shutdown requests
- Responsive dark interface inspired by `pedrolemoz.dev`
- Multi-stage Docker image with a persistent data volume

## Target computer contract

Each managed computer must expose HTTP on its configured port (default `8732`):

- `GET /health` returns `200` and `{ "status": "ok" }`
- `POST /shutdown` returns `200` and `{ "status": "shutting_down" }`

Wake-on-LAN must be enabled in the target computer's firmware and network adapter settings. ClusterHub accepts any valid public or private IPv4/IPv6 address, plus single-label host aliases such as `w11-vm`. Each address requires a port from `1` to `65535`.

Wake packets are sent to `255.255.255.255` and to inferred IPv4 `/24` directed broadcasts for each configured endpoint, such as `192.168.1.255` for `192.168.1.42`. By default ClusterHub sends on UDP ports `9` and `7`.

## Local development

Requires Node.js 22+ and pnpm 11+.

```bash
corepack enable
pnpm install
pnpm dev
```

The frontend runs at [http://localhost:5173](http://localhost:5173) and proxies API calls to the backend on port 3000.

```bash
pnpm test
pnpm build
```

## Docker

Create an environment file and replace the example secret with a random value:

```bash
cp .env.example .env
openssl rand -hex 32
```

Then run:

```bash
docker compose --project-name cluster-hub up --build -d
```

ClusterHub is available at [http://localhost:3000](http://localhost:3000). The account and computers are kept in the `cluster-hub-data` Docker volume.

### Docker with reliable Wake-on-LAN

Wake-on-LAN needs packets to leave through the host's LAN interface. Docker bridge networking can keep UDP broadcasts inside Docker's virtual network, especially on Docker Desktop. For WOL, prefer host networking:

```bash
docker compose --project-name cluster-hub -f compose.host.yaml up --build -d
```

ClusterHub is still available at [http://localhost:3000](http://localhost:3000), or at the port set with `PORT`. On Docker Desktop, enable host networking first in Docker Desktop settings: Resources, Network, Enable host networking, then Apply and restart. Host networking requires Docker Desktop 4.34 or later, and Docker notes that TCP and UDP are supported in this mode.

For a reverse proxy, forward the public HTTPS subdomain to port 3000. `NODE_ENV=production` makes the session cookie HTTPS-only. Keep the generated `SESSION_SECRET` stable or existing sessions will be invalidated.

### Remove Docker resources

To delete only the containers, images, and volumes created for the `cluster-hub` Compose project, run this command from the project directory:

```bash
docker compose --project-name cluster-hub down --volumes --rmi all --remove-orphans
```

The explicit project name prevents Docker Compose from targeting resources belonging to other Compose projects. This permanently deletes the account and computer data stored in the `cluster-hub-data` volume.

## Networking note

Wake-on-LAN broadcasts from Docker bridge mode are best-effort only. If the packet does not reach the LAN, use `compose.host.yaml` or run ClusterHub directly on the LAN host. Set `WOL_BROADCASTS` to a comma-separated list such as `192.168.1.255,10.0.0.255` when your subnet is not a `/24`, and set `WOL_PORTS` if your network expects specific UDP ports. The HTTP health and shutdown endpoints must also be reachable from ClusterHub.
