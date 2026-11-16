#!/bin/sh
# shellcheck disable=SC2086
# Can the neko Chromium image run with the privileges we want to give a browser container, AND does Chromium's own sandbox turn out to be ON?
# It starts the image on the isolated browser network (no published ports, so nothing is reachable from outside), with
#   --cap-drop=ALL  no-new-privileges  the seccomp profile of make-chromium-seccomp.sh  default AppArmor  Chromium WITHOUT --no-sandbox
# and, if that does not come up, adds back only the capabilities the image's start-up needs, level by level, and says which level worked. Then it asks
# Chromium itself (chrome://sandbox, experiments/browser-live/check-sandbox.mjs) whether it is "adequately sandboxed": the check of design §10.6 item 7.
# It changes nothing on the host: throw-away containers only, removed at the end.
#   sudo sh browser-host/make-chromium-seccomp.sh && sudo sh browser-host/probe-neko-hardening.sh
set -u
IMAGE="${NEKO_IMAGE:-ghcr.io/m1k1o/neko/chromium:latest}"
HERE=$(cd "$(dirname "$0")" && pwd)
EXP="$HERE/../experiments/browser-live"
SECCOMP="$HERE/chromium-seccomp.json"
NET="${BROWSER_NET_NAME:-noureon-browser}"
[ "$(id -u)" = 0 ] || { echo "run this with sudo"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed"; exit 2; }
[ -f "$SECCOMP" ] || { echo "STOP: $SECCOMP is not there: run  sh browser-host/make-chromium-seccomp.sh  first"; exit 1; }
[ -f "$EXP/chromium-proxy-sandbox.conf" ] && [ -f "$EXP/check-sandbox.mjs" ] || { echo "STOP: experiments/browser-live files are missing (git pull)"; exit 1; }
docker network inspect "$NET" >/dev/null 2>&1 || { echo "STOP: the network $NET does not exist (run browser-host/install.sh first)"; exit 1; }
docker pull "$IMAGE" >/dev/null 2>&1 || echo "(could not pull $IMAGE; using the copy on this machine if there is one)"

N=0
# shellcheck disable=SC2329
cleanup() { docker ps -aq --filter "name=noureon-probe-neko-$$" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
PW1=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n'); PW2=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')

level() { # label, capabilities to add back (space separated, may be empty)
  label=$1; caps=$2
  N=$((N + 1)); name="noureon-probe-neko-$$-$N"
  addargs=""; for c in $caps; do addargs="$addargs --cap-add=$c"; done
  echo; echo "== level $N: $label"
  docker run -d --name "$name" --network "$NET" --cap-drop=ALL $addargs --security-opt no-new-privileges --security-opt "seccomp=$SECCOMP" \
    --memory 3g --shm-size 2g -e NEKO_DESKTOP_SCREEN=1024x768@20 -e NEKO_MEMBER_MULTIUSER_USER_PASSWORD="$PW1" -e NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD="$PW2" \
    -v "$EXP/chromium-proxy-sandbox.conf:/etc/neko/supervisord/chromium.conf:ro" -v "$EXP/policies.json:/etc/chromium/policies/managed/policies.json:ro" \
    "$IMAGE" >/dev/null || { echo "FAIL  the container did not start"; return 1; }
  i=0; status=starting
  while [ "$i" -lt 45 ]; do
    state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo gone)
    [ "$state" = running ] || { status="container $state"; break; }
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealthcheck{{end}}' "$name" 2>/dev/null)
    [ "$status" = healthy ] && break
    i=$((i + 1)); sleep 2
  done
  if [ "$status" != healthy ]; then
    echo "FAIL  not healthy ($status); the last lines of its log:"; docker logs "$name" 2>&1 | tail -12 | sed 's/^/        /'; docker rm -f "$name" >/dev/null 2>&1; return 1
  fi
  echo "ok    the container is up and healthy ($((i * 2)) s)"
  echo "      browser processes (user, command):"
  docker exec "$name" sh -c "ps -eo user:12,args | grep '[c]hromium' | head -3 | cut -c1-150" 2>/dev/null | sed 's/^/        /'
  sleep 5
  echo "      what Chromium says about its own sandbox (chrome://sandbox):"
  out=$(timeout 90 docker run --rm --network "container:$name" -v "$EXP":/work:ro -w /work node:22-alpine node check-sandbox.mjs 2>&1); rc=$?
  printf '%s\n' "$out" | sed 's/^/        /'
  docker rm -f "$name" >/dev/null 2>&1
  [ "$rc" = 0 ]
}

if level "no capabilities at all" ""; then echo; echo "RESULT: works with ALL capabilities dropped, sandbox ON"; exit 0; fi
if level "SETUID SETGID (supervisord switches to the neko user)" "SETUID SETGID"; then echo; echo "RESULT: works with only SETUID, SETGID added back, sandbox ON"; exit 0; fi
if level "SETUID SETGID CHOWN DAC_OVERRIDE FOWNER KILL" "SETUID SETGID CHOWN DAC_OVERRIDE FOWNER KILL"; then echo; echo "RESULT: works with SETUID SETGID CHOWN DAC_OVERRIDE FOWNER KILL added back, sandbox ON"; exit 0; fi
echo; echo "RESULT: no level gave a healthy container with the sandbox confirmed (see above); paste the whole output"
exit 1
