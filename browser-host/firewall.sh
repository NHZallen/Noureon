#!/bin/sh
# shellcheck disable=SC1090,SC2015
# The firewall rules of the browser host (IPv4 and IPv6):
#   - a browser container may start NO connection to anything except the egress proxy on the gateway address (so no direct internet, no DNS,
#     no metadata service, no other container, no other port of this machine, no ssh);
#   - answers to connections that came IN (the WebRTC media, the live screen) are allowed, because they belong to those connections.
# Usage: firewall.sh apply | remove | status        (run as root; the systemd unit noureon-browser-firewall.service runs "apply" after Docker starts)
set -eu

ENV_FILE="${NOUREON_BROWSER_ENV:-/etc/noureon-browser/host.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
BR="${BROWSER_NET_BRIDGE:-nbr0}"
GW="${BROWSER_NET_GATEWAY:-172.29.0.1}"
PORT="${EGRESS_PORT:-40001}"
CHAIN_FWD=NOUREON-BROWSER-FWD
CHAIN_IN=NOUREON-BROWSER-IN

has_chain() { iptables -n -L "$1" >/dev/null 2>&1; }

remove_rules() {
  # Take the jumps out (as often as they are there), then the chains.
  while iptables -D DOCKER-USER -j "$CHAIN_FWD" 2>/dev/null; do :; done
  while iptables -D INPUT -j "$CHAIN_IN" 2>/dev/null; do :; done
  for chain in "$CHAIN_FWD" "$CHAIN_IN"; do
    if has_chain "$chain"; then iptables -F "$chain"; iptables -X "$chain"; fi
  done
  if command -v ip6tables >/dev/null 2>&1; then
    while ip6tables -D FORWARD -i "$BR" -j DROP 2>/dev/null; do :; done
    while ip6tables -D INPUT -i "$BR" -j DROP 2>/dev/null; do :; done
  fi
}

apply_rules() {
  has_chain DOCKER-USER || { echo "DOCKER-USER chain not found: is Docker running (and not started with --iptables=false)?" >&2; exit 1; }
  remove_rules

  # Forwarded traffic that comes out of a browser container (to the internet or to other machines/containers):
  iptables -N "$CHAIN_FWD"
  iptables -A "$CHAIN_FWD" -i "$BR" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  iptables -A "$CHAIN_FWD" -i "$BR" -j REJECT --reject-with icmp-admin-prohibited
  iptables -A "$CHAIN_FWD" -j RETURN
  iptables -I DOCKER-USER 1 -j "$CHAIN_FWD"

  # Traffic from a browser container to this machine itself: only the egress proxy.
  iptables -N "$CHAIN_IN"
  iptables -A "$CHAIN_IN" -i "$BR" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A "$CHAIN_IN" -i "$BR" -p tcp -d "$GW" --dport "$PORT" -j ACCEPT
  iptables -A "$CHAIN_IN" -i "$BR" -j REJECT --reject-with icmp-admin-prohibited
  iptables -A "$CHAIN_IN" -j RETURN
  iptables -I INPUT 1 -j "$CHAIN_IN"

  # The containers have no IPv6; if anything ever has, it goes nowhere either.
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -I FORWARD 1 -i "$BR" -j DROP 2>/dev/null || true
    ip6tables -I INPUT 1 -i "$BR" -j DROP 2>/dev/null || true
  fi
  echo "firewall: browser containers on $BR can only reach the egress proxy at $GW:$PORT"
}

case "${1:-}" in
  apply) apply_rules ;;
  remove) remove_rules; echo "firewall: rules removed" ;;
  status)
    for chain in "$CHAIN_FWD" "$CHAIN_IN"; do
      if has_chain "$chain"; then echo "--- $chain"; iptables -S "$chain"; else echo "--- $chain: MISSING"; fi
    done
    iptables -S DOCKER-USER | sed 's/^/DOCKER-USER: /'
    ;;
  *) echo "usage: $0 apply | remove | status" >&2; exit 2 ;;
esac
