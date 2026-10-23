#!/usr/bin/env bash
# Looks at the machine the servers run on, from the inside. Run on the VPS as root:
#
#   bash diagnose.sh            (or: curl the file from the repository and pipe it to bash)
#
# It only reads: nothing is stopped, restarted or changed. Read the lines marked [!] first.
# From outside the machine use scripts/diagnose-server.mjs.

set -u
bad() { printf '  [!] %s\n' "$*"; }
ok()  { printf '  [ok] %s\n' "$*"; }
head_() { printf '\n== %s\n' "$*"; }

head_ "Machine"
uptime
free -m | awk 'NR==1 || /Mem|Swap/'
mem_avail=$(free -m | awk '/Mem/ {print $7}')
[ "${mem_avail:-0}" -lt 400 ] && bad "less than 400 MB of memory is free: the kernel may be killing programs" || ok "memory"
df -h / | awk 'NR==1 || NR==2'
disk_use=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')
[ "${disk_use:-0}" -gt 90 ] && bad "the disk is ${disk_use}% full: builds and logs fail when it is full (docker system df; docker image prune)" || ok "disk ${disk_use}% used"
[ -f /var/run/reboot-required ] && bad "a reboot is waiting for a kernel update"
echo "Killed by the kernel for lack of memory, last lines:"
dmesg -T 2>/dev/null | grep -i -E 'out of memory|killed process' | tail -5 || true

head_ "Docker"
if ! docker info >/dev/null 2>&1; then
  bad "docker is not running (systemctl status docker; journalctl -u docker -n 50)"
else
  ok "docker is running"
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | column -t -s $'\t'
  echo
  docker ps -a --filter status=exited --filter status=restarting --filter status=dead --format '{{.Names}} ({{.Status}})' | while read -r line; do bad "not running: $line"; done
  docker ps --filter health=unhealthy --format '{{.Names}}' | while read -r name; do bad "unhealthy: $name"; done
  for name in $(docker ps -a --format '{{.Names}}'); do
    count=$(docker inspect -f '{{.RestartCount}}' "$name" 2>/dev/null)
    oom=$(docker inspect -f '{{.State.OOMKilled}}' "$name" 2>/dev/null)
    [ "${count:-0}" -gt 3 ] && bad "$name restarted $count times"
    [ "$oom" = "true" ] && bad "$name was killed for lack of memory"
  done
fi

head_ "The proxy (Coolify's Traefik) and the ports"
ss -ltnp 2>/dev/null | grep -E ':(80|443|7788) ' || bad "nothing listens on 80, 443 or 7788"
proxy=$(docker ps --format '{{.Names}}' | grep -i -E 'proxy|traefik' | head -1)
[ -n "$proxy" ] && ok "proxy container: $proxy" || bad "no proxy container is running: no name is reachable (Coolify > Servers > Proxy > Start)"
echo "Answer on the machine itself:"
for host in api.noureon.com api-staging.noureon.com; do
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$host:443:127.0.0.1" "https://$host/healthz" 2>/dev/null)
  case "$code" in
    200) ok "$host /healthz 200" ;;
    000) bad "$host: no answer (TLS or proxy)" ;;
    *)   bad "$host /healthz answers $code (502/503/504 = the application behind the proxy is down; 404 = no application for this name)" ;;
  esac
done

head_ "Python sandbox runner"
runner=$(docker ps -a --format '{{.Names}}' | grep -i sandbox | head -1)
if [ -z "$runner" ]; then
  bad "no sandbox runner container (sandbox-host/install.sh)"
else
  docker ps --format '{{.Names}}' | grep -q "^$runner$" && ok "container $runner is running" || bad "container $runner is not running (docker start $runner)"
  token_file=/etc/noureon-sandbox/token
  gateway=$(ip -4 addr show docker0 2>/dev/null | awk '/inet / {sub("/.*","",$2); print $2}')
  if [ -r "$token_file" ] && [ -n "$gateway" ]; then
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Authorization: Bearer $(cat "$token_file")" "http://$gateway:7788/v1/health")
    [ "$code" = "200" ] && ok "runner answers on $gateway:7788" || bad "runner on $gateway:7788 answers $code (000 = not reachable from here, 401/403 = token differs from SANDBOX_RUNNER_TOKEN of the server)"
  else
    bad "cannot ask the runner: token file ($token_file) or docker0 address missing"
  fi
fi

head_ "What the servers logged lately (errors only)"
for name in $(docker ps -a --format '{{.Names}}' | grep -v -i -E 'coolify|proxy|traefik|sandbox|postgres|redis|realtime|soketi'); do
  echo "-- $name"
  docker logs --since 2h "$name" 2>&1 | grep -E '"event":"(config_error|runs_store_failed|sandbox_failed|slides_unavailable|stopping|unhandled|uncaught|listening)"|Error|ECONN|ENOTFOUND|heap out of memory' | tail -8
done

head_ "Done"
echo "Send the lines marked [!] and the log lines above."
