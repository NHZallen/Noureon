# The Python sandbox host

Runs the Python that models write (Advanced mode) in containers made for it: one per reply, no network, limited memory, CPU and time,
removed when the reply ends. Design and decisions: `docs/superpowers/specs/2026-10-03-server-runtime-design.md` (§7).

```
Noureon server (Zeabur) ──token──▶ runner (container, this machine, 10.42.0.1:7788) ──docker──▶ sandbox container (one per reply)
```

| File | What it is |
|---|---|
| `Dockerfile` | the image of a sandbox: Python, the packages the model is told it has, the app's fonts, the `noureon` module |
| `repl.py` | the program inside a sandbox: runs one step after another, variables kept |
| `Dockerfile.runner`, `runner/` | the runner: opens and closes the containers, answers the server |
| `install.sh` | builds both images, makes the secret, starts the runner |
| `smoke-test.sh` | tries the sandbox for real and checks the walls hold |

The runner is only reachable from the machine's own pod network (`RUNNER_ALLOW`, default `10.42.0.0/16`) and needs the secret
(`/etc/noureon-sandbox/token`). It is not on the internet. Containers never get a network (`--network none`).

Tests (no Docker needed, a stand-in `docker` runs `repl.py` as a plain process): `node --test tests/sandbox-host/`.
