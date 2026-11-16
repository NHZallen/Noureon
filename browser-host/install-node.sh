#!/bin/sh
# Puts a current Node.js 22 on the machine for the browser host service, WITHOUT touching apt, other packages, or any container.
# It downloads the official tarball from nodejs.org, checks it against the SHA-256 list published beside it, unpacks it to /opt/node-v22.x.y,
# and links only `node` into /usr/local/bin (npm and npx are not linked; nothing here needs them). It does nothing if Node 20+ is already there.
#   sudo sh browser-host/install-node.sh --dry-run   # look first
#   sudo sh browser-host/install-node.sh
set -eu
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
BASE=https://nodejs.org/dist/latest-v22.x
fail() { echo "STOP: $*" >&2; exit 1; }
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || fail "run this with sudo"
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then echo "Node $(node -v) is already here; nothing to do"; exit 0; fi
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64) ARCH=arm64 ;; *) fail "unsupported CPU $(uname -m)" ;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT INT TERM
curl -fsSL --max-time 60 "$BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt" || fail "cannot download the checksum list from $BASE"
FILE=$(awk -v a="$ARCH" '$2 ~ "^node-v22[.0-9]*-linux-" a "\\.tar\\.gz$" {print $2}' "$TMP/SHASUMS256.txt" | head -1)
[ -n "$FILE" ] || fail "no linux-$ARCH tar.gz in the checksum list"
VER=${FILE#node-}; VER=${VER%%-linux-*}
DEST=/opt/node-$VER
echo "Node $VER ($ARCH): $BASE/$FILE -> $DEST, link /usr/local/bin/node"
if [ "$DRY" = 1 ]; then curl -fsSI --max-time 30 "$BASE/$FILE" >/dev/null && echo "  [dry-run] the file exists; nothing was changed"; exit 0; fi
curl -fsSL --max-time 300 "$BASE/$FILE" -o "$TMP/$FILE" || fail "download failed"
WANT=$(awk -v f="$FILE" '$2 == f {print $1}' "$TMP/SHASUMS256.txt")
GOT=$(sha256sum "$TMP/$FILE" | awk '{print $1}')
[ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || fail "the checksum does not match (wanted $WANT, got $GOT); nothing was installed"
echo "checksum ok"
[ -d "$DEST" ] || { mkdir "$TMP/x" && tar xzf "$TMP/$FILE" -C "$TMP/x" --no-same-owner && mv "$TMP/x/node-$VER-linux-$ARCH" "$DEST"; }
[ -x "$DEST/bin/node" ] || fail "unpacked, but $DEST/bin/node is missing"
ln -sfn "$DEST/bin/node" /usr/local/bin/node
echo "installed: $(/usr/local/bin/node -v) at /usr/local/bin/node"
