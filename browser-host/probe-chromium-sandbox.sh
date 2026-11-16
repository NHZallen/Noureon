#!/bin/sh
# shellcheck disable=SC2015
# Can Chromium keep ITS OWN sandbox switched on inside a container on this machine? (design §10.2 item 1, §13 item 9). Changes nothing on the host:
# it only runs a throwaway container of the neko image as the browser's non-root user and starts Chromium without --no-sandbox, for four variants:
#   1. Docker's default seccomp and AppArmor          (what a normal container gets)
#   2. a seccomp profile that allows user namespaces   (browser-host/chromium-seccomp.json, from Chrome's own recommendation; P1 will refine it)
#   3. default seccomp, AppArmor off                   (tells whether AppArmor is the blocker; for diagnosis only, never for production)
#   4. everything off                                  (control: it must work, otherwise the test itself is broken)
#   5. gVisor (--runtime=runsc), Chromium's own sandbox on   (only if browser-host/install-gvisor.sh was run)
#   6. gVisor, Chromium with --no-sandbox              (inside gVisor, gVisor is the sandbox; this is the expected production setting if 5 fails)
# A line "SANDBOX OK" means Chromium started with its sandbox; "FAIL" shows the first lines of the error. Paste the whole output.
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

CFLAGS=""   # extra Chromium flags for the next try
try() { # label, docker options...
  label=$1; shift
  # shellcheck disable=SC2086
  out=$(docker run --rm --user 1000:1000 --cap-drop=ALL --shm-size=1g "$@" --entrypoint "$BIN" "$IMAGE" \
        --headless=new --disable-gpu --disable-dev-shm-usage $CFLAGS --dump-dom about:blank 2>&1 | head -12)
  if printf '%s' "$out" | grep -q '<html'; then echo "SANDBOX OK  $label"
  else echo "FAIL        $label"; printf '%s\n' "$out" | sed 's/^/              /' | head -6; fi
}
try "1. default seccomp + default AppArmor"
[ -f "$HERE/chromium-seccomp.json" ] && try "2. user-namespace seccomp profile" --security-opt "seccomp=$HERE/chromium-seccomp.json" || echo "SKIP        2. (browser-host/chromium-seccomp.json is not there yet)"
try "3. default seccomp, AppArmor off (diagnosis only)" --security-opt apparmor=unconfined
try "4. control: seccomp and AppArmor off (diagnosis only)" --security-opt seccomp=unconfined --security-opt apparmor=unconfined
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q runsc; then
  try "5. gVisor, Chromium sandbox on" --runtime=runsc
  CFLAGS="--no-sandbox"; try "6. gVisor, Chromium --no-sandbox (gVisor is the sandbox)" --runtime=runsc
else
  echo "SKIP        5, 6. (runsc is not registered; run browser-host/install-gvisor.sh first)"
fi
