#!/bin/sh
# Build cluster-hub-agent binaries and frontend for all supported platforms
set -e

BINARY_NAME="cluster-hub-agent"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
OUT_DIR="$ROOT_DIR/dist"

mkdir -p "$OUT_DIR"

echo "Output: $OUT_DIR"
echo ""

# --- Go binaries ---
echo "=== Building Go binaries ==="

build() {
  GOOS="$1" GOARCH="$2" GOARM="${3:-}" CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w" -o "$OUT_DIR/$4" "$SRC_DIR"
  echo "  OK  $4"
}

(cd "$SRC_DIR" && \
  build linux  amd64 ""  "${BINARY_NAME}-linux-amd64" && \
  build linux  arm64 ""  "${BINARY_NAME}-linux-arm64" && \
  build linux  arm   7   "${BINARY_NAME}-linux-armv7" && \
  build windows amd64 "" "${BINARY_NAME}.exe"
)

# --- Frontend ---
echo ""
echo "=== Building frontend ==="

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found — install Node.js 18+ to build frontend" >&2
  exit 1
fi

(cd "$FRONTEND_DIR" && \
  npm ci --prefer-offline && \
  npm run build
)

TARBALL="$OUT_DIR/cluster-hub-web.tar.gz"
tar -czf "$TARBALL" -C "$FRONTEND_DIR/out" .
echo "  OK  cluster-hub-web.tar.gz"

echo ""
echo "Artifacts in dist/:"
ls -lh "$OUT_DIR"
