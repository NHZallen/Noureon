#!/bin/sh
# shellcheck disable=SC2015
# Can Chromium keep ITS OWN sandbox switched on inside a container on this machine? (design §10.2 item 1, §13 item 9). Changes nothing on the host:
# it only runs a throwaway container of the neko image as the browser's non-root user and starts Chromium without --no-sandbox, for four variants:
#   1. Docker's default seccomp and AppArmor          (what a normal container gets)
#   2. a seccomp profile that allows user namespaces   (browser-host/chromium-seccomp.json, from Chrome's own recommendation; P1 will refine it)
#   3. default seccomp, AppArmor off                   (tells whether AppArmor is the blocker; for diagnosis only, never for production)
#   0. (before them) can a process in a container create a user namespace at all, with and without seccomp/AppArmor
#   4. plain Docker with Chromium --no-sandbox        (control: it must work, otherwise the test itself is broken)
#   5. gVisor (--runtime=runsc), Chromium's own sandbox on   (only if browser-host/install-gvisor.sh was run)
#   6. gVisor, Chromium with --no-sandbox              (inside gVisor, gVisor is the sandbox; this is the expected production setting if 5 fails)
# A line "SANDBOX OK" means Chromium STARTED with that setup (the label says whether its sandbox was on); "FAIL" shows the first lines of the error. Paste the whole output.
# Usage: sudo sh browser-host/probe-chromium-sandbox.sh [image]
set -u
IMAGE="${1:-ghcr.io/m1k1o/neko/chromium:latest}"
HERE=$(cd "$(dirname "$0")" && pwd)
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed"; exit 2; }
docker pull "$IMAGE" >/dev/null 2>&1 || echo "(could not pull $IMAGE; using the copy on this machine if there is one)"

BIN=$(docker run --rm --entrypoint sh "$IMAGE" -c 'command -v chromium || command -v chromium-browser || command -v google-chrome' 2>/dev/null | head -1)
[ -n "$BIN" ] || { echo "FAIL  could not find a Chromium binary in $IMAGE"; exit 1; }
echo "Chromium binary: $BIN"
echo "host: $(uname -r), user namespaces: $(cat /proc/sys/user/max_user_namespaces), apparmor userns restriction: $(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a)"

WORK=$(mktemp -d)
N=0
cleanup() { docker ps -aq --filter "name=noureon-probe-$$" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT INT TERM

# 0. Can a process inside a container create a user namespace at all? (the thing Chromium's own sandbox needs; Ubuntu 24.04 restricts it on the host)
for mode in "default" "seccomp+apparmor off"; do
  if [ "$mode" = default ]; then opts=""; else opts="--security-opt seccomp=unconfined --security-opt apparmor=unconfined"; fi
  # shellcheck disable=SC2086
  if docker run --rm --user 1000:1000 --cap-drop=ALL $opts alpine:3.20 unshare -U -r true >/dev/null 2>&1; then
    echo "userns OK   0. a container process can create a user namespace ($mode)"
  else
    echo "userns NO   0. a container process cannot create a user namespace ($mode)"
  fi
done

CFLAGS=""   # extra Chromium flags for the next try
try() { # label, docker options...
  label=$1; shift
  N=$((N + 1)); name="noureon-probe-$$-$N"; out="$WORK/out.$N"; t0=$(date +%s)
  # "DevTools listening on ws://..." is printed once the browser process is up, so it tells whether Chromium STARTED with this setup, without waiting for a page
  # to finish (the neko image's headless --dump-dom never finished, even in plain Docker; that made the first two probes useless). Output goes to a file, not to
  # a pipe that closes early (a closed pipe killed the docker client and left the container running). The container is stopped after 30 s either way.
  # shellcheck disable=SC2086
  timeout 30 docker run --name "$name" -e DISPLAY= --user 1000:1000 --cap-drop=ALL --security-opt no-new-privileges --shm-size=1g "$@" --entrypoint "$BIN" "$IMAGE" \
      --headless=new --disable-gpu --disable-dev-shm-usage --no-first-run --remote-debugging-port=0 $CFLAGS about:blank >"$out" 2>&1
  rc=$?
  docker rm -f "$name" >/dev/null 2>&1 || true
  secs=$(( $(date +%s) - t0 ))
  if grep -q 'DevTools listening' "$out"; then echo "SANDBOX OK  $label  (started)"
  else
    [ "$rc" = 124 ] && why="no start signal within 30 s" || why="exit code $rc"
    echo "FAIL        $label  ($why, ${secs}s)"
    grep -v 'inotify\|dbus\|cpufreq\|crashpad\|NETLINK' "$out" | head -5 | sed 's/^/              /'
  fi
}
try "1. default seccomp + default AppArmor"
[ -f "$HERE/chromium-seccomp.json" ] && try "2. Docker default + user-namespace calls allowed (chromium-seccomp.json), default AppArmor" --security-opt "seccomp=$HERE/chromium-seccomp.json" || echo "SKIP        2. (browser-host/chromium-seccomp.json is not there yet: run  sh browser-host/make-chromium-seccomp.sh  first)"
try "3. default seccomp, AppArmor off (diagnosis only)" --security-opt apparmor=unconfined
CFLAGS="--no-sandbox"; try "4. control: Chromium --no-sandbox in plain Docker (it must start, otherwise the test itself is broken; this is what the stock neko file does)"
CFLAGS=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q runsc; then
  try "5. gVisor, Chromium sandbox on" --runtime=runsc
  CFLAGS="--no-sandbox"; try "6. gVisor, Chromium --no-sandbox (gVisor is the sandbox)" --runtime=runsc
else
  echo "SKIP        5, 6. (runsc is not registered; run browser-host/install-gvisor.sh first)"
fi
echo
echo "Left-over probe containers (must be none): $(docker ps -aq --filter "name=noureon-probe-$$" | wc -l | tr -d ' ')"
