#!/bin/sh
# shellcheck disable=SC1090,SC2015
# Checks a browser host after install.sh (design §10.6, items 1 and 7 partly; the rest needs the browsers of P1). Prints PASS or FAIL per check and
# exits 1 when any check fails. Run as root:  sh /opt/noureon-browser/smoke-test.sh
# The checks run from a throwaway container on the browser network, because that is what a browser container sees.
set -u

ENV_FILE="${NOUREON_BROWSER_ENV:-/etc/noureon-browser/host.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
NET="${BROWSER_NET_NAME:-noureon-browser}"
BR="${BROWSER_NET_BRIDGE:-nbr0}"
GW="${BROWSER_NET_GATEWAY:-172.30.0.1}"
PORT="${EGRESS_PORT:-40001}"
PUBLIC="${PUBLIC_IP:-}"
IMAGE=curlimages/curl:8.10.1

FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
# Runs curl inside a container on the browser network (same user and limits a browser container will have).
inbox() { docker run --rm --network "$NET" --user 65534:65534 --cap-drop=ALL --security-opt no-new-privileges "$IMAGE" "$@" 2>/dev/null; }

[ "$(id -u)" = "0" ] || { echo "run this as root"; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed"; exit 2; }
docker pull "$IMAGE" >/dev/null 2>&1 || true

echo "== Setup =="
docker info >/dev/null 2>&1 && pass "Docker is running" || bad "Docker is not running"
docker network inspect "$NET" >/dev/null 2>&1 && pass "network $NET exists" || bad "network $NET is missing (run install.sh)"
ip link show "$BR" >/dev/null 2>&1 && pass "bridge $BR exists" || bad "bridge $BR is missing"
iptables -n -L NOUREON-BROWSER-FWD >/dev/null 2>&1 && pass "firewall chain for forwarded traffic is in place" || bad "firewall chain NOUREON-BROWSER-FWD is missing"
iptables -n -L NOUREON-BROWSER-IN >/dev/null 2>&1 && pass "firewall chain for traffic to this machine is in place" || bad "firewall chain NOUREON-BROWSER-IN is missing"
[ "$(docker inspect -f '{{.State.Running}}' noureon-egress 2>/dev/null)" = "true" ] && pass "egress proxy container is running" || bad "egress proxy container is not running"
[ "$(curl -s -m 5 "http://$GW:$PORT/healthz" 2>/dev/null)" = "ok" ] && pass "egress proxy answers on $GW:$PORT" || bad "egress proxy does not answer on $GW:$PORT"
[ -n "$PUBLIC" ] && pass "PUBLIC_IP is set ($PUBLIC)" || bad "PUBLIC_IP is empty in $ENV_FILE"

echo; echo "== A browser container cannot get out by itself =="
inbox -s -m 6 -o /dev/null https://1.1.1.1/ && bad "direct internet (1.1.1.1) is reachable" || pass "direct internet is blocked"
inbox -s -m 6 -o /dev/null http://169.254.169.254/latest/meta-data/ && bad "the metadata service (169.254.169.254) is reachable directly" || pass "the metadata service is blocked (direct)"
inbox -s -m 6 -o /dev/null "http://$GW:22/" && bad "port 22 of this machine is reachable from the browser network" || pass "port 22 of this machine is not reachable from the browser network"
inbox -s -m 6 -o /dev/null "http://$GW:8080/" && bad "port 8080 of this machine is reachable from the browser network" || pass "other ports of this machine are not reachable from the browser network"
if [ -n "$PUBLIC" ]; then
  inbox -s -m 6 -o /dev/null "http://$PUBLIC:22/" && bad "the public address of this machine is reachable directly" || pass "the public address of this machine is not reachable directly"
fi

echo; echo "== Through the egress proxy =="
via() { inbox -s -m 15 -x "http://$GW:$PORT" "$@"; }
code=$(via -o /dev/null -w '%{http_code}' https://example.com/ || true)
case "$code" in 200|301|302) pass "https://example.com through the proxy works ($code)" ;; *) bad "https://example.com through the proxy failed (got '$code')" ;; esac
code=$(via -o /dev/null -w '%{http_code}' http://example.com/ || true)
case "$code" in 200|301|302) pass "plain http through the proxy works ($code)" ;; *) bad "plain http through the proxy failed (got '$code')" ;; esac
refused() { # name, url
  out=$(via -o /dev/null -w '%{http_code}' "$2" 2>/dev/null || true)
  # A refusal is a 403 from the proxy (for https the CONNECT fails, curl prints 000).
  case "$out" in 403|000) pass "refused: $1" ;; *) bad "NOT refused: $1 (got '$out')" ;; esac
}
refused "the metadata service" http://169.254.169.254/latest/meta-data/
refused "localhost" http://localhost/
refused "a private address (10.0.0.1)" http://10.0.0.1/
refused "a private address (192.168.1.1) over https" https://192.168.1.1/
refused "the decimal form of 127.0.0.1" http://2130706433/
refused "port 25 (mail)" http://example.com:25/
refused "port 22 (ssh)" http://example.com:22/
if [ -n "$PUBLIC" ]; then refused "the public address of this machine" "http://$PUBLIC/"; fi

echo; echo "== Cloudflare WARP =="
if ip link show CloudflareWARP >/dev/null 2>&1 && ip route get 8.8.8.8 2>/dev/null | grep -q CloudflareWARP; then
  bad "WARP is in full-tunnel mode: it carries ALL traffic of this machine, which breaks the live screen (WebRTC) and can cut off ssh. Run warp-proxy.sh."
else
  pass "WARP is not carrying all traffic of this machine"
fi
direct=$(curl -s -m 8 https://checkip.amazonaws.com 2>/dev/null || true)
proxied=$(via https://checkip.amazonaws.com || true)
info "this machine goes out as:   ${direct:-unknown}"
info "the browsers go out as:     ${proxied:-unknown}"
if [ -n "$proxied" ] && [ -n "$direct" ] && [ "$proxied" != "$direct" ]; then
  pass "the browsers do not go out through this machine's own address (WARP or another upstream is in use)"
else
  info "the browsers go out through this machine's own address (WARP is not in use; fine if that is what you want)"
fi
if command -v warp-cli >/dev/null 2>&1; then info "warp-cli status: $(warp-cli --accept-tos status 2>/dev/null | tr '\n' ' ')"; else info "warp-cli is not installed"; fi

echo; echo "== The metadata service of THIS machine =="
code=$(curl -s -m 4 -o /dev/null -w '%{http_code}' http://169.254.169.254/latest/meta-data/ 2>/dev/null || true)
case "$code" in 401|403) pass "metadata version 1 is refused (IMDSv2 is required)" ;; 000) info "no metadata service answers (not AWS, or it is switched off)" ;; *) bad "metadata version 1 answers ($code): require IMDSv2 in the instance settings" ;; esac
token=$(curl -s -m 4 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)
if [ -n "$token" ]; then
  role=$(curl -s -m 4 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/iam/security-credentials/ 2>/dev/null || true)
  case "$role" in "") pass "no IAM role is attached" ;; *"<"*|*"Not Found"*) pass "no IAM role is attached" ;; *) bad "an IAM role is attached ($role): detach it" ;; esac
  it=$(curl -s -m 4 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-type 2>/dev/null || true)
  info "instance type: ${it:-unknown}  (burstable t-types run out of CPU credits under load: measure, or use a c or m type)"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL CHECKS PASSED"; exit 0; fi
echo "$FAILS CHECK(S) FAILED"; exit 1
