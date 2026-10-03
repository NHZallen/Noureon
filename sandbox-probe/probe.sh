#!/bin/sh
# What may a service on this host do? Everything printed here is about the machine, not about anyone: no environment variables, no keys.
say() { printf '\n== %s ==\n' "$1"; }
try() { label="$1"; shift; if out=$("$@" 2>&1); then printf '%s: OK %s\n' "$label" "$(printf '%s' "$out" | head -c 160 | tr '\n' ' ')"; else printf '%s: FAILED %s\n' "$label" "$(printf '%s' "$out" | head -c 160 | tr '\n' ' ')"; fi; }

say "who and where"
id
uname -sr
echo "cores: $(nproc)"
grep -E 'MemTotal|MemAvailable' /proc/meminfo
echo "cgroup memory limit: $(cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo unknown)"
echo "cgroup cpu limit: $(cat /sys/fs/cgroup/cpu.max 2>/dev/null || echo unknown)"
echo "pids limit: $(cat /sys/fs/cgroup/pids.max 2>/dev/null || echo unknown)"

say "privileges of this service"
grep -E '^(Cap(Inh|Prm|Eff|Bnd|Amb)|Seccomp|NoNewPrivs)' /proc/self/status
echo "user namespaces allowed (max): $(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo unknown)"

say "can it open containers? (a docker socket, a docker program)"
ls -l /var/run/docker.sock 2>&1 | head -1
command -v docker >/dev/null 2>&1 && echo "docker program: yes" || echo "docker program: no"
ls /run/containerd/containerd.sock 2>&1 | head -1

say "can it isolate a program by itself? (no root needed)"
try "new user namespace (unshare -U)" unshare --user --map-root-user true
try "new pid+mount namespace" unshare --user --map-root-user --pid --fork --mount-proc true
try "new network namespace (no network)" unshare --user --map-root-user --net true
try "bubblewrap, all isolated" bwrap --unshare-all --die-with-parent --ro-bind / / --tmpfs /tmp --proc /proc --dev /dev python3 -c "print('inside the box')"
try "bubblewrap: no network inside" bwrap --unshare-all --ro-bind / / --proc /proc --dev /dev python3 -c "import socket; s=socket.socket(); s.settimeout(3); s.connect(('1.1.1.1',80))"
try "bubblewrap: cannot see the service's files" bwrap --unshare-all --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /bin /bin --proc /proc --dev /dev --tmpfs /tmp ls /probe

say "limits of a program (ulimit)"
ulimit -a | grep -E 'processes|virtual|file size|open files'
try "run with a memory limit" sh -c 'ulimit -v 500000; python3 -c "x = bytearray(900*1024*1024)"'

say "the network from here"
try "internet (example.com)" curl -sS -m 6 -o /dev/null -w '%{http_code}' https://example.com
try "internal address 169.254.169.254" curl -sS -m 3 -o /dev/null -w '%{http_code}' http://169.254.169.254/
echo "own addresses: $(ip -brief addr 2>/dev/null | grep -v '^lo' | head -3 | tr '\n' ' ')"
