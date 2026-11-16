#!/bin/sh
# shellcheck disable=SC1090,SC2015
# Sets up a browser host (design §4.2, §10, §11): Docker, the private network the browsers live in, the firewall that leaves them no way out but the
# egress proxy, and the egress proxy itself. It does NOT start any browser (that is P1) and it does NOT touch Cloudflare WARP (warp-proxy.sh does, asking first).
# Run as root on a clean Ubuntu or Debian, from a copy of the repository:
#     git clone -b staging https://github.com/NHZallen/Noureon.git && cd Noureon && sudo sh browser-host/install.sh --dry-run   # look first
#     sudo sh browser-host/install.sh
# Safe to run again (it updates files, rules and the proxy; the settings file stays).
# It never restarts Docker (on the production machine that would stop every container: live-restore is off there) and never touches existing networks or rules.
set -eu

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

say() { printf '\n== %s ==\n' "$1"; }
fail() { printf '\nSTOP: %s\n' "$1" >&2; exit 1; }
# Runs a command, or only shows it with --dry-run.
run() { if [ "$DRY" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

[ "$(id -u)" = "0" ] || fail "run this as root"
[ -f browser-host/egress-proxy.mjs ] || fail "run this from the folder of the repository (the one with browser-host/ in it)"
command -v apt-get >/dev/null 2>&1 || fail "this script is for Ubuntu or Debian (apt-get)"
command -v systemctl >/dev/null 2>&1 || fail "systemd is needed"

APP=/opt/noureon-browser
CONF=/etc/noureon-browser
ENV_FILE="$CONF/host.env"
# Defaults (the settings file overrides them); also what --dry-run shows when the file does not exist yet.
BROWSER_NET_NAME=noureon-browser; BROWSER_NET_BRIDGE=nbr0; BROWSER_NET_SUBNET=172.29.0.0/24; BROWSER_NET_GATEWAY=172.29.0.1; EGRESS_PORT=40001; PUBLIC_IP=; EGRESS_EXTRA_BLOCK=

say "1. Packages"
if ! command -v docker >/dev/null 2>&1; then run apt-get update; run apt-get install -y docker.io; fi
run apt-get install -y iptables curl ca-certificates bc
if [ "$DRY" = 0 ]; then
  systemctl enable --now docker
  docker info >/dev/null 2>&1 || fail "Docker is not running"
  if [ -f /etc/docker/daemon.json ] && grep -q '"iptables"[[:space:]]*:[[:space:]]*false' /etc/docker/daemon.json; then
    fail "/etc/docker/daemon.json has \"iptables\": false. The browser host needs Docker to manage its own rules (the live screen is published through them). Remove that line and restart Docker."
  fi
fi

say "2. Settings file ($ENV_FILE)"
run mkdir -p "$CONF" "$APP"
run chmod 700 "$CONF"
if [ ! -f "$ENV_FILE" ]; then
  run cp browser-host/host.env.example "$ENV_FILE"
  run chmod 600 "$ENV_FILE"
  if [ "$DRY" = 1 ]; then echo "would create $ENV_FILE from the example"; else echo "created $ENV_FILE from the example"; fi
else
  echo "kept the existing $ENV_FILE"
fi
# The public address of this machine: the egress proxy refuses it (a browser must not reach this machine's own services through its public address).
detect_public_ip() {
  # 1. AWS: the metadata service (version 2) knows it.
  token=$(curl -fsS -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)
  if [ -n "$token" ]; then
    curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null && return 0
  fi
  # 2. The address this machine uses to reach the internet (read from the local routing table: nothing is sent anywhere). It is the public address
  #    only when the machine holds it directly (Contabo does); behind NAT it is a private address, which is refused below.
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}'
}
is_private_v4() { case "$1" in 10.*|127.*|169.254.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*|"") return 0 ;; esac; return 1; }
if [ "$DRY" = 0 ]; then
  . "$ENV_FILE"
fi
if [ "$DRY" = 1 ] && [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; fi
if [ -z "${PUBLIC_IP:-}" ]; then
  found=$(detect_public_ip || true)
  if is_private_v4 "$found"; then
    if [ "$DRY" = 1 ]; then echo "PUBLIC_IP: could not be found by itself (a real run would stop here and ask for it in $ENV_FILE)"
    else fail "could not find the public IP by itself (the machine answers with '${found:-nothing}', not a public address). Put it in $ENV_FILE (PUBLIC_IP=...) and run this again."; fi
  else
    PUBLIC_IP=$found
    if [ "$DRY" = 1 ]; then echo "PUBLIC_IP would be $PUBLIC_IP (found by itself; check that it is this machine's public address)"
    else
      sed -i "s/^PUBLIC_IP=.*/PUBLIC_IP=$PUBLIC_IP/" "$ENV_FILE"
      echo "PUBLIC_IP=$PUBLIC_IP (written into $ENV_FILE; check that it is this machine's public address)"
    fi
  fi
fi

say "3. The private network of the browsers"
if [ "$DRY" = 0 ]; then
  # The subnet must not overlap anything that exists (on the production machine the Python sandbox uses 172.30.0.0/16 and 172.31.0.0/16 with rules of their own).
  prefix=$(printf '%s' "$BROWSER_NET_SUBNET" | cut -d. -f1-3)
  taken=$( { ip -4 route; for n in $(docker network ls -q); do docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$n"; done; } 2>/dev/null | grep -F "$prefix." | grep -v " $BROWSER_NET_BRIDGE " || true )
  if [ -n "$taken" ] && ! docker network inspect "$BROWSER_NET_NAME" >/dev/null 2>&1; then
    fail "something already uses $BROWSER_NET_SUBNET ($taken). Choose another BROWSER_NET_SUBNET and BROWSER_NET_GATEWAY in $ENV_FILE and run this again."
  fi
  if docker network inspect "$BROWSER_NET_NAME" >/dev/null 2>&1; then
    echo "network $BROWSER_NET_NAME already exists"
  else
    # icc=false: two browsers cannot talk to each other. masquerade stays on because the live screen's answers must leave through it.
    docker network create --driver bridge --subnet "$BROWSER_NET_SUBNET" --gateway "$BROWSER_NET_GATEWAY" \
      -o com.docker.network.bridge.name="$BROWSER_NET_BRIDGE" -o com.docker.network.bridge.enable_icc=false "$BROWSER_NET_NAME" >/dev/null
    echo "created network $BROWSER_NET_NAME ($BROWSER_NET_SUBNET, bridge $BROWSER_NET_BRIDGE)"
  fi
else
  echo "  [dry-run] docker network create $BROWSER_NET_NAME (from $ENV_FILE)"
fi

say "4. Files and the firewall service"
run install -m 0755 browser-host/firewall.sh "$APP/firewall.sh"
run install -m 0755 browser-host/smoke-test.sh "$APP/smoke-test.sh"
run install -m 0755 browser-host/warp-proxy.sh "$APP/warp-proxy.sh"
run install -m 0644 browser-host/egress-proxy.mjs "$APP/egress-proxy.mjs"
run install -m 0644 browser-host/noureon-browser-firewall.service /etc/systemd/system/noureon-browser-firewall.service
run install -m 0644 browser-host/noureon-browser.slice /etc/systemd/system/noureon-browser.slice
run systemctl daemon-reload
run systemctl enable noureon-browser-firewall.service
run systemctl restart noureon-browser-firewall.service

say "5. The egress proxy (a container on the host network: it must reach WARP on 127.0.0.1 and listen on the bridge address)"
# The upstream (where the browsers' traffic goes out): either EGRESS_UPSTREAM_SOCKS as written, or the SOCKS5 port of an existing container (EGRESS_UPSTREAM_CONTAINER,
# e.g. "warp" on the production machine). A container address changes when the container is recreated: run this script again then (it only recreates the proxy).
UPSTREAM="${EGRESS_UPSTREAM_SOCKS:-}"
if [ -n "${EGRESS_UPSTREAM_CONTAINER:-}" ]; then
  up_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$EGRESS_UPSTREAM_CONTAINER" 2>/dev/null | awk '{print $1}')
  [ -n "$up_ip" ] || fail "the container $EGRESS_UPSTREAM_CONTAINER (EGRESS_UPSTREAM_CONTAINER) has no address; is it running?"
  UPSTREAM="$up_ip:${EGRESS_UPSTREAM_PORT:-1080}"
  echo "upstream: container $EGRESS_UPSTREAM_CONTAINER at $UPSTREAM"
fi
if [ "$DRY" = 0 ]; then
  docker pull node:22-alpine >/dev/null
  docker rm -f noureon-egress >/dev/null 2>&1 || true
  docker run -d --name noureon-egress --restart unless-stopped --network host \
    --user 65534:65534 --read-only --cap-drop=ALL --security-opt no-new-privileges \
    --env-file "$ENV_FILE" -e EGRESS_BIND="$BROWSER_NET_GATEWAY" -e EGRESS_UPSTREAM_SOCKS="$UPSTREAM" \
    -e EGRESS_EXTRA_BLOCK="${PUBLIC_IP}${EGRESS_EXTRA_BLOCK:+,$EGRESS_EXTRA_BLOCK}" \
    -v "$APP/egress-proxy.mjs:/app/egress-proxy.mjs:ro" node:22-alpine node /app/egress-proxy.mjs >/dev/null
  sleep 2
  if curl -fsS -m 5 "http://$BROWSER_NET_GATEWAY:$EGRESS_PORT/healthz" >/dev/null; then echo "egress proxy answers on $BROWSER_NET_GATEWAY:$EGRESS_PORT"; else docker logs noureon-egress | tail -5; fail "the egress proxy does not answer"; fi
else
  echo "  [dry-run] docker run -d --name noureon-egress --network host ... node /app/egress-proxy.mjs"
fi

say "Done. Next:"
echo "  1. If the provider has a cloud firewall or security group: open only what is needed (22 from your own address; the UDP range of the live screen when P3 comes)."
if [ -z "${EGRESS_UPSTREAM_CONTAINER:-}" ] && [ -z "${EGRESS_UPSTREAM_SOCKS:-}" ]; then
  echo "  2. Cloudflare WARP, proxy mode only:   sudo sh $APP/warp-proxy.sh --yes      (read the text it prints first)   [skip it if you want the browsers to go out directly]"
else
  echo "  2. (the way out is already set: ${EGRESS_UPSTREAM_CONTAINER:+container $EGRESS_UPSTREAM_CONTAINER}${EGRESS_UPSTREAM_SOCKS:+ $EGRESS_UPSTREAM_SOCKS}; warp-proxy.sh is not needed)"
fi
echo "  3. Check everything:                    sudo sh $APP/smoke-test.sh"
