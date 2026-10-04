"""The program that runs inside a sandbox container: model-written Python, one step at a time, in one long-lived process so
variables stay between the steps of a reply.

It talks to the runner over stdin and stdout, one JSON object per line:
  in:   {"id", "type": "run", "code", "timeoutMs"}  |  {"id", "type": "command", "command", "env", "timeoutMs"}  |  {"id", "type": "clear"}
        |  {"id", "type": "init", "language"}
  out:  {"type": "ready"}  |  {"id", "type": "progress", "stage": "output", "stream", "text"}
        |  {"id", "type": "result", "stdout": {"text", "dropped"}, "stderr": {...}, "error", "elapsedMs"}

The files a step writes are not sent here: they are in the output folder, which the runner reads. The program's own stdin and stdout are
taken away from the user's code (it gets /dev/null), so nothing it prints can pass for a message.
Folders: /input (read only), /output, /work (home), /fonts. NOUREON_INPUT, NOUREON_OUTPUT and NOUREON_WORK move them (tests).
"""
import ast
import asyncio
import inspect
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback

INPUT = os.environ.get("NOUREON_INPUT", "/input")
# The programs of the CLI tools (read only); a command finds them first.
CLI = os.environ.get("NOUREON_CLI", "/opt/cli")
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
# What a tool may not change in the environment of its command (where programs and libraries are found, where Python looks).
ENV_BLOCKED = {"PATH", "HOME", "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "SHELL", "IFS"}


def command_environment(extra):
    env = dict(os.environ)
    for name, value in (extra if isinstance(extra, dict) else {}).items():
        if ENV_NAME.match(str(name)) and str(name) not in ENV_BLOCKED:
            env[str(name)] = str(value)[:200]
    env["PATH"] = CLI + os.pathsep + env.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    return env


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
    try:
        process = subprocess.Popen(
            ["/bin/sh", "-c", command], cwd=OUTPUT if os.path.isdir(OUTPUT) else WORK, env=command_environment(request.get("env")),
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
        )
    except OSError as caught:
        send({"id": request_id, "type": "result", "stdout": out.result(), "stderr": err.result(), "error": f"The command could not be started ({caught.strerror or caught}).", "elapsedMs": 0})
        return
    readers = [threading.Thread(target=pump, args=(process.stdout, out), daemon=True), threading.Thread(target=pump, args=(process.stderr, err), daemon=True)]
    for reader in readers:
        reader.start()
    try:
        code = process.wait(timeout=timeout)
        if code != 0:
            error = f"The command exited with code {code}."
    except subprocess.TimeoutExpired:
        error = "The code ran longer than its time limit."
    finally:
        # Whatever the command left running (a program in the background) must not outlive it, or hold the files it wrote.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        process.wait()
    for reader in readers:
        reader.join(timeout=2)
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


def main():
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
        kind = request.get("type")
        if kind == "init":
            setup_charts(request.get("language") or "zh-TW")
            send({"id": request.get("id"), "type": "result", "initialized": True})
        elif kind == "clear":
            clear_folders()
            user_globals = new_globals()
            send({"id": request.get("id"), "type": "result", "cleared": True})
        elif kind == "run":
            run_step(request, user_globals)
        elif kind == "command":
            run_command(request)
        elif kind == "exit":
            break


if __name__ == "__main__":
    main()
