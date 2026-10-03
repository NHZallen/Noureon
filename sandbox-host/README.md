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

Each container may use 2 GB of memory and 2 CPU cores (`SANDBOX_MEMORY`, `SANDBOX_CPUS`), and at most 2 run at once (`SANDBOX_MAX_SESSIONS`): the machine has 8 GB and no swap, so more would risk the services next to it.

The runner is only reachable from the machine's own pod network (`RUNNER_ALLOW`, default `10.42.0.0/16`) and needs the secret
(`/etc/noureon-sandbox/token`). It is not on the internet. Containers never get a network (`--network none`).

The Noureon server reaches the runner with two Zeabur variables: `SANDBOX_RUNNER_URL` (`http://10.42.0.1:7788`) and `SANDBOX_RUNNER_TOKEN` (the contents of `/etc/noureon-sandbox/token`; never paste it anywhere else). The server's side of this interface is `server/sandbox-client.js`; `tests/sandbox-host/server-adapter.test.js` runs both halves together.

Tests (no Docker needed, a stand-in `docker` runs `repl.py` as a plain process): `node --test tests/sandbox-host/`.
