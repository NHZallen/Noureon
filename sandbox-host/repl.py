"""The program that runs inside a sandbox container. It is two programs in one file:

  the supervisor (this one, started by the container): holds the private channel to the runner, runs the commands of the CLI tools (with the
  credentials that come with them), keeps the network relay, and starts and watches the worker;
  the worker (`repl.py --worker`, a child of the supervisor): runs the model-written Python, one step at a time, in one long-lived process so
  variables stay between the steps of a reply. Its talk with the supervisor goes through its own pipes, and the supervisor passes on only
  what a step may say (its output and its result), so the code of a step cannot reach the channel to the runner, nor the credentials of a
  command, nor change the environment or the functions the commands are run with.

It talks to the runner over stdin and stdout, one JSON object per line:
  in:   {"id", "type": "run", "code", "timeoutMs"}  |  {"id", "type": "command", "command", "env", "files", "timeoutMs"}  |  {"id", "type": "clear"}
        |  {"id", "type": "init", "language"}  |  {"id", "type": "net", "on": true}
  out:  {"type": "ready"}  |  {"id", "type": "progress", "stage": "output", "stream", "text"}
        |  {"id", "type": "result", "stdout": {"text", "dropped"}, "stderr": {...}, "error", "elapsedMs"}

The files a step writes are not sent here: they are in the output folder, which the runner reads. The program's own stdin and stdout are
taken away from the user's code (it gets /dev/null), so nothing it prints can pass for a message.
Folders: /input (read only), /output, /work (home), /fonts. NOUREON_INPUT, NOUREON_OUTPUT and NOUREON_WORK move them (tests).

The container has no network. When the runner gives the session a network proxy (the "net" message), a socket of it is in /run/noureon-net and
this program relays 127.0.0.1:<port> to it: the commands it runs get HTTP_PROXY and HTTPS_PROXY pointing there (the code of a Python step does not).
"""
import ast
import asyncio
import inspect
import json
import os
import re
import select
import shutil
import signal
import stat
import socket
import subprocess
import sys
import threading
import time
import traceback

INPUT = os.environ.get("NOUREON_INPUT", "/input")
# The programs of the CLI tools (read only); a command finds them first.
CLI = os.environ.get("NOUREON_CLI", "/opt/cli")
# Where a tool's Python packages are installed (pip --target), and the socket and sign of the network proxy.
PIP = os.environ.get("NOUREON_PIP", "/opt/pip")
NET_SOCKET = os.environ.get("NOUREON_NET_SOCKET", "/run/noureon-net/p.sock")
NET_WAITING = os.path.join(os.path.dirname(NET_SOCKET), "waiting")
OUTPUT = os.environ.get("NOUREON_OUTPUT", "/output")
WORK = os.environ.get("NOUREON_WORK", "/work")
CAPTURE_LIMIT = 1_000_000
MAX_CODE_CHARS = 200_000
OUTPUT_EVERY = 0.1

# The private channel to the runner; what the user's code sees as stdin and stdout is nothing.
_commands = os.fdopen(os.dup(0), "r", encoding="utf-8")
_channel = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
_null_in = os.open(os.devnull, os.O_RDONLY)
_null_out = os.open(os.devnull, os.O_WRONLY)
os.dup2(_null_in, 0)
os.dup2(_null_out, 1)


_send_lock = threading.Lock()


def send(message):
    with _send_lock:
        _channel.write(json.dumps(message, ensure_ascii=False) + "\n")
        _channel.flush()


class Sink:
    """Keeps what was written, up to a limit, counts the rest, and hands the text on while the code runs."""

    def __init__(self, stream, request_id):
        self.stream = stream
        self.request_id = request_id
        self.text = ""
        self.dropped = 0
        self.pending = ""
        self.last_sent = 0.0

    def write(self, chunk):
        chunk = str(chunk)
        room = CAPTURE_LIMIT - len(self.text)
        kept = chunk if room >= len(chunk) else (chunk[:room] if room > 0 else "")
        self.dropped += len(chunk) - len(kept)
        self.text += kept
        if kept:
            self.pending += kept
            if time.monotonic() - self.last_sent >= OUTPUT_EVERY:
                self.flush()
        return len(chunk)

    def flush(self):
        if self.pending:
            send({"id": self.request_id, "type": "progress", "stage": "output", "stream": self.stream, "text": self.pending})
            self.pending = ""
        self.last_sent = time.monotonic()

    def isatty(self):
        return False

    def result(self):
        return {"text": self.text, "dropped": self.dropped}


def trim_traceback(text):
    """From the first frame in the user's code on (the same as the browser sandbox shows), or the last line when there is none."""
    lines = text.rstrip().split("\n")
    first = next((i for i, line in enumerate(lines) if line.lstrip().startswith('File "<exec>"')), -1)
    if first == -1:
        return "\n".join([line for line in lines if line.strip()][-1:])
    header = [lines[0]] if lines and lines[0].startswith("Traceback") else []
    return "\n".join(header + lines[first:])


class StepTimeout(BaseException):
    """Raised in the user's code when its time is up (not an Exception, so a broad `except Exception` does not swallow it)."""


def _on_alarm(signum, frame):
    raise StepTimeout("The code ran longer than its time limit.")


def new_globals():
    return {"__name__": "__main__", "__builtins__": __builtins__}


def prepare_folders():
    for folder in (OUTPUT, WORK):
        os.makedirs(folder, exist_ok=True)
    try:
        os.chdir(WORK)
    except OSError:
        pass


def clear_folders():
    for folder in (OUTPUT, WORK):
        if not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            path = os.path.join(folder, name)
            try:
                shutil.rmtree(path) if os.path.isdir(path) and not os.path.islink(path) else os.unlink(path)
            except OSError:
                pass
    prepare_folders()


def setup_charts(language):
    """matplotlib: a font cache made when the image was built, and the families in the order for this language (no boxes for CJK)."""
    config = os.environ.get("MPLCONFIGDIR", "/tmp/mpl")
    cache = os.environ.get("NOUREON_MPL_CACHE", "/opt/mplcache")
    try:
        if os.path.isdir(cache) and not os.path.isdir(config):
            shutil.copytree(cache, config)
        os.makedirs(config, exist_ok=True)
        orders = {
            "zh-TW": ["Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR"],
            "zh-CN": ["Noto Sans SC", "Noto Sans TC", "Noto Sans JP", "Noto Sans KR"],
            "ja": ["Noto Sans JP", "Noto Sans TC", "Noto Sans SC", "Noto Sans KR"],
            "ko": ["Noto Sans KR", "Noto Sans TC", "Noto Sans SC", "Noto Sans JP"],
        }
        key = next((code for code in orders if str(language).lower().startswith(code.lower())), "zh-TW")
        families = ["Inter"] + orders[key] + ["DejaVu Sans"]
        with open(os.path.join(config, "matplotlibrc"), "w", encoding="utf-8") as handle:
            handle.write("backend: Agg\nfont.family: " + ", ".join(families) + "\naxes.unicode_minus: False\n")
    except OSError:
        pass


def run_step(request, user_globals):
    request_id = request.get("id")
    code = str(request.get("code") or "")
    if len(code) > MAX_CODE_CHARS:
        send({"id": request_id, "type": "result", "error": f"The code is longer than {MAX_CODE_CHARS} characters."})
        return
    timeout = max(1, min(int(request.get("timeoutMs") or 60_000), 120_000)) / 1000
    out, err = Sink("stdout", request_id), Sink("stderr", request_id)
    sys.stdout, sys.stderr = out, err
    started = time.monotonic()
    error = None
    signal.signal(signal.SIGALRM, _on_alarm)
    signal.setitimer(signal.ITIMER_REAL, timeout)
    try:
        compiled = compile(code, "<exec>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
        result = eval(compiled, user_globals)
        if inspect.iscoroutine(result):
            asyncio.run(result)
    except StepTimeout as caught:
        error = str(caught)
    except SystemExit as caught:
        error = f"SystemExit: {caught.code}" if caught.code not in (None, 0) else None
    except BaseException:  # noqa: BLE001 - everything the code raises is its result
        error = trim_traceback("".join(traceback.format_exception(*sys.exc_info())))
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
        out.flush()
        err.flush()
    send({
        "id": request_id,
        "type": "result",
        "stdout": out.result(),
        "stderr": err.result(),
        "error": error,
        "elapsedMs": int((time.monotonic() - started) * 1000),
    })


ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
# What a tool may not change in the environment of its command (where programs and libraries are found, where Python looks, where the network goes).
ENV_BLOCKED = {"PATH", "HOME", "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PYTHONNOUSERSITE", "PYTHONUSERBASE", "SHELL", "IFS",
               "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY"}
ENV_VALUE_LIMIT = 4096
FILE_LIMIT = 16_384

# The port the relay to the proxy listens on (set by the "net" message).
_net_port = None
_net_lock = threading.Lock()


def _forward(source, target):
    """Copies one direction of a connection; at its end tells the other side nothing more comes."""
    try:
        while True:
            chunk = source.recv(65536)
            if not chunk:
                break
            target.sendall(chunk)
    except OSError:
        pass
    try:
        target.shutdown(socket.SHUT_WR)
    except OSError:
        pass


def _relay(client):
    upstream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        upstream.connect(NET_SOCKET)
    except OSError:
        client.close()
        upstream.close()
        return
    back = threading.Thread(target=_forward, args=(upstream, client), daemon=True)
    back.start()
    _forward(client, upstream)
    back.join()
    client.close()
    upstream.close()


def start_network():
    """Opens 127.0.0.1:<port> and relays what comes in to the proxy's socket. Returns the port (the same one when asked again)."""
    global _net_port
    with _net_lock:
        if _net_port is not None:
            return _net_port
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen(64)

        def serve():
            while True:
                try:
                    client, _ = listener.accept()
                except OSError:
                    return
                threading.Thread(target=_relay, args=(client,), daemon=True).start()

        threading.Thread(target=serve, daemon=True).start()
        _net_port = listener.getsockname()[1]
        return _net_port


def command_environment(extra, credentialed=False):
    """The environment of a command. One that comes with credentials is run without what the code of a step can write and run: /opt/pip (writable, and
    allowed to run programs) is not on its PATH or its PYTHONPATH (the tools of the Python cache bring their own, read only), and Python does not look in the
    user's site folder (under HOME, which the steps write)."""
    env = dict(os.environ)
    for name, value in (extra if isinstance(extra, dict) else {}).items():
        if ENV_NAME.match(str(name)) and str(name) not in ENV_BLOCKED:
            env[str(name)] = str(value)[:ENV_VALUE_LIMIT]
    # The programs of the tools, then what pip installed for them.
    if credentialed:
        env["PATH"] = os.pathsep.join([CLI, os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")])
        if os.environ.get("PYTHONPATH"):
            env["PYTHONPATH"] = os.environ["PYTHONPATH"]
        else:
            env.pop("PYTHONPATH", None)
        env["PYTHONNOUSERSITE"] = "1"
    else:
        env["PATH"] = os.pathsep.join([CLI, os.path.join(PIP, "bin"), env.get("PATH", "/usr/local/bin:/usr/bin:/bin")])
        env["PYTHONPATH"] = os.pathsep.join([entry for entry in (env.get("PYTHONPATH", ""), PIP) if entry])
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    env["PIP_NO_CACHE_DIR"] = "1"
    if _net_port is not None:
        proxy = f"http://127.0.0.1:{_net_port}"
        for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            env[name] = proxy
        for name in ("NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy"):
            env.pop(name, None)
    return env


def _walk_to_folder(root, parts, make):
    """Opens the folder that holds the last part, one step at a time without following a link (a link that the code of a step planted is refused,
    where a path given as a string would have followed it). Returns the open descriptors (the last is the folder; close them all)."""
    descriptors = [os.open(root, os.O_RDONLY | os.O_DIRECTORY)]
    try:
        for part in parts[:-1]:
            if make:
                try:
                    os.mkdir(part, 0o700, dir_fd=descriptors[-1])
                except FileExistsError:
                    pass
            descriptors.append(os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptors[-1]))
    except OSError:
        for descriptor in descriptors:
            os.close(descriptor)
        raise
    return descriptors


def _clean_relative(path):
    """The parts of a relative path of a file the server asked for, or None: no empty, "." or ".." part, not absolute."""
    text = str(path or "")
    if not text or text.startswith("/") or "\0" in text:
        return None
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts):
        return None
    return parts


def write_file_safely(root, parts, content):
    """Writes a file under `root`, with only the owner able to read it, and never through a link: the folders are opened without following links, the
    file is made new or an ordinary file of its own (not a link, not one with another name) is written over."""
    descriptors = _walk_to_folder(root, parts, make=True)
    try:
        descriptor = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=descriptors[-1])
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise OSError("not a plain file of its own")
            os.ftruncate(descriptor, 0)
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                descriptor = None
                handle.write(content)
        finally:
            if descriptor is not None:
                os.close(descriptor)
    finally:
        for folder in descriptors:
            os.close(folder)


def remove_file_safely(root, parts):
    descriptors = _walk_to_folder(root, parts, make=False)
    try:
        os.unlink(parts[-1], dir_fd=descriptors[-1])
    finally:
        for folder in descriptors:
            os.close(folder)


def write_command_files(files):
    """Files a command needs in its home (a tool's login, made by the server from the person's credentials): written with only the owner
    able to read them, never through a link the code of a step planted, and removed again when the command is over. Returns what was written."""
    written = []
    for entry in (files if isinstance(files, list) else [])[:4]:
        if not isinstance(entry, dict):
            continue
        parts = _clean_relative(os.path.normpath(str(entry.get("path") or "")) if entry.get("path") else "")
        content = str(entry.get("content") or "")
        if not parts or len(content) > FILE_LIMIT:
            continue
        try:
            write_file_safely(WORK, parts, content)
            written.append(parts)
        except OSError:
            continue
    return written


def wait_for(process, timeout):
    """Waits for a process; the time does not run while the runner is asking the person about a site (a sign file is there then).
    Returns (exit code, timed out)."""
    deadline = time.monotonic() + timeout
    tick = time.monotonic()
    while True:
        try:
            return process.wait(timeout=0.25), False
        except subprocess.TimeoutExpired:
            now = time.monotonic()
            if os.path.exists(NET_WAITING):
                deadline += now - tick
            tick = now
            if now >= deadline:
                return None, True


def pump(stream, sink):
    """Hands what a program writes to a pipe on, as it comes (in pieces; the text of a program is not always whole lines)."""
    try:
        while True:
            chunk = os.read(stream.fileno(), 65536)
            if not chunk:
                break
            sink.write(chunk.decode("utf-8", errors="replace"))
    except OSError:
        pass


def run_command(request):
    """A command line of a CLI tool: run by the shell in /output, what it prints told as it goes, its group ended when it is over."""
    request_id = request.get("id")
    command = str(request.get("command") or "")
    if not command.strip() or len(command) > MAX_CODE_CHARS:
        send({"id": request_id, "type": "result", "error": "The command is empty or longer than " + str(MAX_CODE_CHARS) + " characters."})
        return
    timeout = max(1, min(int(request.get("timeoutMs") or 60_000), 120_000)) / 1000
    out, err = Sink("stdout", request_id), Sink("stderr", request_id)
    started = time.monotonic()
    error = None
    # A command that comes with credentials (files or environment) runs alone: what the steps left running is stopped until it is over.
    frozen = freeze_others() if (request.get("files") or request.get("env")) else set()
    written = write_command_files(request.get("files"))
    try:
        process = subprocess.Popen(
            ["/bin/sh", "-c", command], cwd=OUTPUT if os.path.isdir(OUTPUT) else WORK, env=command_environment(request.get("env"), credentialed=bool(request.get("files") or request.get("env"))),
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
        )
    except OSError as caught:
        remove_files(written)
        thaw(frozen)
        send({"id": request_id, "type": "result", "stdout": out.result(), "stderr": err.result(), "error": f"The command could not be started ({caught.strerror or caught}).", "elapsedMs": 0})
        return
    readers = [threading.Thread(target=pump, args=(process.stdout, out), daemon=True), threading.Thread(target=pump, args=(process.stderr, err), daemon=True)]
    for reader in readers:
        reader.start()
    try:
        code, timed_out = wait_for(process, timeout)
        if timed_out:
            error = "The code ran longer than its time limit."
        elif code != 0:
            error = f"The command exited with code {code}."
    finally:
        # Whatever the command left running (a program in the background) must not outlive it, or hold the files it wrote.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        process.wait()
    for reader in readers:
        reader.join(timeout=2)
    # The files of the credentials go before the others go on.
    remove_files(written)
    thaw(frozen)
    out.flush()
    err.flush()
    send({
        "id": request_id,
        "type": "result",
        "stdout": out.result(),
        "stderr": err.result(),
        "error": error,
        "elapsedMs": int((time.monotonic() - started) * 1000),
    })


def remove_files(written):
    for parts in written:
        try:
            remove_file_safely(WORK, parts)
        except OSError:
            pass


# ---------------------------------------------------------------- the supervisor: the worker that runs the Python of the steps

# How long past its own time limit a step is waited for. The worker stops itself at the limit, and the runner ends the whole container when it does not
# (that comes first: its grace is shorter); this is only for the case that no runner is there to do it.
WORKER_GRACE = 30.0
# What the worker may pass on in one step, beyond what a step may keep: a flood of output frames is cut here.
FORWARD_LIMIT = 2 * CAPTURE_LIMIT
STEP_ERROR_LIMIT = 20_000

_worker = None
_worker_buffer = b""


def make_undebuggable():
    """The supervisor cannot be read or written through /proc/<pid>/mem or ptrace by the worker (the same user), whatever the machine's ptrace setting."""
    try:
        import ctypes
        ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 4
    except Exception:  # noqa: BLE001 - a machine without it is no worse than before
        pass


def start_worker():
    global _worker, _worker_buffer
    stop_worker()
    _worker_buffer = b""
    _worker = subprocess.Popen(
        [sys.executable, "-u", os.path.abspath(__file__), "--worker"], cwd=WORK if os.path.isdir(WORK) else None, env=dict(os.environ),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True,
    )
    return _worker


def stop_worker():
    """Ends the worker and what it started that is still in its group; the variables of the steps go with it."""
    global _worker
    worker, _worker = _worker, None
    if worker is None:
        return
    try:
        os.killpg(worker.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        worker.kill()
    except OSError:
        pass
    for stream in (worker.stdin, worker.stdout):
        try:
            stream.close()
        except OSError:
            pass
    try:
        worker.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass


def _read_worker_line(worker, deadline):
    """The next line the worker wrote, or None when it ended; raises TimeoutError at the deadline."""
    global _worker_buffer
    while b"\n" not in _worker_buffer:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        ready, _, _ = select.select([worker.stdout], [], [], min(remaining, 0.5))
        if not ready:
            if worker.poll() is not None and not select.select([worker.stdout], [], [], 0)[0]:
                return None
            continue
        chunk = os.read(worker.stdout.fileno(), 65536)
        if not chunk:
            return None
        _worker_buffer += chunk
    line, _, _worker_buffer = _worker_buffer.partition(b"\n")
    return line.decode("utf-8", errors="replace")


def _clean_stream(value):
    value = value if isinstance(value, dict) else {}
    text = value.get("text")
    dropped = value.get("dropped")
    return {"text": text[:CAPTURE_LIMIT] if isinstance(text, str) else "", "dropped": dropped if isinstance(dropped, int) and dropped >= 0 else 0}


def run_python_step(request):
    """A step of Python: given to the worker, and what it says is passed on only in the forms a step may use (its output as it comes, then its result)."""
    request_id = request.get("id")
    code = str(request.get("code") or "")
    if len(code) > MAX_CODE_CHARS:
        send({"id": request_id, "type": "result", "error": f"The code is longer than {MAX_CODE_CHARS} characters."})
        return
    timeout = max(1, min(int(request.get("timeoutMs") or 60_000), 120_000)) / 1000
    started = time.monotonic()
    worker = _worker if _worker is not None and _worker.poll() is None else start_worker()

    def ended(message):
        stop_worker()
        send({"id": request_id, "type": "result", "stdout": {"text": "", "dropped": 0}, "stderr": {"text": "", "dropped": 0}, "error": message,
              "elapsedMs": int((time.monotonic() - started) * 1000)})

    try:
        worker.stdin.write((json.dumps({"id": request_id, "type": "run", "code": code, "timeoutMs": int(timeout * 1000)}) + "\n").encode("utf-8"))
        worker.stdin.flush()
    except OSError:
        ended("The Python process had ended; the variables of the earlier steps are gone. Run the step again.")
        return
    deadline = started + timeout + WORKER_GRACE
    forwarded = 0
    while True:
        try:
            line = _read_worker_line(worker, deadline)
        except TimeoutError:
            ended("The code ran longer than its time limit.")
            return
        if line is None:
            ended("The Python process ended while the code was running (the variables of the earlier steps are gone).")
            return
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if not isinstance(message, dict) or message.get("id") != request_id:
            continue
        kind = message.get("type")
        text = message.get("text")
        if kind == "progress" and message.get("stage") == "output" and message.get("stream") in ("stdout", "stderr") and isinstance(text, str):
            if forwarded < FORWARD_LIMIT:
                text = text[: FORWARD_LIMIT - forwarded]
                forwarded += len(text)
                send({"id": request_id, "type": "progress", "stage": "output", "stream": message["stream"], "text": text})
        elif kind == "result":
            error = message.get("error")
            elapsed = message.get("elapsedMs")
            send({
                "id": request_id,
                "type": "result",
                "stdout": _clean_stream(message.get("stdout")),
                "stderr": _clean_stream(message.get("stderr")),
                "error": error[:STEP_ERROR_LIMIT] if isinstance(error, str) else None,
                "elapsedMs": elapsed if isinstance(elapsed, int) and elapsed >= 0 else int((time.monotonic() - started) * 1000),
            })
            return


# ---------------------------------------------------------------- freezing what the code of the steps left running

# While a command runs with credentials, nothing the code of a step started may run beside it (it could read the files, the environment or the memory
# of the command): the others are stopped, and go on when the command is over. "all": every other process of the container (the container's own
# setting); "session": only the worker and what it started in its session (the default, so a test of this file cannot stop the machine it runs on).
FREEZE_SCOPE = os.environ.get("NOUREON_FREEZE", "session")


def _session_of(pid, proc="/proc"):
    try:
        with open(f"{proc}/{pid}/stat", "rb") as handle:
            data = handle.read().decode("utf-8", errors="replace")
        return int(data[data.rindex(")") + 2:].split()[3])
    except (OSError, ValueError, IndexError):
        return None


def processes_to_freeze(scope, own_pid, worker_pid, proc="/proc"):
    """The ids of the processes to stop: never this one."""
    try:
        everyone = [int(name) for name in os.listdir(proc) if name.isdigit()]
    except OSError:
        return set()
    chosen = set()
    for pid in everyone:
        if pid == own_pid:
            continue
        if scope == "all" or (worker_pid is not None and (pid == worker_pid or _session_of(pid, proc) == worker_pid)):
            chosen.add(pid)
    return chosen


def freeze_others(kill=os.kill, proc="/proc"):
    """Stops them (again and again until no new one is found: one may be starting another). Returns the ids stopped."""
    frozen = set()
    for _ in range(10):
        new = processes_to_freeze(FREEZE_SCOPE, os.getpid(), _worker.pid if _worker is not None else None, proc) - frozen
        if not new:
            break
        for pid in new:
            try:
                kill(pid, signal.SIGSTOP)
            except (ProcessLookupError, PermissionError):
                pass
            frozen.add(pid)
    return frozen


def thaw(frozen, kill=os.kill):
    for pid in frozen:
        try:
            kill(pid, signal.SIGCONT)
        except (ProcessLookupError, PermissionError):
            pass


def worker_main():
    """The worker: runs the steps it is given, in one namespace that lasts until it ends."""
    prepare_folders()
    user_globals = new_globals()
    send({"type": "ready"})
    for line in _commands:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError:
            continue
        if request.get("type") == "run":
            run_step(request, user_globals)
        elif request.get("type") == "exit":
            break


def main():
    make_undebuggable()
    prepare_folders()
    send({"type": "ready"})
    try:
        for line in _commands:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
            except ValueError:
                continue
            kind = request.get("type")
            if kind == "init":
                setup_charts(request.get("language") or "zh-TW")
                send({"id": request.get("id"), "type": "result", "initialized": True})
            elif kind == "clear":
                stop_worker()
                clear_folders()
                send({"id": request.get("id"), "type": "result", "cleared": True})
            elif kind == "run":
                run_python_step(request)
            elif kind == "command":
                run_command(request)
            elif kind == "net":
                send({"id": request.get("id"), "type": "result", "port": start_network()})
            elif kind == "exit":
                break
    finally:
        stop_worker()


if __name__ == "__main__":
    if "--worker" in sys.argv[1:]:
        worker_main()
    else:
        main()
