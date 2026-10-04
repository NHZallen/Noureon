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
| `runner/cli-cache.js` | fetches the programs of CLI tools (命令工具) once, checks their hash, keeps them in `cli-cache/` |
| `smoke-test.sh` | tries the sandbox for real (Python, the walls, and the CLI tools) and checks the walls hold |

Each container may use 2 GB of memory and 2 CPU cores (`SANDBOX_MEMORY`, `SANDBOX_CPUS`), and at most 2 run at once (`SANDBOX_MAX_SESSIONS`): the machine has 8 GB and no swap, so more would risk the services next to it.

The runner is only reachable from the machine's own pod network (`RUNNER_ALLOW`, default `10.42.0.0/16`) and needs the secret
(`/etc/noureon-sandbox/token`). It is not on the internet. Containers never get a network (`--network none`).

The Noureon server reaches the runner with two Zeabur variables: `SANDBOX_RUNNER_URL` (`http://10.42.0.1:7788`) and `SANDBOX_RUNNER_TOKEN` (the contents of `/etc/noureon-sandbox/token`; never paste it anywhere else). The server's side of this interface is `server/sandbox-client.js`; `tests/sandbox-host/server-adapter.test.js` runs both halves together.

## CLI tools (命令工具)

The CLI store (`docs/superpowers/specs/2026-10-04-cli-store-design.md`) puts programs such as OfficeCLI and FFmpeg in a sandbox. The server sends the runner a list `{ id, file, url, sha256, size }` (`POST /v1/sessions/:id/cli`); the runner downloads each program itself, only over https from `SANDBOX_CLI_HOSTS` (GitHub by default, every redirect checked), refuses a file whose size or sha256 is not the announced one, keeps it in `SANDBOX_CLI_CACHE_DIR` (default `<data dir>/cli-cache`, by hash, so the same program is fetched once) and hard-links it into the session's folder, which the container sees read only as `/opt/cli` (on the `PATH` of `run_command`). `/tmp` and `/work` stay `noexec`: only these programs run, never a file the model wrote.

After updating this folder on the machine, redeploy the runner: `sh sandbox-host/install.sh`, then `sh sandbox-host/smoke-test.sh` (it fetches OfficeCLI and FFmpeg from GitHub, so the machine needs to reach github.com; the sandboxes themselves still have no network).

Tests (no Docker needed, a stand-in `docker` runs `repl.py` as a plain process): `node --test tests/sandbox-host/`.
