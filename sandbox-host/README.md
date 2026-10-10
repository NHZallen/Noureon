# The Python sandbox host

Runs the Python that models write (Advanced mode) in containers made for it: one per reply, no network of their own, limited memory, CPU and time,
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
| `runner/session.js` also keeps `skills/` (the folders of the skills a reply loaded, `mountSkills`), read only in the container as `/skills` |
| `runner/cli-cache.js` | fetches the programs of CLI tools (命令工具) once, checks their hash, keeps them in `cli-cache/` (a `.tar.gz` download is unpacked as it arrives: only the one file the catalog names is kept, `runner/tar-member.js`) |
| `runner/pip-cache.js` | installs the Python tools (twitter-cli, csvkit, ...) once on this machine, keeps them in `pip-cache/` (at most `SANDBOX_PIP_CACHE_BYTES`, 10 GB by default, the tools unused for longest go first) |
| `runner/net-proxy.js` | the filtering proxy of a session (the only way out of a container, by a unix socket): rules of sites, internal addresses always refused, questions to the person |
| `smoke-test.sh` | tries the sandbox for real (Python, the walls, and the CLI tools) and checks the walls hold |

Each container may use 2 GB of memory and 2 CPU cores (`SANDBOX_MEMORY`, `SANDBOX_CPUS`), and at most 2 run at once (`SANDBOX_MAX_SESSIONS`): the machine has 8 GB and no swap, so more would risk the services next to it.

The runner is only reachable from the machine's own pod network (`RUNNER_ALLOW`, default `10.42.0.0/16`) and needs the secret
(`/etc/noureon-sandbox/token`). It is not on the internet. Containers never get a network (`--network none`); what a CLI tool may reach goes through the session's proxy (below).

The Noureon server reaches the runner with two Zeabur variables: `SANDBOX_RUNNER_URL` (`http://10.42.0.1:7788`) and `SANDBOX_RUNNER_TOKEN` (the contents of `/etc/noureon-sandbox/token`; never paste it anywhere else). The server's side of this interface is `server/sandbox-client.js`; `tests/sandbox-host/server-adapter.test.js` runs both halves together.

## CLI tools (命令工具)

The CLI store (`docs/superpowers/specs/2026-10-04-cli-store-design.md`) puts programs such as OfficeCLI and FFmpeg in a sandbox. The server sends the runner a list `{ id, file, url, sha256, size }` (`POST /v1/sessions/:id/cli`); the runner downloads each program itself, only over https from `SANDBOX_CLI_HOSTS` (GitHub by default, every redirect checked), refuses a file whose size or sha256 is not the announced one, keeps it in `SANDBOX_CLI_CACHE_DIR` (default `<data dir>/cli-cache`, by hash, so the same program is fetched once) and hard-links it into the session's folder, which the container sees read only as `/opt/cli` (on the `PATH` of `run_command`). `/tmp` and `/work` stay `noexec`: only these programs run, never a file the model wrote.

After updating this folder on the machine, redeploy the runner: `sh sandbox-host/install.sh`, then `sh sandbox-host/smoke-test.sh` (it fetches OfficeCLI and FFmpeg from GitHub and tries pip and curl through the proxy, so the machine needs to reach github.com, pypi.org and example.com; the containers themselves have no network).

Tests (no Docker needed, a stand-in `docker` runs `repl.py` as a plain process): `node --test tests/sandbox-host/`.

## The Python tools of the CLI tools (cache)

Skills with scripts (`docs/superpowers/specs/2026-10-09-skills-design.md`, §14) put the folder of a skill in the sandbox: `POST /v1/sessions/:id/skills` `{ skills: [{ name, files: [{ path, data (base64) }] }] }` answers `{ mounted: [{ name, files }] }`. The runner checks the whole list before it writes anything (at most 5 skills, 61 files for a skill, 12 MB all together, a name of lower-case words joined by hyphens, a path of at most 200 characters with no empty, `.`, `..` or hidden part and no backslash; the same path twice, even with other capitals, is refused), empties the session's `skills/` folder and writes the folders (folders `0755`, files `0644`: nothing is given the right to run). The container sees them read only as `/skills`, so a script is run by an interpreter (`python /skills/<name>/scripts/x.py`, `sh /skills/<name>/scripts/y.sh`); `/tmp` and `/work` stay `noexec`, so no file the model wrote can be run. Each call replaces what was there, so the server sends every skill the reply has loaded so far, and again to a new sandbox when the host was lost.

A Python tool (twitter-cli, rdt-cli, csvkit) used to be installed inside the sandbox by every reply that used it (about 15 seconds). Now `POST /v1/sessions/:id/pip` `{ tools: [{ id, pip: { package, version, command, commands } }] }` asks the runner for it: the first time it is installed once on this machine by `pip-cache.js` (a container of its own with the image of the sandbox, read only, no rights, 1 GB, **on the machine's network** because Docker here does not touch the network rules, **wheels only**: `--only-binary :all:`, so no code of the package runs while it installs) into `pip-cache/<package>-<version>/`; after that every session finds it there. A sandbox sees the whole `pip-cache/` read only at `/opt/pip-cache`, and the runner writes a small script for each command of the tool into the session's `/opt/cli` that sets the tool's own `PYTHONPATH` and runs `/opt/pip-cache/<tool>/bin/<command>` (so two tools never see each other's packages). Answer: `{ cached: [ids], failed: [{ id, reason }] }`; a tool that could not be had (no wheel, the machine without network) is installed inside the sandbox the old way by the reply. The cache holds public software only, never anything of a person. `SANDBOX_PIP_CACHE_DIR` and `SANDBOX_PIP_CACHE_BYTES` change where and how large.

## The network of the CLI tools (stage 2 of the store)

A container has no network at all (`--network none`: only its own loopback). When the server mounts CLI tools it also sends the person's rules for sites (`POST /v1/sessions/:id/cli`, field `net: { mode, rules }`), and the runner then:

1. starts a filtering proxy for that session on a unix socket, `<data dir>/<session>/net/p.sock` (mode 666), mounted read only in the container as `/run/noureon-net`;
2. tells the program in the container (`repl.py`, message `net`) to open `127.0.0.1:<port>` and relay it to that socket. The commands it runs get `HTTP_PROXY`/`HTTPS_PROXY` pointing there (the code of a Python step does not), so `pip`, `curl`, `git`, `npm` and the tools reach the internet only through the proxy.

The proxy (`runner/net-proxy.js`) opens only ports 80 and 443; looks the site up itself and **refuses, whatever the rules say,** any name that leads to an internal address (127/8, 10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16, the IPv6 equivalents, mapped addresses, and the addresses of the machine's own interfaces) — one such address among the answers is enough — and then connects to the address it checked. A site with a rule is let through or refused (`403`, header `X-Noureon-Block`); a site with none is **asked about**: the step that is running tells it in its stream (`stage: 'net'`, `event: 'ask'`), the server shows a card, the person's answer comes back with `POST /v1/sessions/:id/net/answer`, and no answer in `SANDBOX_NET_ASK_MS` (10 minutes) is a refusal. While a question is open the step's time does not run (the runner stops its clock, and `repl.py` sees `/run/noureon-net/waiting`).

A step may also be given `files` (a login file a tool needs, written under `/work` with mode 600 for the time of the command only) and values of up to 4096 characters in `env`. Python packages a tool installs go to `/opt/pip` (a tmpfs that may run programs, `SANDBOX_PIP_SIZE`, default 512m); it is on the `PATH` and `PYTHONPATH` of commands.

After updating this folder on the machine the image has to be rebuilt (it gained node, npm, git, curl, and later `file` and SoX): `git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`.

## Steps and commands are kept apart (18.3.2)

Inside the container `repl.py` is two programs. The **supervisor** (what the container starts) holds the private channel to the runner, runs the commands of the CLI tools with the credentials that come with them, and keeps the network relay. The **worker** (`repl.py --worker`, its child) runs the Python of the steps and keeps the variables between them.

- The worker talks to the supervisor through its own pipes; the supervisor passes on only the output of a step (as it comes) and its result, for the request that is running, with the sizes limited. A step that writes frames of its own to the runner is not passed on.
- A step cannot reach the supervisor's memory (`prctl(PR_SET_DUMPABLE, 0)`), nor its environment or functions: patching `subprocess`, `os.environ` or the functions of `repl.py` changes the worker only.
- The files that come with a command (a tool's login) are written one folder at a time without following links, as ordinary files of their own (not links, pipes, or files with another name), and removed again before anything goes on.
- While a command with credentials runs, every other process of the container is stopped (`SIGSTOP`, container setting `NOUREON_FREEZE=all`, set in `docker-args.js`) and goes on after the files of the credentials are removed. The Python variables are kept.
- If the worker ends (a step calls `os._exit`, is killed for memory) the step gets an error and the next one starts a new worker: the variables of the earlier steps are gone, the files in `/output` stay.

What this does not do: a command the model writes itself still has the credentials of its tool in its environment, so the server hides them from the output it shows; `/work` (HOME) and `/output` are shared by the steps and the commands, so a step can put a file there that a command will read; the processes of the steps and of the commands are the same user.

`tests/sandbox-host/repl.test.js` runs `repl.py` for real (with `NOUREON_FREEZE` left at its test value, which stops only the worker's session) and checks each of the points above; `smoke-test.sh` checks them again in the real container ("a step cannot reach the commands").

To use it on the machine: `cd ~/Noureon && git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`.

## Limits on what a step writes, and what an error says (18.3.4)

- The output folder is on this machine's disk. While a step runs the runner measures how much the folder has grown (what is allocated, every `SANDBOX_DISK_CHECK_MS`, 1 s); past `SANDBOX_OUTPUT_GROWTH_BYTES` (1 GiB) the container is ended, the step answers "The code wrote more files than a step may." with `restarted`, and what the step wrote is removed (the files of earlier steps stay). The limits of what is *sent back* (`SANDBOX_OUTPUT_FILE_BYTES`, `SANDBOX_OUTPUT_TOTAL_BYTES`) are unchanged.
- When a container cannot start the answer says only "The sandbox stopped while starting (N)." What Docker printed (paths of the machine, names of images) goes to the runner's log, `docker logs noureon-sandbox-runner`, as `sandbox_start_failed`.

## Starting again after a container was ended (18.3.5)

A container that a step ended (a limit of what it wrote, of memory, of time) is started anew for the next step under the same name. Docker removes the old one (`--rm`) a moment after it stops, and refuses a start in that moment (exit code 125, "the container name is already in use"). So before every start the runner runs `docker rm -f <name>`, and a start refused with code 125 is tried again after 0.3 s and 0.6 s (three tries at most). What Docker said is in the log of the runner (`docker logs noureon-sandbox-runner`, `sandbox_start_failed`).
