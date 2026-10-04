#!/bin/sh
# Tries the sandbox for real, on this machine: starts a container, runs Python in it, and checks the walls hold. Run as root after install.sh.
set -u
SECRET=$(cat /etc/noureon-sandbox/token 2>/dev/null) || { echo "STOP: no secret (run install.sh first)"; exit 1; }
HOST=$(docker inspect noureon-sandbox-runner --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^RUNNER_HOST=//p')
[ -n "$HOST" ] || { echo "STOP: the runner is not running"; exit 1; }
BASE="http://$HOST:7788"
PASS=0; FAILS=0
check() { if [ "$2" = "ok" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAILS=$((FAILS+1)); echo "FAIL  $1  ($2)"; fi; }
call() { curl -sS -m 150 -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" "$@"; }
json() { python3 -c "import sys,json; d=json.loads(sys.stdin.read().strip().split('\n')[-1]); print($1)" 2>/dev/null; }
step() { # step "<python code>" -> the last line (the result) of the answer
  python3 - "$1" "$2" "$BASE" "$SECRET" <<'PY'
import json, sys, urllib.request
code, session, base, secret = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
request = urllib.request.Request(f"{base}/v1/sessions/{session}/run", data=json.dumps({"code": code, "timeoutMs": 60000}).encode(), headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}, method="POST")
last = ""
with urllib.request.urlopen(request, timeout=150) as response:
    for line in response:
        last = line.decode()
print(last.strip())
PY
}

echo "== the runner =="
[ "$(curl -sS -m 5 "$BASE/healthz" | json "d['ok']")" = "True" ] && check "the runner answers" ok || check "the runner answers" "no answer from $BASE"
[ "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/sessions")" = "401" ] && check "no secret, no entry" ok || check "no secret, no entry" "not refused"

echo "== a container =="
CREATED=$(call -X POST "$BASE/v1/sessions" -d '{"language":"zh-TW"}')
ID=$(printf '%s' "$CREATED" | json "d['id']")
[ -n "$ID" ] && check "a container starts" ok || { check "a container starts" "$CREATED"; echo; echo "RESULT: $PASS passed, $FAILS failed"; exit 1; }

R=$(step 'print(1 + 1)' "$ID"); [ "$(printf '%s' "$R" | json "d['stdout']['text'].strip()")" = "2" ] && check "Python runs" ok || check "Python runs" "$R"
R=$(step 'import numpy, pandas, matplotlib, docx, pptx, openpyxl, reportlab, fpdf, pypdf, scipy, sklearn, sympy, PIL, lxml, bs4, xlsxwriter, noureon; print("packages")' "$ID"); [ "$(printf '%s' "$R" | json "d['stdout']['text'].strip()")" = "packages" ] && check "the packages are there" ok || check "the packages are there" "$R"
R=$(step 'import socket
s = socket.socket(); s.settimeout(3)
try:
    s.connect(("1.1.1.1", 80)); print("CONNECTED")
except OSError as e:
    print("no network")' "$ID"); [ "$(printf '%s' "$R" | json "d['stdout']['text'].strip()")" = "no network" ] && check "no network" ok || check "no network" "$R"
R=$(step 'import os
print(sorted(os.listdir("/")))
try:
    open("/etc/should-not-be-written", "w").write("x"); print("WROTE")
except OSError:
    print("read only")' "$ID"); printf '%s' "$R" | json "d['stdout']['text']" | grep -q "read only" && check "the system is read only" ok || check "the system is read only" "$R"
R=$(step 'import matplotlib.pyplot as plt
plt.figure(); plt.plot([1,2,3],[3,1,2]); plt.title("中文字型 abc"); plt.savefig("/output/chart.png", dpi=80)
print("chart")' "$ID"); [ "$(printf '%s' "$R" | json "d['files'][0]['name']")" = "chart.png" ] && check "a chart with Chinese text is made" ok || check "a chart with Chinese text is made" "$R"
R=$(step 'from docx import Document
d = Document(); d.add_paragraph("你好"); d.save("/output/a.docx")' "$ID"); [ "$(printf '%s' "$R" | json "d['files'][0]['name']")" = "a.docx" ] && check "a Word file is made" ok || check "a Word file is made" "$R"
# CLI tools: the runner fetches the program (checked against its hash), the sandbox runs it from /opt/cli (no network inside).
cli_step() { # cli_step "<command>" <session> -> the last line (the result) of the answer; the tools' environment is sent as the app does
  python3 - "$1" "$2" "$BASE" "$SECRET" "$CLI_ENV" <<'PY'
import json, sys, urllib.request
command, session, base, secret = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
env = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
request = urllib.request.Request(f"{base}/v1/sessions/{session}/run", data=json.dumps({"command": command, "env": env, "timeoutMs": 60000}).encode(), headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}, method="POST")
last = ""
with urllib.request.urlopen(request, timeout=150) as response:
    for line in response:
        last = line.decode()
print(last)
PY
}
# The programs and their hashes come from the app's own catalog (run from the repository), so this checks what the app really uses.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG_JS="import('./src/data/cli-catalog.js').then((m) => console.log(JSON.stringify(m.OFFICIAL_CLI_CATALOG.filter(m.isCliReady).map((t) => ({ id: t.id, file: t.artifacts[m.CLI_PLATFORM].file, url: t.artifacts[m.CLI_PLATFORM].url, sha256: t.artifacts[m.CLI_PLATFORM].sha256, size: t.artifacts[m.CLI_PLATFORM].size })))))"
CLI_ENV='{}'
ENV_JS="import('./src/data/cli-catalog.js').then((m) => console.log(JSON.stringify(Object.assign({}, ...m.OFFICIAL_CLI_CATALOG.filter(m.isCliReady).map((t) => t.env || {})))))"
if command -v node >/dev/null 2>&1; then
  CATALOG=$(cd "$REPO" && node -e "$CATALOG_JS")
  CLI_ENV=$(cd "$REPO" && node -e "$ENV_JS")
else
  # No Node on this machine: the runner's image has it.
  CATALOG=$(docker run --rm -v "$REPO/src/data:/app/src/data:ro" -w /app --entrypoint node noureon-sandbox-runner:1 -e "$CATALOG_JS")
  CLI_ENV=$(docker run --rm -v "$REPO/src/data:/app/src/data:ro" -w /app --entrypoint node noureon-sandbox-runner:1 -e "$ENV_JS")
fi
MOUNT=$(python3 - "$ID" "$BASE" "$SECRET" "$CATALOG" <<'PY'
import json, sys, urllib.request
session, base, secret, catalog = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
request = urllib.request.Request(f"{base}/v1/sessions/{session}/cli", data=json.dumps({"tools": catalog}).encode(), headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(request, timeout=300) as response:
    print(response.read().decode())
PY
)
printf '%s' "$MOUNT" | grep -q "mounted" && check "the CLI programs are fetched and mounted" ok || check "the CLI programs are fetched and mounted" "$MOUNT"
R=$(cli_step 'officecli --version' "$ID"); printf '%s' "$R" | json "d['stdout']['text']" | grep -Eq "[0-9]+\.[0-9]+" && check "officecli runs (from /opt/cli, no ICU needed)" ok || check "officecli runs" "$R"
R=$(cli_step 'ffmpeg -hide_banner -version | head -1' "$ID"); printf '%s' "$R" | json "d['stdout']['text']" | grep -qi "ffmpeg version" && check "ffmpeg runs" ok || check "ffmpeg runs" "$R"
R=$(cli_step 'cd /output && officecli create t.docx && ls' "$ID"); [ "$(printf '%s' "$R" | json "d['files'][0]['name']")" = "t.docx" ] && check "officecli makes a Word file in /output" ok || check "officecli makes a Word file in /output" "$R"
R=$(cli_step 'exit 3' "$ID"); printf '%s' "$R" | json "d['error']" | grep -q "code 3" && check "a failing command is an error" ok || check "a failing command is an error" "$R"
R=$(step 'x = bytearray(3 * 1024 * 1024 * 1024)' "$ID"); printf '%s' "$R" | json "d['error']" | grep -qi "memory" && check "too much memory is stopped" ok || check "too much memory is stopped" "$R"
R=$(step 'while True: pass' "$ID" ); echo "$R" | grep -q "time limit" && check "an endless loop is stopped" ok || check "an endless loop is stopped" "(waited 60 s) $R"
call -X DELETE "$BASE/v1/sessions/$ID" >/dev/null
sleep 1
[ -z "$(docker ps -aq --filter name=nsb-)" ] && check "the container is gone afterwards" ok || check "the container is gone afterwards" "still there"

echo
echo "RESULT: $PASS passed, $FAILS failed"
[ "$FAILS" = "0" ]
