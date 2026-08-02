#!/usr/bin/env python3
"""Start the local oneShare development stack."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO


REPO_ROOT = Path(__file__).resolve().parent
ENV_PATH = REPO_ROOT / ".env"
BACKEND_DIR = REPO_ROOT / "server"
AGENT_RUNTIME_DIR = REPO_ROOT / "agent-runtime"
FRONTEND_DIR = REPO_ROOT / "client"
STARTUP_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class ProcessSpec:
    name: str
    cwd: Path
    command: tuple[str, ...]
    port: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start the oneShare development stack.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate dependencies, configuration, and ports without starting processes.",
    )
    return parser.parse_args()


def load_environment(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise RuntimeError(f"Missing environment file: {path}. Create it from .env.example first.")

    environment = dict(os.environ)
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not key.isidentifier():
            raise RuntimeError(f"Invalid .env entry on line {line_number}.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        environment[key] = value
    environment["PYTHONUNBUFFERED"] = "1"
    return environment


def read_port(environment: dict[str, str], name: str, fallback: int) -> int:
    raw_value = environment.get(name, str(fallback)).strip()
    try:
        port = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a valid port number.") from error
    if not 1 <= port <= 65535:
        raise RuntimeError(f"{name} must be between 1 and 65535.")
    return port


def build_processes(environment: dict[str, str]) -> tuple[ProcessSpec, ...]:
    backend_port = read_port(environment, "VITE_FILE_SERVER_PORT", 8000)
    runtime_port = read_port(environment, "PI_RUNTIME_PORT", 8001)
    frontend_port = read_port(environment, "VITE_PORT", 3000)
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("npm is required but was not found on PATH.")
    uv = shutil.which("uv")
    if uv is None:
        raise RuntimeError("uv is required but was not found on PATH.")
    return (
        ProcessSpec(
            name="backend",
            cwd=BACKEND_DIR,
            command=(
                uv,
                "run",
                "--project",
                str(BACKEND_DIR),
                "uvicorn",
                "main:app",
                "--host",
                environment.get("VITE_FILE_SERVER_HOST", "127.0.0.1"),
                "--port",
                str(backend_port),
                "--reload",
            ),
            port=backend_port,
        ),
        ProcessSpec(
            name="agent-runtime",
            cwd=AGENT_RUNTIME_DIR,
            command=(npm, "run", "dev"),
            port=runtime_port,
        ),
        ProcessSpec(
            name="frontend",
            cwd=FRONTEND_DIR,
            command=(npm, "run", "dev", "--", "--port", str(frontend_port)),
            port=frontend_port,
        ),
    )


def assert_preconditions(processes: Iterable[ProcessSpec]) -> None:
    for process in processes:
        if not process.cwd.is_dir():
            raise RuntimeError(f"Missing runtime directory: {process.cwd}")
        if process.name != "backend" and not (process.cwd / "node_modules").is_dir():
            raise RuntimeError(f"Missing dependencies in {process.cwd}. Run npm install there first.")
        if port_is_in_use(process.port):
            raise RuntimeError(
                f"Port {process.port} for {process.name} is already in use. "
                "Stop the process that owns it before running dev.py."
            )

def port_is_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
        client.settimeout(0.2)
        return client.connect_ex(("127.0.0.1", port)) == 0


def stream_output(name: str, stream: TextIO | None) -> None:
    if stream is None:
        return
    for line in iter(stream.readline, ""):
        print(f"[{name}] {line.rstrip()}", flush=True)
    stream.close()


class DevelopmentStack:
    def __init__(self, processes: tuple[ProcessSpec, ...], environment: dict[str, str]) -> None:
        self._process_specs = processes
        self._environment = environment
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._stopping = False

    def run(self) -> int:
        self._install_signal_handlers()
        try:
            for spec in self._process_specs:
                self._start(spec)
                self._wait_until_ready((spec,))
            print("oneShare development stack is ready at http://localhost:3000", flush=True)
            while not self._stopping:
                for name, process in self._processes.items():
                    exit_code = process.poll()
                    if exit_code is not None:
                        raise RuntimeError(f"{name} exited unexpectedly with code {exit_code}.")
                time.sleep(0.25)
        except KeyboardInterrupt:
            self._stopping = True
        finally:
            self._stop_all()
        return 0

    def _start(self, spec: ProcessSpec) -> None:
        print(f"[{spec.name}] starting: {' '.join(spec.command)}", flush=True)
        process = subprocess.Popen(
            spec.command,
            cwd=spec.cwd,
            env=self._environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            bufsize=1,
            start_new_session=True,
        )
        self._processes[spec.name] = process
        threading.Thread(
            target=stream_output,
            args=(spec.name, process.stdout),
            daemon=True,
            name=f"{spec.name}-output",
        ).start()

    def _wait_until_ready(self, processes: Iterable[ProcessSpec]) -> None:
        pending = {spec.name: spec for spec in processes}
        deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
        while pending:
            if self._stopping:
                raise KeyboardInterrupt
            for name, process in self._processes.items():
                exit_code = process.poll()
                if exit_code is not None:
                    raise RuntimeError(f"{name} exited during startup with code {exit_code}.")
            pending = {
                name: spec
                for name, spec in pending.items()
                if not port_is_in_use(spec.port)
            }
            if not pending:
                return
            if time.monotonic() >= deadline:
                names = ", ".join(pending)
                raise RuntimeError(f"Timed out waiting for {names} to listen on their configured ports.")
            time.sleep(0.1)

    def _install_signal_handlers(self) -> None:
        def stop(_signal_number: int, _frame: object) -> None:
            self._stopping = True

        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)

    def _stop_all(self) -> None:
        active = [process for process in self._processes.values() if process.poll() is None]
        if not active:
            return
        print("Stopping oneShare development stack...", flush=True)
        for process in active:
            os.killpg(process.pid, signal.SIGTERM)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and any(process.poll() is None for process in active):
            time.sleep(0.1)
        for process in active:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)


def main() -> int:
    args = parse_args()
    environment = load_environment(ENV_PATH)
    processes = build_processes(environment)
    assert_preconditions(processes)
    if args.check:
        print("Development prerequisites are ready.")
        return 0
    sync_backend(environment)
    return DevelopmentStack(processes, environment).run()


def sync_backend(environment: dict[str, str]) -> None:
    uv = shutil.which("uv")
    if uv is None:
        raise RuntimeError("uv is required but was not found on PATH.")
    print("[backend] syncing Python dependencies with uv...", flush=True)
    result = subprocess.run(
        (uv, "sync", "--project", str(BACKEND_DIR)),
        cwd=REPO_ROOT,
        env=environment,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"uv sync failed with code {result.returncode}.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"dev.py: {error}", file=sys.stderr)
        raise SystemExit(1) from error
