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
# Usage:  sudo sh browser-host/install-gvisor.sh [--dry-run | --verify]
#   --verify  changes nothing: downloads the published archive, checks its SHA-512 and compares every file of it with what is installed.
set -eu

DRY=0; VERIFY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
[ "${1:-}" = "--verify" ] && VERIFY=1
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

# Download the published archive, check its SHA-512, open it. Sets SRC to the folder that holds runsc, containerd-shim-runsc-v1 and gvisor-bin/.
# Google now publishes gVisor as one archive (gvisor.tar.zstd or gvisor.tar.bz2, each with a .sha512), not as a bare runsc file (that address answers 404).
# runsc needs the files of gvisor-bin/ next to it; "runsc install" can fetch them itself, but that is a temporary best-effort feature and its download is not
# checked here, so this script installs them from the checked archive instead.
fetch_archive() {
  if command -v zstd >/dev/null 2>&1; then ARCHIVE=gvisor.tar.zstd; TARFLAG="--zstd"
  elif command -v bzip2 >/dev/null 2>&1; then ARCHIVE=gvisor.tar.bz2; TARFLAG="-j"
  else fail "neither zstd nor bzip2 is installed, so the archive cannot be opened (apt-get install -y zstd)"; fi
  echo "archive: $ARCHIVE"
  # Always check that the two addresses exist, also in --dry-run.
  for f in "$ARCHIVE" "$ARCHIVE.sha512"; do
    code=$(curl -sI -o /dev/null -w '%{http_code}' -L "$BASE/$f" || true)
    [ "$code" = 200 ] || fail "$BASE/$f answers $code, not 200. Nothing was changed. Paste this line to the owner."
    echo "found   $BASE/$f"
  done
  if [ "$DRY" = 1 ]; then SRC=""; return 0; fi
  curl -fsSLo "$WORK/$ARCHIVE" "$BASE/$ARCHIVE"
  curl -fsSLo "$WORK/$ARCHIVE.sha512" "$BASE/$ARCHIVE.sha512"
  want=$(awk '{print $1; exit}' "$WORK/$ARCHIVE.sha512")
  have=$(sha512sum "$WORK/$ARCHIVE" | awk '{print $1}')
  [ -n "$want" ] && [ "$want" = "$have" ] || fail "the SHA-512 of the archive does not match; nothing was installed"
  echo "OK    SHA-512 matches"
  mkdir "$WORK/x" && tar "$TARFLAG" -xf "$WORK/$ARCHIVE" -C "$WORK/x"
  BIN=$(find "$WORK/x" -type f -name runsc | head -1)
  [ -n "$BIN" ] || fail "no file named runsc in the archive; contents: $(cd "$WORK/x" && find . -type f | head -10 | tr '\n' ' ')"
  SRC=$(dirname "$BIN")
}

if [ "$VERIFY" = 1 ]; then
  say "Verify: the installed files against the checked archive (nothing is changed)"
  fetch_archive
  bad=0
  for f in runsc containerd-shim-runsc-v1; do
    [ -f "$SRC/$f" ] || continue
    if [ ! -f "/usr/local/bin/$f" ]; then echo "MISSING /usr/local/bin/$f"; bad=1
    elif cmp -s "$SRC/$f" "/usr/local/bin/$f"; then echo "same    /usr/local/bin/$f"
    else echo "DIFFERS /usr/local/bin/$f"; bad=1; fi
  done
  for f in "$SRC"/gvisor-bin/*; do
    b=$(basename "$f")
    if [ ! -f "/usr/local/bin/gvisor-bin/$b" ]; then echo "MISSING /usr/local/bin/gvisor-bin/$b"; bad=1
    elif cmp -s "$f" "/usr/local/bin/gvisor-bin/$b"; then echo "same    /usr/local/bin/gvisor-bin/$b"
    else echo "DIFFERS /usr/local/bin/gvisor-bin/$b"; bad=1; fi
  done
  [ "$bad" = 0 ] && echo "OK    everything installed is the same as the checked archive" || echo "Some files differ or are missing (a newer release than the installed one also shows as DIFFERS). Tell the owner; nothing was changed."
  exit 0
fi

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
if [ "$ALREADY" = 1 ] && [ -x /usr/local/bin/runsc ]; then
  echo "(already installed: $(/usr/local/bin/runsc --version | head -1))"
else
  fetch_archive
  if [ "$DRY" = 1 ]; then
    echo "  [dry-run] would install runsc, containerd-shim-runsc-v1 and gvisor-bin/* from the checked archive to /usr/local/bin"
  else
    install -m 0755 "$SRC/runsc" /usr/local/bin/runsc
    [ -f "$SRC/containerd-shim-runsc-v1" ] && install -m 0755 "$SRC/containerd-shim-runsc-v1" /usr/local/bin/containerd-shim-runsc-v1
    if [ -d "$SRC/gvisor-bin" ]; then
      mkdir -p /usr/local/bin/gvisor-bin
      for f in "$SRC"/gvisor-bin/*; do install -m 0755 "$f" "/usr/local/bin/gvisor-bin/$(basename "$f")"; done
    fi
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
# A container that was running before must still be the same one: same start time, no restart. A container that is gone or new is only reported:
# Coolify deploys by starting a new container and removing the old one, so that can happen on its own.
changed=0
while read -r id st rc; do
  line=$(grep "^$id " "$WORK/after.txt" || true)
  name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null || echo "$id")
  if [ -z "$line" ]; then
    echo "info   gone: $name (a deployment may have replaced it; check docker ps)"
  elif [ "$line" != "$id $st $rc" ]; then
    echo "WARNING: $name was RESTARTED during the reload (before: $st restarts=$rc, after: $line)"; changed=1
  fi
done < "$WORK/before.txt"
while read -r id _; do
  grep -q "^$id " "$WORK/before.txt" || echo "info   new: $(docker inspect -f '{{.Name}}' "$id" 2>/dev/null || echo "$id")"
done < "$WORK/after.txt"
if [ "$changed" = 0 ]; then
  echo "OK    no container that was running before was restarted by the reload"
else
  echo "Tell the owner now. Nothing else was touched."
fi

say "6. Try a container inside gVisor"
docker run --rm --runtime=runsc alpine:3.20 sh -c 'echo "inside gVisor:"; uname -a; dmesg 2>/dev/null | head -3 || true' || fail "a container did not start with --runtime=runsc"
echo
echo "Done. Next: sudo sh browser-host/probe-chromium-sandbox.sh   (variants 5 and 6 use gVisor)"
