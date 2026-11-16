#!/bin/sh
# shellcheck disable=SC1090
# Temporary rule for the experiment (experiments/browser-live/variants/prod-host.yml): only ONE address may open new connections into the browser network,
# so the neko page and the live-screen ports answer to you and to nobody else, whatever the passwords are. It adds one rule at the top of DOCKER-USER, tagged
# "noureon-experiment", and "remove" takes it out. Nothing else is touched. Replies to connections that already exist are not affected.
#   sudo sh browser-host/experiment-allow-only.sh add <your public IPv4>
#   sudo sh browser-host/experiment-allow-only.sh remove
#   sudo sh browser-host/experiment-allow-only.sh status
set -eu
ENV_FILE="${NOUREON_BROWSER_ENV:-/etc/noureon-browser/host.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
NET="${BROWSER_NET_SUBNET:-172.29.0.0/24}"
TAG=noureon-experiment
[ "$(id -u)" = 0 ] || { echo "run this with sudo"; exit 1; }
# Removes every rule that carries our tag, exactly as iptables prints it (no parsing of the rule itself, so nothing is left behind whatever the format).
remove_all() {
  iptables -S DOCKER-USER | grep -- "--comment $TAG" | while read -r line; do
    # shellcheck disable=SC2086
    iptables -D DOCKER-USER ${line#-A DOCKER-USER }
  done
}
case "${1:-}" in
  add)
    ip="${2:-}"
    printf '%s' "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "give one IPv4 address: add 203.0.113.7"; exit 1; }
    case "$ip" in 10.*|127.*|192.168.*|172.1[6-9].*|172.2*|172.3[01].*|169.254.*|0.*) echo "that is a private address; give your PUBLIC address (open https://ifconfig.me on your computer)"; exit 1;; esac
    remove_all
    # Order matters: a RETURN for the allowed address first (it goes on to the browser firewall chain), then a DROP for every other NEW connection into the network.
    iptables -I DOCKER-USER 1 -d "$NET" -m conntrack --ctstate NEW -m comment --comment "$TAG" -j DROP
    iptables -I DOCKER-USER 1 -d "$NET" -m conntrack --ctstate NEW -s "$ip" -m comment --comment "$TAG" -j RETURN
    echo "only $ip may open new connections into $NET now (remove it when the experiment is over)"
    ;;
  remove)
    remove_all
    echo "experiment rule removed"
    ;;
  status) iptables -S DOCKER-USER | grep -- "$TAG" || echo "no experiment rule" ;;
  *) echo "usage: $0 add <ip> | remove | status"; exit 2 ;;
esac
