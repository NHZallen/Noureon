#!/bin/sh
# Builds browser-host/chromium-seccomp.json: Docker's OWN default seccomp profile, plus permission for the few system calls that Chromium's sandbox needs to make
# itself a user namespace (clone, clone3, unshare, setns, chroot). Everything else Docker blocks by default stays blocked (mount, ptrace of others, kernel modules, ...).
# Docker's default blocks those calls unless the container has CAP_SYS_ADMIN (or CAP_SYS_CHROOT for chroot); the browser containers have no capabilities at all,
# so without this the sandbox cannot start (round seven: "Failed to move to new namespace: Operation not permitted").
# What this costs: a process in the container can create user namespaces, which makes more of the kernel reachable than a plain container has. That is the price of
# having Chromium's own sandbox; design doc §10.2 item 1.
# Changes nothing on the host: it only writes browser-host/chromium-seccomp.json.
#
# Usage: sh browser-host/make-chromium-seccomp.sh [docker-default.json]    (without an argument it downloads Docker's default profile from GitHub)
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/chromium-seccomp.json"
command -v python3 >/dev/null 2>&1 || { echo "STOP: python3 is needed"; exit 1; }
SRC="${1:-}"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
if [ -z "$SRC" ]; then
  for url in https://raw.githubusercontent.com/moby/profiles/main/seccomp/default.json https://raw.githubusercontent.com/moby/moby/master/profiles/seccomp/default.json; do
    if curl -fsSL -m 30 -o "$TMP" "$url"; then SRC="$TMP"; echo "downloaded $url"; break; fi
  done
  [ -n "$SRC" ] || { echo "STOP: could not download Docker's default seccomp profile; pass the path of a copy as the argument"; exit 1; }
fi
python3 -I - "$SRC" "$OUT" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
profile = json.load(open(src))
assert profile.get("defaultAction") in ("SCMP_ACT_ERRNO", "SCMP_ACT_KILL", "SCMP_ACT_KILL_PROCESS"), "this does not look like Docker's default profile: " + str(profile.get("defaultAction"))
rules = profile.get("syscalls")
assert isinstance(rules, list) and rules, "no syscalls list"
names = {n for rule in rules for n in rule.get("names", [])}
assert {"read", "write", "mount"} <= names, "this does not look like Docker's default profile (no read/write/mount rules)"
added = ["clone", "clone3", "unshare", "setns", "chroot"]
profile["syscalls"].append({"names": added, "action": "SCMP_ACT_ALLOW"})
json.dump(profile, open(out, "w"), indent=2)
print("wrote %s: %d rules, defaultAction %s, allowed in addition: %s" % (out, len(profile["syscalls"]), profile["defaultAction"], ", ".join(added)))
PY
