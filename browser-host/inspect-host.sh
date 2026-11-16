#!/bin/sh
# shellcheck disable=SC2015
# READ-ONLY look at a machine, to decide how the browsers can live on it (design §10, §11). It changes nothing and prints no secret: no environment of any
# container, no `docker inspect`, no config files except Docker's daemon.json. Run as root and paste the whole output.
#     sudo sh browser-host/inspect-host.sh
set -u
h() { printf '\n== %s ==\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
run() { printf '$ %s\n' "$*"; "$@" 2>&1 | head -"${LINES_MAX:-40}"; }

[ "$(id -u)" = "0" ] || echo "(not root: some answers will be missing)"

h "Machine"
run uname -a
[ -f /etc/os-release ] && grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
echo "cpus: $(nproc)"; lscpu 2>/dev/null | grep -E 'Model name|Thread|Core|Socket|Hypervisor' | sed 's/^/  /'
run free -m
run df -h /
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)   (cpus: $(nproc))"
have vmstat && { echo '$ vmstat 1 6   (the "st" column is CPU taken by other tenants)'; vmstat 1 6 2>&1 | tail -7; }
echo "region/provider hints:"; (have curl && curl -s -m 3 https://ipinfo.io/org 2>/dev/null; echo) | sed 's/^/  /'

h "Kernel features the isolation depends on"
echo "cgroup version: $(stat -fc %T /sys/fs/cgroup 2>/dev/null) (cgroup2fs = v2)"
echo "user namespaces allowed: $(cat /proc/sys/user/max_user_namespaces 2>/dev/null)"
echo "unprivileged user namespaces: $(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo n/a)   apparmor userns restriction: $(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a)"
echo "seccomp: $(grep -c . /proc/sys/kernel/seccomp/actions_avail 2>/dev/null || echo n/a)   apparmor: $(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || echo n/a)"
echo "kvm device (needed by some sandboxes): $( [ -e /dev/kvm ] && echo yes || echo no )"
echo "systemd: $(systemctl --version 2>/dev/null | head -1)"

h "Docker"
if have docker; then
  run docker --version
  echo '$ docker info (selected)'; docker info 2>&1 | grep -E 'Storage Driver|Cgroup|Runtimes|Default Runtime|Rootless|Security Options|Live Restore|Operating System|Containers:|Images:' | sed 's/^/  /'
  echo '$ /etc/docker/daemon.json'; cat /etc/docker/daemon.json 2>&1 | sed 's/^/  /' | head -30
  echo '$ docker ps (names, images, ports, status only)'; docker ps --format '  {{.Names}} | {{.Image}} | {{.Ports}} | {{.Status}}' 2>&1 | head -40
  echo '$ docker network ls'; docker network ls 2>&1 | head -20
  echo '$ docker stats --no-stream (CPU and memory now)'; docker stats --no-stream --format '  {{.Name}} | cpu {{.CPUPerc}} | mem {{.MemUsage}}' 2>&1 | head -40
  have runsc && echo "gVisor (runsc): installed" || echo "gVisor (runsc): not installed"
  have podman && echo "podman: installed" || echo "podman: not installed"
else
  echo "docker is not installed"
fi

h "Firewall (rules only)"
if have iptables; then
  echo "iptables backend: $(iptables --version 2>&1)"
  echo '$ iptables -S | head'; iptables -S 2>&1 | head -60 | sed 's/^/  /'
  echo '$ iptables -S DOCKER-USER'; iptables -S DOCKER-USER 2>&1 | sed 's/^/  /'
  echo "NAT table (first lines):"; iptables -t nat -S 2>&1 | head -25 | sed 's/^/  /'
else echo "iptables is not installed"; fi
have nft && { echo '$ nft list tables'; nft list tables 2>&1 | head -10 | sed 's/^/  /'; }
have ufw && { echo '$ ufw status'; ufw status 2>&1 | head -20 | sed 's/^/  /'; }

h "What listens (who can be reached from a container through the gateway)"
have ss && ss -tulpnH 2>/dev/null | awk '{print "  " $1 " " $5 " " $7}' | head -50

h "Cloudflare WARP"
have warp-cli && { warp-cli --accept-tos status 2>&1 | head -6 | sed 's/^/  /'; ip link show CloudflareWARP >/dev/null 2>&1 && echo "  interface CloudflareWARP exists (full tunnel?)"; } || echo "warp-cli is not installed"

h "Existing pieces of this project on the machine"
for d in /etc/noureon-sandbox /var/lib/noureon-sandbox /opt/noureon-browser /etc/noureon-browser; do [ -e "$d" ] && echo "  exists: $d"; done
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Ei 'sandbox|runner|neko|egress|coolify|traefik|proxy' | sed 's/^/  container: /'

echo
echo "Done. Nothing was changed."
