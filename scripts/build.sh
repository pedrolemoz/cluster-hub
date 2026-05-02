#!/bin/sh
# Build cluster-hub-agent binaries for all supported platforms
set -e

BINARY_NAME="cluster-hub-agent"
SRC_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"

mkdir -p "$OUT_DIR"

echo "Building from $SRC_DIR"
echo "Output: $OUT_DIR"
echo ""

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

echo ""
echo "Binaries written to dist/:"
ls -lh "$OUT_DIR"
