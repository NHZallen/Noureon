#!/bin/sh
# Sets up the Python sandbox on this machine: the image the sandbox containers are made from, a secret, and the runner that opens and
# closes them. Run as root, from a copy of the repository:
#     git clone https://github.com/NHZallen/Noureon.git && cd Noureon && sh sandbox-host/install.sh
# Safe to run again (it updates the image and the runner; the secret stays).
set -eu

say() { printf '\n== %s ==\n' "$1"; }
fail() { printf '\nSTOP: %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" = "0" ] || fail "run this as root"
command -v docker >/dev/null 2>&1 || fail "Docker is not installed"
docker info >/dev/null 2>&1 || fail "Docker is not running"
[ -f sandbox-host/Dockerfile ] || fail "run this from the folder of the repository (the one with sandbox-host/ in it)"

DATA=/var/lib/noureon-sandbox
SECRET_DIR=/etc/noureon-sandbox
SECRET_FILE="$SECRET_DIR/token"
PORT=7788

say "1. A clean folder to build from (only what the images need)"
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/public" "$BUILD/src/assets"
cp -r sandbox-host "$BUILD/sandbox-host"
cp -r public/sandbox "$BUILD/public/sandbox"
cp -r src/assets/fonts "$BUILD/src/assets/fonts"
cp package.json "$BUILD/package.json"

say "2. The Python image (the first time this takes several minutes)"
# The build steps use the machine's own network (Docker is set not to touch the network rules, so they would have none); the containers
# that run Python afterwards have no network at all.
docker build --network host -f "$BUILD/sandbox-host/Dockerfile" -t noureon-sandbox:1 "$BUILD"

say "3. The runner image"
docker build --network host -f "$BUILD/sandbox-host/Dockerfile.runner" -t noureon-sandbox-runner:1 "$BUILD"

say "4. The secret between the runner and Noureon's server"
mkdir -p "$SECRET_DIR" "$DATA"
chmod 700 "$SECRET_DIR"
if [ ! -s "$SECRET_FILE" ]; then
  (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE")
  echo "A new secret was made."
else
  echo "The secret already exists; it is kept."
fi
chmod 600 "$SECRET_FILE"

say "5. Where the runner listens and who may ask (the machine's own addresses, which the services here reach and the internet does not)"
# 127.0.0.1 always. The address of Docker's own bridge (docker0, usually 172.17.0.1) is where a server running in a container (Coolify) reaches the machine,
# so the runner listens there too and accepts the ranges Docker hands out to containers. While Zeabur's pod network (cni0) still exists it is added as well,
# so the old Zeabur server keeps working until Zeabur is removed; run this script again after that and it is left out.
HOST=127.0.0.1
ALLOW=127.0.0.1/32
BRIDGE=$(ip -4 -o addr show docker0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1)
if [ -n "$BRIDGE" ]; then
  HOST="$BRIDGE,$HOST"
  ALLOW="$ALLOW,172.16.0.0/12,192.168.0.0/16"
fi
# Coolify sets the address pools Docker hands out to the networks of its apps (daemon.json "default-address-pools", 10.0.0.0/8 by default): a server in
# one of those networks asks the runner from an address there, so every pool in the file is accepted too.
if [ -f /etc/docker/daemon.json ]; then
  for POOL in $(grep -o '"base": *"[0-9./]*"' /etc/docker/daemon.json | grep -o '[0-9][0-9./]*'); do
    ALLOW="$ALLOW,$POOL"
  done
fi
CNI=$(ip -4 -o addr show cni0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1)
if [ -n "$CNI" ]; then
  HOST="$CNI,$HOST"
  ALLOW="$ALLOW,10.42.0.0/16"
fi
echo "addresses: $HOST (port $PORT), accepted: $ALLOW"

say "6. Starting the runner"
docker rm -f noureon-sandbox-runner >/dev/null 2>&1 || true
docker run -d --name noureon-sandbox-runner --restart unless-stopped --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DATA:$DATA" \
  -v "$SECRET_FILE:/run/secrets/runner-token:ro" \
  -e RUNNER_HOST="$HOST" -e RUNNER_ALLOW="$ALLOW" -e RUNNER_PORT="$PORT" -e RUNNER_TOKEN_FILE=/run/secrets/runner-token \
  -e SANDBOX_DATA_DIR="$DATA" -e SANDBOX_IMAGE=noureon-sandbox:1 \
  noureon-sandbox-runner:1 >/dev/null
sleep 3
docker logs --tail 5 noureon-sandbox-runner

say "7. Keeping the sandbox image from clean-ups"
# The image of the sandbox is used only while a reply runs Python, so between replies no container uses it, and a clean-up of unused images
# (Coolify runs `docker image prune -af` every few minutes) deletes it: every reply with Python is then made in the browser instead. A container
# that is made and never started keeps it in use; it is made again here, after each build, so it holds the image just built.
docker rm -f noureon-sandbox-keep >/dev/null 2>&1 || true
docker create --name noureon-sandbox-keep --network none --label noureon.purpose=keeps-the-sandbox-image noureon-sandbox:1 true >/dev/null
echo "noureon-sandbox-keep holds noureon-sandbox:1 (it is never started)."

say "Done"
echo "Next: sh sandbox-host/smoke-test.sh"
