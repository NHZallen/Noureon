# Sandbox hardening (steps and commands kept apart)

**Status:** done in 18.3.2 (code and tests); to be used on the machine by updating the runner (see `sandbox-host/README.md`, the last section).
**Why:** an audit by Neo (Projectdiscovery, 2026-10-10, static only) proposed seven findings about the sandbox (ISSUE-34 to 40). The ones checked against the code and fixed here: 34 (the private channel shared with the code of a step), 35 (a credential file redirected by a planted link), 36 (no reset: hooks of a step capture later commands) and 39 (the check of the path of a command's file was by string). The others (37, 38, 40) were not checked.

## 1. What was wrong

`repl.py` was one Python process that both ran the steps (model-written code) and, in the same interpreter, ran the commands of the CLI tools with their credentials. So the code of a step could:

- `import __main__` and write to the channel to the runner (`_channel`, `send`), or read the commands from it;
- replace `subprocess.Popen`, the functions that build a command's environment or write its files, or `os.environ["PATH"]`, and so see (or steer) every later command with its credentials;
- plant a link in `/work` (a folder, or the file itself) so that the file of credentials, written by a path as a string (`normpath` only), went through it to `/output` (which is returned to the server);
- leave a process running that reads the credential file, the environment (`/proc/<pid>/environ`) or the memory of a command while it runs.

## 2. What was done

| Finding | Change |
|---|---|
| 34, 36 | Two processes: the supervisor keeps the channel, the environment, the credentials and the functions; the worker runs the steps. Frames of the worker are checked before they are passed on. The supervisor is not readable by the worker (`PR_SET_DUMPABLE`). |
| 35, 39 | The files of a command are written folder by folder with `O_NOFOLLOW`, as plain files of their own (`fstat`, one name, not a pipe: `O_NONBLOCK` so that a pipe cannot hold the program), and removed the same way. |
| 35 (planted programs and modules) | A command with credentials has neither `/opt/pip` (writable, may run programs) on its `PATH`/`PYTHONPATH` nor the user's site folder (`PYTHONNOUSERSITE=1`); the tools of the Python cache bring their own read-only path. |
| 35 (planted programs and modules) | A command with credentials has neither `/opt/pip` (writable, may run programs) on its `PATH`/`PYTHONPATH` nor the user's site folder (`PYTHONNOUSERSITE=1`); the tools of the Python cache bring their own read-only path. |
| 35 (a process reading the credentials) | While a command with credentials runs, every other process of the container is stopped and goes on after the files are removed. |

The old program fails each of the new tests of `tests/sandbox-host/repl.test.js` (a pipe at the path of a file made it wait for ever).

## 3. Behaviour that changed

- A step that ends the Python process (`os._exit`, memory) is now answered with an error and the next step starts a new worker: the variables are gone; the container stays. Before, the container ended.
- A step the worker cannot stop (it ignores the time limit) is still ended by the runner killing the container (its grace, 8 s, comes before the supervisor's own, 30 s).
- The Python variables are kept across a command with credentials (the others are stopped, not ended).

## 3b. Also in 18.3.2 (not the sandbox)

ISSUE-21 (a formula that KaTeX could not render was put into the page as raw text after the sanitizing: `markdown-rendering-helpers.js`, now escaped) and ISSUE-20 and 25 (see the notes of the release).

## 3b. Also in 18.3.2 (not the sandbox)

ISSUE-21 (a formula that KaTeX could not render was put into the page as raw text after the sanitizing: `markdown-rendering-helpers.js`, now escaped) and ISSUE-20 and 25 (see the notes of the release).

## 4. Not done, and why

- A command that the model writes itself has its tool's credentials in its environment (`env`, `cat` of the login file): the server hides them from the output it shows, which is not a wall. A wall would be another container for the commands.
- `/work` (HOME) and `/output` are shared between steps and commands, and everything runs as the same user: a step can leave a file that a command reads (a tool's configuration, say).
- Under the name of `HOME` (`/work`) a step can still leave a configuration file that a tool reads (a `.curlrc`, a `.gitconfig`); a fresh `HOME` for each command with credentials would close it, at the price that what a tool keeps in `HOME` between commands is lost (the owner's decision).
- ISSUE-32 (the cloud-sync objects on `window`) is not changed: moving them off `window` is not a wall (a script in the page can import the same modules); the wall is to keep scripts out of the page (the CSP below).
- Under the name of `HOME` (`/work`) a step can still leave a configuration file that a tool reads (a `.curlrc`, a `.gitconfig`); a fresh `HOME` for each command with credentials would close it, at the price that what a tool keeps in `HOME` between commands is lost (the owner's decision).
- ISSUE-32 (the cloud-sync objects on `window`) is not changed: moving them off `window` is not a wall (a script in the page can import the same modules); the wall is to keep scripts out of the page (an enforced CSP, see the notes of the release).
- ISSUE-38 (the build context of the runner image may hold `.env`) was judged a false positive by Neo and by the code (the image is built from a staging folder).

## 5. Later in 18.3.4: ISSUE-37 and 40

Checked against the code, both were true. 37: the limits of the output folder only decided what was sent back, not what a step could write on the host's disk; the runner now ends a step that makes the folder grow past 1 GiB and removes what it wrote. 40: the answer for a container that would not start held the last line of Docker's own text; it now says only that it failed and the text goes to the runner's log. See `sandbox-host/README.md`.
