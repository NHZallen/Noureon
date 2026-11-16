#!/bin/sh
# Adds gVisor (runsc) to Docker as a second runtime named "runsc". The browser containers then run INSIDE gVisor: a browser that escapes
# its own sandbox reaches gVisor's small user-space kernel, not the Linux kernel of this machine (design §10.2 item 1).
#
# What it does NOT do: it never restarts Docker, and it never makes runsc the default (runc stays the default, so every existing container is untouched).
# Docker reads the new runtime on a RELOAD (systemctl reload docker = SIGHUP). With live-restore off, a reload does not stop containers, but the
# script proves it: it records the running containers and their start times before, and compares after. If anything differs it says so loudly.
#
# The default platform of gVisor (systrap) needs no /dev/kvm.
#
# Usage:  sudo sh browser-host/install-gvisor.sh [--dry-run]
set -eu

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
say()  { printf '\n== %s ==\n' "$*"; }
fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || fail "run this with sudo"
command -v docker >/dev/null 2>&1 || fail "Docker is not installed"
docker info >/dev/null 2>&1 || fail "cannot talk to the Docker daemon"
command -v python3 >/dev/null 2>&1 || fail "python3 is needed (to check daemon.json)"
case "$(uname -m)" in x86_64) ARCH=x86_64 ;; aarch64) ARCH=aarch64 ;; *) fail "unsupported CPU: $(uname -m)" ;; esac
BASE="https://storage.googleapis.com/gvisor/releases/release/latest/$ARCH"
DAEMON_JSON=/etc/docker/daemon.json
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

snapshot() { docker ps --no-trunc --format '{{.ID}}' | sort | while read -r id; do docker inspect -f '{{.Id}} {{.State.StartedAt}} {{.RestartCount}}' "$id"; done; }

say "1. Before: the containers that are running now"
snapshot > "$WORK/before.txt"
wc -l < "$WORK/before.txt" | sed 's/^ *//; s/$/ containers running (recorded, to compare after the reload)/'
if docker info --format '{{json .Runtimes}}' | grep -q runsc; then
  echo "runsc is already registered as a Docker runtime."
  ALREADY=1
else
  ALREADY=0
fi

say "2. Download runsc and check its checksum"
# Google now publishes gVisor as one archive (gvisor.tar.bz2 + .sha512), not as a bare runsc file (that address answers 404; found on the first real run).
# The archive is checked against its published SHA-512 before anything is installed; the binary is then taken out of it by name.
ARCHIVE=gvisor.tar.bz2
if [ "$ALREADY" = 1 ] && [ -x /usr/local/bin/runsc ]; then
  echo "(already installed: $(/usr/local/bin/runsc --version | head -1))"
else
  # Always check that the two addresses exist, also in --dry-run (a dry run that does not look is how the 404 slipped through the first time).
  for f in "$ARCHIVE" "$ARCHIVE.sha512"; do
    code=$(curl -sI -o /dev/null -w '%{http_code}' -L "$BASE/$f" || true)
    [ "$code" = 200 ] || fail "$BASE/$f answers $code, not 200. Nothing was changed. Paste this line to the owner."
    echo "found   $BASE/$f"
  done
  command -v bzip2 >/dev/null 2>&1 || fail "bzip2 is needed to open the archive (apt-get install -y bzip2)"
  if [ "$DRY" = 1 ]; then
    echo "  [dry-run] download, check the SHA-512, take runsc out of the archive, install it to /usr/local/bin/runsc"
  else
    curl -fsSLo "$WORK/$ARCHIVE" "$BASE/$ARCHIVE"
    curl -fsSLo "$WORK/$ARCHIVE.sha512" "$BASE/$ARCHIVE.sha512"
    want=$(awk '{print $1; exit}' "$WORK/$ARCHIVE.sha512")
    have=$(sha512sum "$WORK/$ARCHIVE" | awk '{print $1}')
    [ -n "$want" ] && [ "$want" = "$have" ] || fail "the SHA-512 of the archive does not match; nothing was installed"
    echo "OK    SHA-512 matches"
    mkdir "$WORK/x" && tar -xjf "$WORK/$ARCHIVE" -C "$WORK/x"
    BIN=$(find "$WORK/x" -type f -name runsc | head -1)
    [ -n "$BIN" ] || fail "no file named runsc in the archive; contents: $(cd "$WORK/x" && find . -type f | head -10 | tr '\n' ' ')"
    install -m 0755 "$BIN" /usr/local/bin/runsc
    /usr/local/bin/runsc --version | head -1
  fi
fi

say "3. Register the runtime in $DAEMON_JSON (a copy is kept)"
if [ "$ALREADY" = 1 ]; then
  echo "(nothing to do)"
else
  if [ -f "$DAEMON_JSON" ]; then
    run cp -p "$DAEMON_JSON" "$DAEMON_JSON.before-gvisor.$(date +%Y%m%d%H%M%S)"
  fi
  run /usr/local/bin/runsc install
  if [ "$DRY" = 0 ]; then
    python3 -I -m json.tool "$DAEMON_JSON" >/dev/null || fail "$DAEMON_JSON is not valid JSON now; restore the .before-gvisor copy next to it. Docker was NOT reloaded."
    echo "daemon.json now:"; cat "$DAEMON_JSON"
    python3 -I - <<'PY' || fail "default-runtime is not runc in daemon.json; fix it before reloading. Docker was NOT reloaded."
import json
d = json.load(open("/etc/docker/daemon.json"))
dr = d.get("default-runtime", "runc")
assert dr == "runc", dr
PY
  fi
fi

say "4. Reload Docker (not restart)"
if [ "$ALREADY" = 1 ]; then
  echo "(nothing to do)"
else
  run systemctl reload docker
  [ "$DRY" = 1 ] || sleep 3
fi

say "5. After: is runsc a runtime, and is every earlier container still the same?"
if [ "$DRY" = 1 ]; then
  echo "  [dry-run] would check docker info and compare the container list"
  exit 0
fi
docker info --format '{{json .Runtimes}}' | grep -q runsc || fail "Docker does not list runsc after the reload. Do NOT restart Docker on your own (that stops every container). Paste this output and the file $DAEMON_JSON to the owner."
echo "OK    runsc is a registered runtime"
snapshot > "$WORK/after.txt"
if diff -q "$WORK/before.txt" "$WORK/after.txt" >/dev/null; then
  echo "OK    all $(wc -l < "$WORK/before.txt" | tr -d ' ') containers kept running (same ids, same start times, no restarts)"
else
  echo "WARNING: the container list changed during the reload:"; diff "$WORK/before.txt" "$WORK/after.txt" || true
  echo "Tell the owner now. Nothing else was touched."
fi

say "6. Try a container inside gVisor"
docker run --rm --runtime=runsc alpine:3.20 sh -c 'echo "inside gVisor:"; uname -a; dmesg 2>/dev/null | head -3 || true' || fail "a container did not start with --runtime=runsc"
echo
echo "Done. Next: sudo sh browser-host/probe-chromium-sandbox.sh   (variants 5 and 6 use gVisor)"
