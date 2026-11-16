#!/bin/sh
# shellcheck disable=SC1090,SC2015
# One question, answered on the real machine: when is a cookie that lasts lost? The acceptance test showed that a new browser which is given the packed login state of an earlier one
# finds no cookie, although the packed database holds it, so something removes it when the second browser starts. This tries, with ONE browser:
#   D) Chromium alone is stopped (SIGINT, the way supervisord stops it) and starts again inside the same container;
#   A) the whole container is stopped and started again (same container, same folder, nothing unpacked).
# After each, it asks the browser for its cookies (names only) and reads the cookie database. It starts and removes one browser of its own and nothing else.
#   sudo sh browser-host/probe-cookie.sh
set -u
[ "$(id -u)" = 0 ] || { echo "run this with sudo"; exit 1; }
ENV_FILE=/etc/noureon-browser/host.env; SVC=/opt/noureon-browser/service
[ -f "$ENV_FILE" ] && [ -f "$SVC/call.mjs" ] || { echo "STOP: the service is not installed"; exit 1; }
. "$ENV_FILE"
ID="probe-$(date +%s)-aaa"; NAME="noureon-browser-$ID"; OUT=$(mktemp -d)
trap 'call DELETE "/v1/sessions/$ID" >/dev/null; rm -rf "$OUT"' EXIT INT TERM
call() { ( BROWSER_HOST_SECRET="$BROWSER_HOST_SECRET" BROWSER_HOST_BIND="${BROWSER_HOST_BIND:-172.29.0.1}" BROWSER_HOST_PORT="${BROWSER_HOST_PORT:-40010}" node "$SVC/call.mjs" "$@" 2>&1 ); }
dump() { # label
  docker cp "$NAME:/home/neko/.config/chromium/Default/Cookies" "$OUT/c.db" >/dev/null 2>&1 || { echo "  $1: no cookie database to read"; return; }
  python3 - "$OUT/c.db" "$1" <<'PY'
import sqlite3, sys
try:
    db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro&immutable=1", uri=True)
    rows = db.execute("select host_key, name, is_persistent from cookies").fetchall()
    print(f"  {sys.argv[2]}: database holds {len(rows)} cookie(s): {rows}")
except Exception as error:
    print(f"  {sys.argv[2]}: could not read ({error})")
PY
}
has_cookie() { # label
  call POST "/v1/sessions/$ID/actions" --json '{"type":"navigate","url":"https://httpbin.org/cookies"}' >/dev/null
  t=$(call POST "/v1/sessions/$ID/actions" --json '{"type":"text"}')
  if printf '%s' "$t" | grep -q e2elong; then echo "  $1: the cookie that lasts is THERE"; else echo "  $1: the cookie that lasts is GONE ($(printf '%s' "$t" | cut -c1-120))"; fi
}
wait_action() { i=0; while [ "$i" -lt 45 ]; do call POST "/v1/sessions/$ID/actions" --json '{"type":"tabs","op":"list"}' | grep -q '"ok":true' && return 0; i=$((i + 1)); sleep 2; done; return 1; }

echo "== start one browser"
call POST /v1/sessions --json "{\"sessionId\":\"$ID\",\"userId\":\"probe-user\",\"screen\":{}}" | sed -n 1p
i=0; while [ "$i" -lt 60 ]; do call GET "/v1/sessions/$ID" | grep -q '"state":"ready"' && break; i=$((i + 1)); sleep 2; done
call POST "/v1/sessions/$ID/actions" --json '{"type":"navigate","url":"https://httpbin.org/response-headers?Set-Cookie=e2elong%3De2evalue%3B%20Max-Age%3D86400%3B%20Path%3D%2F"}' >/dev/null
has_cookie "0) just set"; sleep 3; dump "0) just set"

echo "== D) Chromium alone is stopped (SIGINT) and started again by supervisord, in the same container"
docker exec "$NAME" sh -c 'pkill -INT -o -x chromium; echo "signal sent: $?"' 2>&1 | sed 's/^/  /'
sleep 8; wait_action && echo "  the browser answers again" || echo "  the browser did NOT come back"
dump "D) after Chromium restarted"; has_cookie "D) after Chromium restarted"

echo "== A) the whole container is stopped and started again"
docker stop -t 15 "$NAME" >/dev/null 2>&1; docker start "$NAME" >/dev/null 2>&1
sleep 8; wait_action && echo "  the browser answers again" || echo "  the browser did NOT come back"
dump "A) after the container restarted"; has_cookie "A) after the container restarted"
docker logs --since 2m "$NAME" 2>&1 | grep -a -i -E 'cookie|sqlite|singleton|profile' | tail -5 | cut -c1-200 | sed 's/^/  log: /'
echo "== done (the browser is removed)"
