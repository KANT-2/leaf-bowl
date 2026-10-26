#!/usr/bin/env python3
"""CI-gated Next.js and FastAPI deployment supervisor for the development MCP runner."""

import argparse
import contextlib
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import Request, urlopen


REPOSITORY = "KANT-2/Front-5"
WORKFLOW_ID = 377985071
BRANCHES = {"main", "production"}
SHA_PATTERN = re.compile(r"[0-9a-f]{40}")
MIGRATION_TIMEOUT_SECONDS = 300
API_SECRET_VARIABLES = ("DATABASE_URL", "JWT_SECRET_KEY")


def successful_ci(runs, branch, sha):
    """Only the latest matching push run may authorize this exact revision."""
    matches = [
        run for run in runs
        if run.get("head_branch") == branch
        and run.get("head_sha") == sha
        and run.get("event") == "push"
        and run.get("workflow_id") == WORKFLOW_ID
    ]
    latest = max(matches, key=lambda run: run["id"], default=None)
    if latest and latest.get("status") == "completed" and latest.get("conclusion") == "success":
        return latest
    return None


def stop_process(process):
    if process is None or process.poll() is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)


class Deployer:
    def __init__(self, root, branch, port, poll_seconds=60, ci_retry_seconds=180, api_port=None):
        if branch not in BRANCHES:
            raise ValueError("Only main and production can be deployed")
        self.root = Path(root).resolve()
        self.branch = branch
        self.port = port
        self.api_port = api_port or port + 1
        self.poll_seconds = poll_seconds
        self.ci_retry_seconds = ci_retry_seconds
        self.base = self.root / ".deploy" / branch
        self.releases = self.base / "releases"
        self.logs = self.base / "logs"
        for directory in (self.releases, self.logs):
            directory.mkdir(parents=True, exist_ok=True)
        self.state_file = self.base / "state.json"
        self.server = None
        self.api_server = None
        self.build_process = None
        self.migration_process = None
        self.current = None
        # Next.js reads BACKEND_URL for its /backend proxy at build and start; FastAPI stays on loopback.
        self.env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1", "GIT_TERMINAL_PROMPT": "0", "TZ": "UTC",
                    "BACKEND_URL": f"http://127.0.0.1:{self.api_port}"}

    def log(self, message):
        now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        print(f"{now} [{self.branch}] {message}", flush=True)

    def git(self, *arguments):
        result = subprocess.run(
            ["git", *arguments], cwd=self.root, env=self.env,
            check=True, capture_output=True, text=True, timeout=45,
        )
        return result.stdout.strip()

    def fetch_head(self):
        with (self.root / ".deploy" / "fetch.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.git("fetch", "--quiet", "origin", f"refs/heads/{self.branch}:refs/remotes/origin/{self.branch}")
            sha = self.git("rev-parse", f"refs/remotes/origin/{self.branch}")
        if not SHA_PATTERN.fullmatch(sha):
            raise ValueError("Invalid remote commit SHA")
        return sha

    def still_latest(self, sha):
        line = self.git("ls-remote", "origin", f"refs/heads/{self.branch}")
        return bool(line) and line.split()[0] == sha

    def approved_ci(self, sha):
        query = urlencode({"branch": self.branch, "head_sha": sha, "event": "push", "per_page": 100})
        request = Request(
            f"https://api.github.com/repos/{REPOSITORY}/actions/workflows/{WORKFLOW_ID}/runs?{query}",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "front5-mcp-cicd"},
        )
        with urlopen(request, timeout=20) as response:
            runs = json.load(response)["workflow_runs"]
        return successful_ci(runs, self.branch, sha)

    def write_state(self, state):
        state = {**state, "branch": self.branch, "port": self.port, "api_port": self.api_port,
                 "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, indent=2) + "\n")
        temporary.replace(self.state_file)

    def read_state(self):
        if not self.state_file.exists():
            return None
        state = json.loads(self.state_file.read_text())
        if not SHA_PATTERN.fullmatch(state.get("sha", "")):
            raise ValueError("Invalid saved deployment SHA")
        return state

    @staticmethod
    def has_backend(release):
        """Releases before the FastAPI backend run Next.js alone."""
        return (release / "backend" / "pyproject.toml").is_file()

    @staticmethod
    def api_python(release):
        # The venv moves with the release directory, so run uvicorn through its interpreter, not a script shebang.
        return release / "backend" / ".venv" / "bin" / "python"

    def prepare_backend(self, release, sha):
        """Install the locked FastAPI dependencies. Releases cached before FastAPI deployment get them lazily."""
        marker = release / "backend" / ".venv-ready"
        if not self.has_backend(release) or marker.exists():
            return
        if shutil.which("uv", path=self.env.get("PATH")) is None:
            raise RuntimeError("uv is required to prepare the FastAPI backend")
        log_path = self.logs / f"build-{sha}.log"
        self.log(f"Preparing FastAPI for {sha}; log: {log_path}")
        with log_path.open("a") as log:
            self.build_command(["uv", "sync", "--frozen", "--no-dev"], release / "backend", log)
        if not self.api_python(release).is_file():
            raise RuntimeError("FastAPI virtual environment is missing")
        marker.write_text(sha + "\n")

    def build_command(self, command, cwd, log):
        self.build_process = subprocess.Popen(
            command, cwd=cwd, env=self.env, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            result = self.build_process.wait(timeout=900)
            if result:
                raise RuntimeError(f"{' '.join(command)} failed; see build log")
        finally:
            stop_process(self.build_process)
            self.build_process = None

    def prepare_release(self, sha):
        if not SHA_PATTERN.fullmatch(sha):
            raise ValueError("Invalid release SHA")
        release = self.releases / sha
        if (release / ".ready").exists():
            self.prepare_backend(release, sha)
            return release
        stage = Path(tempfile.mkdtemp(prefix=f".{sha}-", dir=self.releases))
        try:
            with tempfile.TemporaryFile() as archive:
                subprocess.run(["git", "archive", sha], cwd=self.root, env=self.env,
                               stdout=archive, check=True, timeout=45)
                archive.seek(0)
                with tarfile.open(fileobj=archive) as files:
                    files.extractall(stage, filter="data")
            log_path = self.logs / f"build-{sha}.log"
            self.log(f"Building {sha}; log: {log_path}")
            with log_path.open("a") as log:
                self.build_command(["npm", "ci"], stage, log)
                self.build_command(["npm", "run", "build"], stage, log)
            if not (stage / ".next" / "BUILD_ID").is_file():
                raise RuntimeError("Next.js build output is missing")
            self.prepare_backend(stage, sha)
            (stage / ".ready").write_text(sha + "\n")
            stage.rename(release)
            return release
        finally:
            if stage.exists():
                shutil.rmtree(stage)

    def start_server(self, release, port, hostname):
        with (self.logs / "server.log").open("a") as log:
            return subprocess.Popen(
                ["node", "node_modules/next/dist/bin/next", "start",
                 "--port", str(port), "--hostname", hostname],
                cwd=release, env=self.env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )

    def api_env(self):
        env = dict(self.env)
        # FastAPI may need a different driver URL than Prisma (for example a Supabase session pooler).
        if self.env.get("BACKEND_DATABASE_URL", "").strip():
            env["DATABASE_URL"] = self.env["BACKEND_DATABASE_URL"]
        missing = [name for name in API_SECRET_VARIABLES if not env.get(name, "").strip()]
        if missing:
            raise RuntimeError(f"{', '.join(missing)} required before starting FastAPI")
        return env

    def start_api(self, release, port):
        env = self.api_env()
        with (self.logs / "api.log").open("a") as log:
            return subprocess.Popen(
                [str(self.api_python(release)), "-m", "uvicorn", "main:app", "--app-dir", "src",
                 "--host", "127.0.0.1", "--port", str(port)],
                cwd=release / "backend", env=env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )

    def wait_api_healthy(self, process, port):
        """/health/db proves FastAPI started, created its tables and can query the database."""
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("FastAPI exited before becoming healthy")
            try:
                with urlopen(f"http://127.0.0.1:{port}/health/db", timeout=3) as response:
                    payload = json.load(response)
                    if response.status == 200 and isinstance(payload, dict) and payload.get("status") == "ok":
                        return
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        raise RuntimeError("FastAPI HTTP/database health check timed out")

    def redact_database_details(self, message):
        connection = self.env.get("DATABASE_URL", "")
        if connection:
            message = message.replace(connection, "[DATABASE_URL redacted]")
            with contextlib.suppress(ValueError):
                password = urlsplit(connection).password
                if password:
                    for secret in (password, unquote(password)):
                        message = message.replace(secret, "[redacted]")
        return re.sub(r"postgres(?:ql)?://[^\s\"'<>]+", "[DATABASE_URL redacted]", message)

    def migrate_release(self, release):
        """Apply this release's migrations using only the supervisor's database."""
        migrations = release / "prisma" / "migrations"
        if not any(migrations.glob("*/migration.sql")):
            if (release / "prisma" / "schema.prisma").exists():
                raise RuntimeError("Prisma release has no migration SQL; refusing deployment")
            return
        if not self.env.get("DATABASE_URL", "").strip():
            raise RuntimeError("DATABASE_URL is required before deploying a Prisma release")
        cli = release / "node_modules" / "prisma" / "build" / "index.js"
        if not cli.is_file():
            raise RuntimeError("Release-local Prisma CLI is missing; refusing deployment")

        log_path = self.logs / f"migration-{release.name}.log"
        self.log(f"Applying database migrations for {release.name}; log: {log_path}")
        # Keep raw CLI errors private until connection details have been removed.
        with tempfile.TemporaryFile(mode="w+t") as output:
            try:
                self.migration_process = subprocess.Popen(
                    ["node", str(cli), "migrate", "deploy"],
                    cwd=release, env=self.env, stdout=output, stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                result = self.migration_process.wait(timeout=MIGRATION_TIMEOUT_SECONDS)
                if result:
                    raise RuntimeError(f"Database migration failed (exit {result}); see {log_path}")
            except subprocess.TimeoutExpired:
                raise RuntimeError(f"Database migration timed out; see {log_path}") from None
            finally:
                stop_process(self.migration_process)
                self.migration_process = None
                output.seek(0)
                with log_path.open("a") as log:
                    log_path.chmod(0o600)
                    log.write(self.redact_database_details(output.read()))
        self.log(f"Database migrations ready for {release.name}")

    def wait_healthy(self, process, port, release):
        paths = ["/"]
        if (release / "app" / "api" / "catalog" / "route.ts").is_file():
            paths.append("/api/catalog")
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("Next.js exited before becoming healthy")
            try:
                healthy = True
                for path in paths:
                    with urlopen(f"http://127.0.0.1:{port}{path}", timeout=3) as response:
                        if response.status != 200:
                            healthy = False
                            break
                        if path == "/api/catalog":
                            payload = json.load(response)
                            if not isinstance(payload, dict) or "error" in payload:
                                healthy = False
                                break
                if healthy:
                    return
            except (OSError, ValueError):
                pass
            time.sleep(0.5)
        raise RuntimeError("Next.js HTTP/database health check timed out")

    @staticmethod
    def free_port():
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            return listener.getsockname()[1]

    def check_candidate(self, release):
        if self.has_backend(release):
            api_port = self.free_port()
            api = self.start_api(release, api_port)
            try:
                self.wait_api_healthy(api, api_port)
            finally:
                stop_process(api)
        port = self.free_port()
        candidate = self.start_server(release, port, "127.0.0.1")
        try:
            self.wait_healthy(candidate, port, release)
        finally:
            stop_process(candidate)

    def start_release(self, release):
        # FastAPI first, so the Next.js /backend proxy never serves without its upstream.
        if self.has_backend(release):
            self.api_server = self.start_api(release, self.api_port)
            self.wait_api_healthy(self.api_server, self.api_port)
        self.server = self.start_server(release, self.port, "0.0.0.0")
        self.wait_healthy(self.server, self.port, release)

    def stop_release(self):
        stop_process(self.server)
        self.server = None
        stop_process(self.api_server)
        self.api_server = None

    def release_stopped(self):
        return (self.server is None or self.server.poll() is not None
                or (self.api_server is not None and self.api_server.poll() is not None))

    def activate(self, state, *, database_ready=False):
        previous = self.current
        release = self.releases / state["sha"]
        if not database_ready:
            self.migrate_release(release)
        self.prepare_backend(release, state["sha"])
        self.stop_release()
        try:
            self.start_release(release)
            self.current = {**state, "status": "running"}
            self.write_state(self.current)
            self.log(f"Serving {state['sha']} on port {self.port}; CI run {state['ci_run_id']}")
        except Exception:
            self.stop_release()
            if previous:
                self.log(f"Activation failed; restoring {previous['sha']}")
                self.start_release(self.releases / previous["sha"])
                self.current = previous
                self.write_state(previous)
            raise

    def deploy_revision(self, sha, run, prepare_only=False):
        release = self.prepare_release(sha)
        # Recheck approval before changing the shared DB, then again before activation.
        if not self.still_latest(sha):
            self.log(f"Skipping superseded revision {sha}")
            return False
        if self.approved_ci(sha) is None:
            self.log(f"CI is no longer successful for {sha}; keeping the current release")
            return False
        self.migrate_release(release)
        self.check_candidate(release)
        if not self.still_latest(sha):
            self.log(f"Skipping superseded revision {sha}")
            return False
        run = self.approved_ci(sha)
        if run is None:
            self.log(f"CI is no longer successful for {sha}; keeping the current release")
            return False
        state = {"sha": sha, "ci_run_id": run["id"], "ci_url": run["html_url"]}
        if prepare_only:
            self.write_state({**state, "status": "prepared"})
            self.log(f"Prepared {sha}; CI run {run['id']}")
        else:
            self.activate(state, database_ready=True)
        return True

    def run(self, prepare_only=False):
        with (self.base / "supervisor.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            saved = self.read_state()
            if not prepare_only and saved and (self.releases / saved["sha"] / ".ready").exists():
                self.activate(saved)
            pending_sha = None
            next_attempt = 0
            while True:
                try:
                    if self.current and self.release_stopped():
                        self.log("Server stopped; restarting the last verified release")
                        self.activate(self.current)
                    sha = self.fetch_head()
                    if self.current and self.current["sha"] == sha:
                        time.sleep(self.poll_seconds)
                        continue
                    if sha != pending_sha:
                        pending_sha, next_attempt = sha, 0
                    if time.monotonic() >= next_attempt:
                        next_attempt = time.monotonic() + self.ci_retry_seconds
                        run = self.approved_ci(sha)
                        if run is None:
                            self.log(f"Waiting for successful push CI for {sha}")
                            if prepare_only:
                                raise RuntimeError("The latest commit has no successful push CI")
                        elif self.deploy_revision(sha, run, prepare_only) and prepare_only:
                            return
                except Exception as error:
                    self.log(f"Deployment deferred: {type(error).__name__}: {error}")
                    if prepare_only:
                        raise
                time.sleep(self.poll_seconds)

    def close(self):
        stop_process(self.migration_process)
        stop_process(self.build_process)
        self.stop_release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", required=True, choices=sorted(BRANCHES))
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--api-port", type=int, help="loopback FastAPI port (default: --port + 1)")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=60)
    args = parser.parse_args()
    api_port = args.api_port or args.port + 1
    if not all(1024 <= port <= 65535 for port in (args.port, api_port)) or args.poll_seconds < 10:
        parser.error("Use ports from 1024 to 65535 and a polling interval of at least 10 seconds")
    if api_port == args.port:
        parser.error("--api-port must differ from --port")
    deployer = Deployer(Path(__file__).resolve().parents[1], args.branch, args.port, args.poll_seconds,
                        api_port=api_port)
    def interrupt(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupt)
    try:
        deployer.run(args.prepare_only)
    except KeyboardInterrupt:
        pass
    finally:
        deployer.close()


if __name__ == "__main__":
    main()
