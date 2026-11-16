#!/bin/sh
# shellcheck disable=SC1090,SC2015
# What two browsers cost when NOBODY is watching but a program drives them (design §2.6: "two at a time"; rounds seven to nine measured only watched ones).
# It starts two browsers (two users), opens a new page in each every 6 seconds for the given time, and prints the load of the machine and the CPU of the two
# containers every 15 seconds, so the effect on the other services shows. It stops at once if the load of the machine goes over the limit.
#   sudo sh browser-host/e2e-load.sh [seconds=90] [load-limit=12]
set -u
[ "$(id -u)" = 0 ] || { echo "run this with sudo"; exit 1; }
SECONDS_TO_RUN="${1:-90}"; LIMIT="${2:-12}"
ENV_FILE=/etc/noureon-browser/host.env; SVC=/opt/noureon-browser/service
. "$ENV_FILE"
STAMP=$(date +%s); IDS="load-$STAMP-aaa load-$STAMP-bbb"
call() { ( BROWSER_HOST_BIND="${BROWSER_HOST_BIND:-172.29.0.1}" node "$SVC/call.mjs" "$@" 2>&1 ); }
field() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(String(JSON.parse(s)[process.argv[1]]??""))}catch{console.log("")}})' "$2"; }
cleanup() { for id in $IDS; do call DELETE "/v1/sessions/$id" >/dev/null; done; }
trap cleanup EXIT INT TERM
n=0; for id in $IDS; do n=$((n + 1)); call POST /v1/sessions --json "{\"sessionId\":\"$id\",\"userId\":\"load-user-$n\",\"screen\":{}}" >/dev/null; done
for id in $IDS; do i=0; while [ "$i" -lt 60 ]; do [ "$(field "$(call GET "/v1/sessions/$id" | sed -n 2p)" state)" = ready ] && break; i=$((i + 1)); sleep 2; done; done
echo "both browsers are up; load now: $(cut -d' ' -f1 /proc/loadavg)"
PAGES="https://en.wikipedia.org/wiki/Web_browser https://www.wikipedia.org/ https://news.ycombinator.com/ https://example.com/ https://en.wikipedia.org/wiki/Chromium_(web_browser)"
drive() { id=$1; end=$(( $(date +%s) + SECONDS_TO_RUN ))
  while [ "$(date +%s)" -lt "$end" ]; do
    for url in $PAGES; do
      [ "$(date +%s)" -lt "$end" ] || break
      call POST "/v1/sessions/$id/actions" --json "{\"type\":\"navigate\",\"url\":\"$url\"}" >/dev/null; sleep 6
    done
  done; }
for id in $IDS; do drive "$id" & done
t=0; peak=0
while [ "$t" -lt "$SECONDS_TO_RUN" ]; do
  sleep 15; t=$((t + 15)); load=$(cut -d' ' -f1 /proc/loadavg)
  echo "-- ${t}s: load1=$load"
  for id in $IDS; do docker stats --no-stream --format '   {{.Name}} cpu {{.CPUPerc}} mem {{.MemUsage}}' "noureon-browser-$id" 2>/dev/null; done
  vmstat 1 2 | tail -1 | awk '{print "   machine: idle " $15 "%  steal " $17 "%"}'
  peak=$(echo "$load $peak" | awk '{print ($1 > $2) ? $1 : $2}')
  if [ "$(echo "$load $LIMIT" | awk '{print ($1 > $2) ? 1 : 0}')" = 1 ]; then echo "STOP: the load is over $LIMIT"; break; fi
done
wait 2>/dev/null
echo "peak load1 during the test: $peak (limit $LIMIT)"
