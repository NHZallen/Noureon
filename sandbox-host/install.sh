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
docker build -f "$BUILD/sandbox-host/Dockerfile" -t noureon-sandbox:1 "$BUILD"

say "3. The runner image"
docker build -f "$BUILD/sandbox-host/Dockerfile.runner" -t noureon-sandbox-runner:1 "$BUILD"

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

say "5. Where the runner listens (the machine's address inside, which the services here reach and the internet does not)"
HOST=$(ip -4 -o addr show cni0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1)
if [ -z "$HOST" ]; then
  HOST=127.0.0.1
  echo "No cni0 address found: listening on 127.0.0.1 only (Zeabur's services cannot reach that; tell Claude)."
fi
echo "address: $HOST:$PORT"

say "6. Starting the runner"
docker rm -f noureon-sandbox-runner >/dev/null 2>&1 || true
docker run -d --name noureon-sandbox-runner --restart unless-stopped --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DATA:$DATA" \
  -v "$SECRET_FILE:/run/secrets/runner-token:ro" \
  -e RUNNER_HOST="$HOST" -e RUNNER_PORT="$PORT" -e RUNNER_TOKEN_FILE=/run/secrets/runner-token \
  -e SANDBOX_DATA_DIR="$DATA" -e SANDBOX_IMAGE=noureon-sandbox:1 \
  noureon-sandbox-runner:1 >/dev/null
sleep 3
docker logs --tail 5 noureon-sandbox-runner

say "Done"
echo "Next: sh sandbox-host/smoke-test.sh"
