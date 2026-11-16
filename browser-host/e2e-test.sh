#!/bin/sh
# shellcheck disable=SC1090,SC2015
# P1 acceptance on the real machine (design doc §12 P1 and §10.6 items 1, 2, 7). It talks to the running service the way the main server will (signed requests),
# starts real browsers, and checks: a page opens, a screenshot comes back, the sandbox is ON, a page cannot reach DevTools, the container has no more than it
# should, no secret is inside it, a login state survives a restart of the browser, the limits (two at a time, one per user) hold, and nothing is left behind.
# It needs the service (install.sh step 6) and internet access through the egress proxy (it opens https://httpbin.org). It starts and removes its own browsers only.
#   sudo sh browser-host/e2e-test.sh
set -u
[ "$(id -u)" = 0 ] || { echo "run this with sudo"; exit 1; }
ENV_FILE=/etc/noureon-browser/host.env
APP=/opt/noureon-browser; SVC=$APP/service
HERE=$(cd "$(dirname "$0")" && pwd); EXP="$HERE/../experiments/browser-live"
[ -f "$ENV_FILE" ] && [ -f "$SVC/call.mjs" ] || { echo "STOP: the service is not installed (run browser-host/install.sh)"; exit 1; }
. "$ENV_FILE"
STAMP=$(date +%s); A="e2e-$STAMP-aaa"; B="e2e-$STAMP-bbb"; C="e2e-$STAMP-ccc"; D="e2e-$STAMP-ddd"
OUT=$(mktemp -d); trap 'cleanup' EXIT INT TERM
FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
call() { ( BROWSER_HOST_BIND="${BROWSER_HOST_BIND:-172.29.0.1}" node "$SVC/call.mjs" "$@" 2>&1 ); }
status() { printf '%s' "$1" | sed -n 1p | awk '{print $2}'; }
body() { printf '%s' "$1" | sed -n 2p; }
field() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(String(JSON.parse(s)[process.argv[1]]??""))}catch{console.log("")}})' "$2"; }
cleanup() {
  for id in "$A" "$B" "$C" "$D"; do call DELETE "/v1/sessions/$id" >/dev/null; done
  rm -rf "$OUT"
}
wait_ready() { # id
  i=0; while [ "$i" -lt 60 ]; do st=$(field "$(body "$(call GET "/v1/sessions/$1")")" state); [ "$st" = ready ] && return 0; [ "$st" = failed ] && return 1; i=$((i + 1)); sleep 2; done; return 1
}
sidecar() { # session, script, mount name
  docker run --rm --network "container:noureon-browser-$1" --cap-drop=ALL --read-only --user 65534:65534 --security-opt no-new-privileges -v "$2:/app/x.mjs:ro" node:22-alpine node /app/x.mjs 2>&1
}
NAME_A="noureon-browser-$A"

echo "== The service"
r=$(call GET /v1/health); [ "$(status "$r")" = 200 ] && pass "the service answers a signed health check: $(body "$r")" || { bad "the service does not answer: $r"; exit 1; }
r=$(BROWSER_HOST_SECRET="$(printf 'x%.0s' $(seq 1 40))" node "$SVC/call.mjs" GET /v1/health 2>&1); [ "$(status "$r")" = 401 ] && pass "a request signed with the wrong secret is refused (401)" || bad "a wrong secret was not refused: $r"

echo; echo "== A browser starts, opens a page, and shows it"
r=$(call POST /v1/sessions --json "{\"sessionId\":\"$A\",\"userId\":\"e2e-user-a\",\"screen\":{\"w\":1024,\"h\":768}}")
[ "$(status "$r")" = 202 ] && pass "a browser was ordered (202)" || { bad "could not order a browser: $r"; exit 1; }
wait_ready "$A" && pass "it is ready" || { bad "it did not become ready: $(body "$(call GET "/v1/sessions/$A")")"; docker logs "$NAME_A" 2>&1 | tail -8; exit 1; }
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"navigate","url":"https://example.com/"}'); [ "$(status "$r")" = 200 ] && pass "a page opens through the egress proxy: $(field "$(body "$r")" title)" || bad "could not open https://example.com/ : $r"
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"screenshot"}' --out "$OUT/shot.png"); [ "$(status "$r")" = 200 ] && [ -s "$OUT/shot.png" ] && pass "a screenshot came back ($(wc -c < "$OUT/shot.png") bytes, $(file -b "$OUT/shot.png" | cut -c1-40))" || bad "no screenshot: $r"
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"navigate","url":"chrome://sandbox"}'); [ "$(status "$r")" = 400 ] && pass "an internal page is refused (400)" || bad "chrome://sandbox was not refused: $r"
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"snapshot","maxChars":500}'); printf '%s' "$r" | grep -q '"role":"link"' && pass "snapshot lists the things on the page that can be acted on" || bad "snapshot found no link on https://example.com/ : $(printf '%s' "$r" | cut -c1-150)"
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"tabs","op":"list"}'); [ "$(status "$r")" = 200 ] && pass "tabs: $(body "$r" | cut -c1-120)" || bad "tabs failed: $r"

echo; echo "== The sandbox, DevTools, and what the container has (design 10.6 items 1, 2, 7)"
out=$(sidecar "$A" "$EXP/check-sandbox.mjs"); printf '%s' "$out" | grep -q "adequately sandboxed" && ! printf '%s' "$out" | grep -q "NOT adequately" && pass "chrome://sandbox says: adequately sandboxed" || { bad "the sandbox is not confirmed"; printf '%s\n' "$out" | sed 's/^/        /' | head -12; }
if out=$(sidecar "$A" "$SVC/check-origin.mjs"); then pass "a page cannot talk to DevTools (a foreign Origin is refused, the controller is let in)"; else bad "DevTools can be reached from a page"; printf '%s\n' "$out" | sed 's/^/        /'; fi
n=$(docker exec "$NAME_A" sh -c "ps -eo args | grep -c '[n]o-sandbox'" 2>/dev/null); [ "${n:-1}" = 0 ] && pass "no process of the browser has --no-sandbox" || bad "--no-sandbox is on a command line ($n)"
users=$(docker exec "$NAME_A" sh -c "ps -eo user:12,args | grep '[u]sr/lib/chromium/chromium' | awk '{print \$1}' | sort -u | tr '\n' ' '" 2>/dev/null); [ "$users" = "neko " ] && pass "Chromium runs as the user neko, not root" || bad "Chromium runs as: $users"
caps=$(docker inspect -f '{{range .HostConfig.CapAdd}}{{.}} {{end}}' "$NAME_A" | tr ' ' '\n' | sort | tr '\n' ' ')
[ "$caps" = "CHOWN DAC_OVERRIDE FOWNER KILL SETGID SETUID " ] && pass "capabilities: all dropped, only $caps added back" || bad "capabilities are: $caps"
[ "$(docker inspect -f '{{.HostConfig.Privileged}}' "$NAME_A")" = false ] && pass "not privileged" || bad "the container is privileged"
docker inspect -f '{{.HostConfig.SecurityOpt}}' "$NAME_A" | grep -q no-new-privileges && pass "no-new-privileges is on" || bad "no-new-privileges is missing"
[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$NAME_A")" = noureon-browser ] && pass "it is on the isolated network" || bad "wrong network"
[ "$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$NAME_A")" = 0 ] && pass "no port is published" || bad "a port is published"
[ "$(docker inspect -f '{{.HostConfig.Memory}}' "$NAME_A")" -gt 0 ] && pass "memory is limited ($(docker inspect -f '{{.HostConfig.Memory}}' "$NAME_A") bytes)" || bad "no memory limit"
mounts=$(docker inspect -f '{{range .Mounts}}{{.Destination}}{{" "}}{{end}}' "$NAME_A" | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ' ')
echo "$mounts" | grep -q "docker.sock" && bad "the docker socket is mounted" || pass "no docker socket; mounts: $mounts"
secret_first=$(printf '%s' "$BROWSER_HOST_SECRET" | cut -d, -f1)
{ docker inspect "$NAME_A"; docker exec "$NAME_A" sh -c 'cat /proc/1/environ 2>/dev/null | tr "\0" "\n"; env' 2>/dev/null; } | grep -qF "$secret_first" && bad "the host secret is inside the container" || pass "the host secret is nowhere in the container (its settings, its environment)"

echo; echo "== A login state survives a restart of the browser"
r=$(call POST "/v1/sessions/$A/actions" --json '{"type":"navigate","url":"https://httpbin.org/cookies/set?e2ekey=e2evalue"}')
t=$(call POST "/v1/sessions/$A/actions" --json '{"type":"text"}')
if printf '%s' "$t" | grep -q e2evalue; then
  pass "a cookie was set by a real site"
  sleep 3
  r=$(call POST "/v1/sessions/$A/save" --out "$OUT/profile.tar.gz"); [ "$(status "$r")" = 200 ] && [ -s "$OUT/profile.tar.gz" ] && pass "the login state was packed ($(wc -c < "$OUT/profile.tar.gz") bytes)" || bad "could not pack the login state: $r"
  tar tzf "$OUT/profile.tar.gz" 2>/dev/null | grep -qi 'cookies' && pass "the archive holds the cookie database" || bad "no cookie database in the archive"
  tar tzf "$OUT/profile.tar.gz" 2>/dev/null | grep -qE '(^|/)(Cache|Code Cache|GPUCache)/' && bad "caches are inside the archive" || pass "caches are left out of the archive"
  r=$(call DELETE "/v1/sessions/$A"); [ "$(status "$r")" = 200 ] && pass "the first browser was closed" || bad "could not close it: $r"
  [ -z "$(docker ps -aq --filter "name=$NAME_A")" ] && [ -z "$(docker volume ls -q --filter "name=noureon-profile-$A")" ] && pass "no container and no volume of it is left" || bad "something of the first browser is left"
  r=$(call POST /v1/sessions --json "{\"sessionId\":\"$D\",\"userId\":\"e2e-user-a\",\"screen\":{},\"hasProfile\":true}"); [ "$(field "$(body "$r")" state)" = awaiting_profile ] && pass "a new browser waits for the login state" || bad "unexpected: $r"
  r=$(call PUT "/v1/sessions/$D/profile" --file "$OUT/profile.tar.gz"); [ "$(status "$r")" = 202 ] && pass "the login state was sent" || bad "could not send it: $r"
  wait_ready "$D" && pass "the second browser is ready" || bad "the second browser did not start"
  call POST "/v1/sessions/$D/actions" --json '{"type":"navigate","url":"https://httpbin.org/cookies"}' >/dev/null
  t=$(call POST "/v1/sessions/$D/actions" --json '{"type":"text"}')
  printf '%s' "$t" | grep -q e2evalue && pass "THE LOGIN STATE SURVIVED: the second browser still has the cookie" || { bad "the cookie did not survive"; printf '%s\n' "$t" | cut -c1-200; }
  call DELETE "/v1/sessions/$D" >/dev/null
else
  bad "could not set a cookie through https://httpbin.org (is the egress proxy up? $(printf '%s' "$r" | cut -c1-150)); the survival test is skipped"
  call DELETE "/v1/sessions/$A" >/dev/null
fi

echo; echo "== The limits: two browsers at a time, one per user"
call POST /v1/sessions --json "{\"sessionId\":\"$A\",\"userId\":\"e2e-u1\",\"screen\":{}}" >/dev/null
call POST /v1/sessions --json "{\"sessionId\":\"$B\",\"userId\":\"e2e-u2\",\"screen\":{}}" >/dev/null
r=$(call POST /v1/sessions --json "{\"sessionId\":\"$C\",\"userId\":\"e2e-u3\",\"screen\":{}}"); [ "$(field "$(body "$r")" state)" = queued ] && pass "the third browser waits (position $(field "$(body "$r")" position))" || bad "the third browser was not queued: $r"
r=$(call POST /v1/sessions --json "{\"sessionId\":\"$D\",\"userId\":\"e2e-u1\",\"screen\":{}}"); [ "$(status "$r")" = 409 ] && pass "the same user cannot have two (409)" || bad "second browser of one user was allowed: $r"
wait_ready "$A" && wait_ready "$B" && pass "two browsers run at the same time" || bad "two browsers did not run together"
call DELETE "/v1/sessions/$A" >/dev/null; sleep 2
r=$(call GET "/v1/sessions/$C"); [ "$(field "$(body "$r")" state)" != queued ] && pass "when one stops, the waiting one moves up ($(field "$(body "$r")" state))" || bad "the waiting browser did not move up"

echo; echo "== Nothing is left"
for id in "$A" "$B" "$C" "$D"; do call DELETE "/v1/sessions/$id" >/dev/null; done; sleep 4
left=$(docker ps -aq --filter label=noureon.browser=1 | wc -l | tr -d ' '); vols=$(docker volume ls -q --filter label=noureon.browser=1 | wc -l | tr -d ' ')
[ "$left" = 0 ] && [ "$vols" = 0 ] && pass "no container and no volume of the browsers is left" || bad "left over: $left containers, $vols volumes"

echo
[ "$FAILS" = 0 ] && echo "ALL CHECKS PASSED" || echo "$FAILS CHECK(S) FAILED"
[ "$FAILS" = 0 ]
