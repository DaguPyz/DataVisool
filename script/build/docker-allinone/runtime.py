#!/usr/bin/env python3
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
"""Run the bundled MySQL and application processes in one container."""

from __future__ import annotations

import fcntl
import json
import os
import re
import select
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence


DATABASE_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
USER_PATTERN = re.compile(r"[A-Za-z0-9_.-]{1,32}\Z")
DATABASE_ENV_KEYS = ("DB_NAME", "DB_USER", "DB_PASSWORD")
MYSQL_HOST_PORT_FLAG = "DATAVISOOL_MYSQL_HOST_PORT_ENABLED"
MYSQL_HOST = "127.0.0.1"
MYSQL_PORT = 3306
APP_UID = 10001
APP_GID = 10001
APP_ENV = {
    "DB_HOST": MYSQL_HOST,
    "DB_PORT": str(MYSQL_PORT),
    "DATAVISOOL_RESOURCE_PATH_ROOT": "/data/resource",
    "DATAVISOOL_AI_STORAGE_PATH": "/data/resource/ai-driven",
    "DATAVISOOL_LICENSE": "/data/resource/license",
    "SPRING_CONFIG_LOCATION": "file:/config/application.yml",
    "SPRING_PROFILES_ACTIVE": "prod",
}


@dataclass(frozen=True)
class RuntimeConfig:
    data_root: Path = Path("/data")
    run_root: Path = Path("/run/mysqld")
    mysql_entrypoint: str = "/usr/local/bin/docker-entrypoint.sh"
    mysqld_version_command: str = "mysqld"
    mysql_client: str = "mysql"
    gosu: str = "gosu"
    java: str = "java"
    server_jar: Path = Path("/datavisool/server/server.jar")
    work_dir: Path = Path("/datavisool/server")
    app_port: int = 8080
    startup_timeout: float = 600.0
    query_timeout: float = 5.0
    poll_interval: float = 0.25
    app_stop_timeout: float = 50.0
    mysql_stop_timeout: float = 50.0
    http_timeout: float = 5.0


def _ensure_data_dirs(config: RuntimeConfig) -> None:
    config.data_root.mkdir(parents=True, exist_ok=True)
    if config.data_root.is_symlink() or not config.data_root.is_dir():
        raise RuntimeError("data root must be a real directory")
    for name in ("mysql", "resource", "logs", "config"):
        directory = config.data_root / name
        directory.mkdir(parents=True, exist_ok=True)
        if directory.is_symlink() or not directory.is_dir():
            raise RuntimeError(f"data path must be a real directory: {directory}")
        if name == "config":
            os.chmod(directory, 0o700)
        elif name in {"resource", "logs"}:
            os.chmod(directory, 0o750)
            if os.geteuid() == 0:
                os.chown(directory, APP_UID, APP_GID)


def _validate_database_settings(database: object, user: object, password: object) -> tuple[str, str, str]:
    if not isinstance(database, str) or not DATABASE_PATTERN.fullmatch(database):
        raise RuntimeError("DB_NAME must be 1-64 characters using letters, digits, '_' or '-'")
    if not isinstance(user, str) or not USER_PATTERN.fullmatch(user):
        raise RuntimeError("DB_USER must be 1-32 characters using letters, digits, '_', '-' or '.'")
    if (not isinstance(password, str) or not password
            or "\n" in password or "\r" in password or "\x00" in password):
        raise RuntimeError("DB_PASSWORD must be a non-empty single-line value")
    return database, user, password


def _read_credentials(path: Path) -> dict[str, str]:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, os.O_RDONLY | nofollow)
    try:
        info = os.fstat(fd)
        if not stat_is_regular(info.st_mode):
            raise RuntimeError("database credentials file must be a regular file")
        if info.st_uid != os.geteuid():
            raise RuntimeError("database credentials file must be owned by the runtime user")
        if info.st_mode & 0o077:
            raise RuntimeError("database credentials file permissions must be 0600")
        with os.fdopen(fd, "r", encoding="utf-8", closefd=False) as stream:
            payload = json.load(stream)
    finally:
        os.close(fd)
    expected = {"version", "database", "user", "mysql_version", "root_password", "app_password"}
    if not isinstance(payload, dict) or set(payload) != expected:
        raise RuntimeError("database credentials file has an unsupported format")
    version = payload["version"]
    if (type(version) is not int or version != 2
            or not isinstance(payload["mysql_version"], str)
            or not re.fullmatch(r"\d+\.\d+\.\d+", payload["mysql_version"])):
        raise RuntimeError("database credentials file has an unsupported format")
    _validate_database_settings(payload["database"], payload["user"], payload["app_password"])
    if (not isinstance(payload["root_password"], str) or not payload["root_password"]
            or "\n" in payload["root_password"] or "\r" in payload["root_password"]
            or "\x00" in payload["root_password"]):
        raise RuntimeError("database credentials file contains an invalid password")
    return payload


def installed_mysql_version(config: RuntimeConfig) -> str:
    try:
        result = subprocess.run([config.mysqld_version_command, "--version"],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"cannot read the installed MySQL server version: {exc}") from exc
    if result.returncode != 0:
        raise RuntimeError("cannot read the installed MySQL server version")
    match = re.search(r"\bVer\s+(\d+\.\d+\.\d+)\b", result.stdout)
    if not match:
        raise RuntimeError("mysqld --version returned an unrecognized version")
    return match.group(1)


def stat_is_regular(mode: int) -> bool:
    return stat.S_ISREG(mode)


def _write_credentials_atomic(path: Path, payload: Mapping[str, object]) -> None:
    directory = path.parent
    raw = (json.dumps(payload, sort_keys=True) + "\n").encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=".database.json.", suffix=".tmp", dir=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _requested_database_settings(base_env: Mapping[str, str]) -> tuple[str, str, str] | None:
    present = [key in base_env for key in DATABASE_ENV_KEYS]
    if not any(present):
        return None
    missing = [key for key in DATABASE_ENV_KEYS if not base_env.get(key)]
    if missing:
        raise RuntimeError(f"database settings are incomplete; provide non-empty {', '.join(missing)}")
    return _validate_database_settings(*(base_env[key] for key in DATABASE_ENV_KEYS))


def _mysql_sql_password(password: str) -> str:
    """Escape a password for a MySQL single-quoted SQL string literal."""
    return password.replace("\\", "\\\\").replace("'", "\\'")


def _mysql_option_password(password: str) -> str:
    """Escape a password for a double-quoted MySQL option-file value."""
    return password.replace("\\", "\\\\").replace('"', '\\"')


def _check_requested_settings(credentials: Mapping[str, str], requested: tuple[str, str, str] | None) -> None:
    if requested is None:
        return
    database, user, password = requested
    if (database, user, password) != (
            credentials["database"], credentials["user"], credentials["app_password"]):
        raise RuntimeError(
            "provided DB_NAME/DB_USER/DB_PASSWORD differ from the saved database credentials; "
            "changing .env does not update existing MySQL accounts or passwords. "
            "Restore the saved settings or migrate the database credentials manually"
        )


def load_or_create_credentials(config: RuntimeConfig,
                               base_env: Mapping[str, str] | None = None) -> dict[str, str]:
    _ensure_data_dirs(config)
    env = os.environ if base_env is None else base_env
    requested = _requested_database_settings(env)
    mysql_version = installed_mysql_version(config)
    credential_file = config.data_root / "config" / "database.json"
    lock_file = config.data_root / "config" / ".database.lock"
    lock_fd = os.open(lock_file, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        lock_info = os.fstat(lock_fd)
        if not stat.S_ISREG(lock_info.st_mode):
            raise RuntimeError("database lock must be a regular file")
        if lock_info.st_uid != os.geteuid():
            raise RuntimeError("database lock must be owned by the runtime user")
        os.fchmod(lock_fd, 0o600)
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        if credential_file.exists() or credential_file.is_symlink():
            credentials = _read_credentials(credential_file)
            if credentials["mysql_version"] != mysql_version:
                raise RuntimeError(
                    "installed MySQL version differs from the version recorded with this data; "
                    "perform a planned database migration before changing the image"
                )
            _check_requested_settings(credentials, requested)
            return credentials

        mysql_dir = config.data_root / "mysql"
        try:
            has_existing_data = next(os.scandir(mysql_dir), None) is not None
        except FileNotFoundError:
            mysql_dir.mkdir(parents=True, exist_ok=True)
            has_existing_data = False
        if has_existing_data:
            raise RuntimeError(
                "MySQL data exists without database credentials; refusing to generate new passwords"
            )

        if requested is None:
            raise RuntimeError(
                "first startup requires non-empty DB_NAME, DB_USER, and DB_PASSWORD"
            )
        database, user, password = requested

        payload = {
            "version": 2,
            "database": database,
            "user": user,
            "mysql_version": mysql_version,
            "root_password": password,
            "app_password": password,
        }
        _write_credentials_atomic(credential_file, payload)
        return payload  # type: ignore[return-value]
    finally:
        os.close(lock_fd)


def mysql_environment(credentials: Mapping[str, str], base: Mapping[str, str]) -> dict[str, str]:
    # The official image has many MYSQL_* initialization switches. Only these
    # runtime-selected values may reach its entrypoint; inherited settings are ignored.
    env = {key: value for key, value in base.items() if not key.startswith("MYSQL_")}
    env.update({
        "MYSQL_ROOT_PASSWORD": credentials["root_password"],
        "MYSQL_ROOT_PASSWORD_SQL": _mysql_sql_password(credentials["root_password"]),
        "MYSQL_ROOT_PASSWORD_CLIENT": _mysql_option_password(credentials["root_password"]),
        # Fresh host-port-enabled installs need root@% because Docker's
        # published-port connection is sourced from a bridge address. Existing
        # data is migrated below only when this explicit Compose flag is set.
        "MYSQL_ROOT_HOST": "%" if base.get(MYSQL_HOST_PORT_FLAG) == "1" else "127.0.0.1",
        "MYSQL_DATABASE": credentials["database"],
    })
    if credentials["user"] != "root":
        env["MYSQL_USER"] = credentials["user"]
        env["MYSQL_PASSWORD"] = credentials["app_password"]
        env["MYSQL_PASSWORD_SQL"] = _mysql_sql_password(credentials["app_password"])
    return env


def mysql_arguments(config: RuntimeConfig) -> list[str]:
    socket_path = config.run_root / "mysqld.sock"
    return [
        config.mysql_entrypoint,
        "mysqld",
        "--bind-address=0.0.0.0",
        "--mysqlx=OFF",
        f"--datadir={config.data_root / 'mysql'}",
        f"--socket={socket_path}",
        f"--pid-file={config.run_root / 'mysqld.pid'}",
        "--character-set-server=utf8mb4",
        "--collation-server=utf8mb4_unicode_ci",
    ]


def _mysql_query(config: RuntimeConfig, credentials: Mapping[str, str], *, timeout: float) -> bool:
    env = {key: value for key, value in os.environ.items() if not key.startswith("MYSQL_")}
    env["MYSQL_PWD"] = credentials["app_password"]
    command = [
        config.mysql_client,
        "--protocol=TCP",
        f"--host={MYSQL_HOST}",
        f"--port={MYSQL_PORT}",
        f"--user={credentials['user']}",
        f"--database={credentials['database']}",
        "--batch",
        "--skip-column-names",
        "--execute=SELECT 1",
    ]
    try:
        result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _start_mysql(config: RuntimeConfig, credentials: Mapping[str, str],
                 base_env: Mapping[str, str]) -> subprocess.Popen[bytes]:
    config.run_root.mkdir(parents=True, exist_ok=True)
    _remove_stale_mysql_pid(config)
    return subprocess.Popen(
        mysql_arguments(config),
        env=mysql_environment(credentials, base_env),
        cwd=str(config.data_root),
        start_new_session=True,
    )


def _mysql_pid_file(config: RuntimeConfig) -> Path:
    return config.run_root / "mysqld.pid"


def _read_mysql_pid(config: RuntimeConfig) -> int | None:
    path = _mysql_pid_file(config)
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError("MySQL pid file must be a regular file")
    try:
        value = path.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"cannot read MySQL pid file: {exc}") from exc
    if not re.fullmatch(r"[1-9]\d{0,9}", value):
        raise RuntimeError("MySQL pid file contains an invalid process id")
    return int(value)


def _is_expected_mysql_process(pid: int, config: RuntimeConfig) -> bool:
    """Verify a pid-file target before signaling it (temporary init daemons detach)."""
    proc = Path("/proc") / str(pid)
    try:
        stat_line = (proc / "stat").read_text(encoding="ascii")
        state = stat_line.rsplit(")", 1)[1].split()[0]
        executable = os.path.basename(os.readlink(proc / "exe")).removesuffix(" (deleted)")
        raw = (proc / "cmdline").read_bytes()
    except FileNotFoundError:
        return False
    except (OSError, IndexError):
        return False
    if state == "Z" or not raw:
        return False
    argv = [arg.decode("utf-8", errors="replace") for arg in raw.rstrip(b"\0").split(b"\0")]
    # MySQL may rewrite its argv for process-title reporting, so verify the
    # actual executable; this container intentionally has only one mysqld.
    return executable in {"mysqld", "mysqld-debug"} and bool(argv)


def _pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    try:
        stat_line = (Path("/proc") / str(pid) / "stat").read_text(encoding="ascii")
        state = stat_line.rsplit(")", 1)[1].split()[0]
        return state != "Z"
    except (FileNotFoundError, OSError, IndexError):
        # On systems without procfs, kill(pid, 0) is the available liveness test.
        return True


def _remove_stale_mysql_pid(config: RuntimeConfig) -> None:
    pid = _read_mysql_pid(config)
    if pid is None:
        return
    if _is_expected_mysql_process(pid, config):
        raise RuntimeError(f"MySQL process {pid} is already running")
    if not _pid_is_alive(pid):
        _mysql_pid_file(config).unlink(missing_ok=True)
    else:
        # A live process that doesn't match the MySQL executable/datadir must
        # never be signaled or silently overwritten.
        raise RuntimeError(f"MySQL pid file points to an unverified live process {pid}")


def _stop_detached_mysql(config: RuntimeConfig, timeout: float,
                         validator: Callable[[int, RuntimeConfig], bool] = _is_expected_mysql_process) -> bool:
    pid = _read_mysql_pid(config)
    if pid is None:
        return True
    if not _pid_is_alive(pid):
        _mysql_pid_file(config).unlink(missing_ok=True)
        return True
    if not validator(pid, config):
        if not _pid_is_alive(pid):
            _mysql_pid_file(config).unlink(missing_ok=True)
            return True
        # Never signal an unverified process. Also refuse to call this a clean
        # stop so cold-backup tooling cannot mistake a live daemon for safety.
        return False
    deadline = time.monotonic() + max(timeout, 0.0)
    pidfd: int | None = None
    try:
        if hasattr(os, "pidfd_open"):
            try:
                pidfd = os.pidfd_open(pid, 0)
            except ProcessLookupError:
                return True
        if pidfd is not None and hasattr(signal, "pidfd_send_signal"):
            signal.pidfd_send_signal(pidfd, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            if pidfd is not None:
                ready, _, _ = select.select([pidfd], [], [], min(remaining, 0.2))
                if ready:
                    return True
            elif not validator(pid, config):
                return True
            else:
                time.sleep(min(0.2, remaining))
        if pidfd is not None and hasattr(signal, "pidfd_send_signal"):
            signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        elif validator(pid, config):
            os.kill(pid, signal.SIGKILL)
        return False
    except ProcessLookupError:
        return True
    except OSError:
        return False
    finally:
        if pidfd is not None:
            os.close(pidfd)


def _process_group_exists(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def stop_process_group(process: subprocess.Popen[bytes] | None, timeout: float) -> bool:
    if process is None:
        return True
    pgid = process.pid
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    forced = False
    try:
        process.wait(timeout=max(timeout, 0.0))
    except subprocess.TimeoutExpired:
        forced = True
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
    # The entrypoint can leave a temporary initialization daemon in its
    # process group. Give it a brief grace period after the leader exits, then
    # kill any surviving descendants so an interrupted init cannot orphan it.
    if _process_group_exists(pgid):
        time.sleep(min(0.15, max(timeout, 0.0)))
    if _process_group_exists(pgid):
        forced = True
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    return not forced


def _write_clean_marker(config: RuntimeConfig) -> None:
    marker = config.data_root / "config" / "clean-shutdown"
    _write_credentials_atomic(marker, {"clean": True})


def wait_for_mysql(config: RuntimeConfig, mysql: subprocess.Popen[bytes],
                   credentials: Mapping[str, str], stop_requested: threading.Event,
                   *, query: Callable[..., bool] = _mysql_query) -> None:
    deadline = time.monotonic() + config.startup_timeout
    while not stop_requested.is_set():
        code = mysql.poll()
        if code is not None:
            raise RuntimeError(f"MySQL entrypoint exited during initialization (status {code})")
        if query(config, credentials, timeout=config.query_timeout):
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("MySQL did not become ready before the startup timeout")
        stop_requested.wait(min(config.poll_interval, remaining))
    raise InterruptedError("shutdown requested during MySQL initialization")


def _mysql_socket_sql(config: RuntimeConfig, credentials: Mapping[str, str], sql: str,
                      *, timeout: float) -> subprocess.CompletedProcess[str] | None:
    """Run root maintenance SQL through the private socket without exposing it in argv/logs."""
    env = {key: value for key, value in os.environ.items() if not key.startswith("MYSQL_")}
    env["MYSQL_PWD"] = credentials["root_password"]
    command = [
        config.mysql_client,
        "--protocol=SOCKET",
        f"--socket={config.run_root / 'mysqld.sock'}",
        "--user=root",
        "--database=mysql",
        "--batch",
        "--skip-column-names",
    ]
    try:
        return subprocess.run(command, env=env, input=sql, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None


def ensure_root_host_mapping(config: RuntimeConfig, credentials: Mapping[str, str],
                             *, timeout: float = 10.0) -> bool:
    """Add root@% for published-port access without changing any existing root account."""
    result = _mysql_socket_sql(
        config, credentials,
        "SELECT COUNT(*) FROM mysql.user WHERE User='root' AND Host='%';\n",
        timeout=timeout,
    )
    if result is None or result.returncode != 0:
        print("warning: could not verify MySQL root host access; application startup will continue",
              file=sys.stderr)
        return False
    try:
        exists = int(result.stdout.strip()) > 0
    except ValueError:
        print("warning: could not verify MySQL root host access; application startup will continue",
              file=sys.stderr)
        return False
    if exists:
        return True

    root_password_sql = _mysql_sql_password(credentials["root_password"])
    migration = (
        # The escaped literal below follows MySQL's default backslash rules.
        # Existing databases can persist NO_BACKSLASH_ESCAPES, so normalize only
        # this short-lived migration connection before parsing that statement.
        "SET SESSION sql_mode='';\n"
        f"CREATE USER 'root'@'%' IDENTIFIED BY '{root_password_sql}';\n"
        "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;\n"
        "FLUSH PRIVILEGES;\n"
    )
    result = _mysql_socket_sql(config, credentials, migration, timeout=timeout)
    if result is None or result.returncode != 0:
        # Never print mysql's SQL diagnostics here: they may include fragments of
        # a user-supplied password for malformed or rejected statements.
        print("warning: could not add MySQL root host access; application startup will continue",
              file=sys.stderr)
        return False
    return True


def app_environment(credentials: Mapping[str, str], base: Mapping[str, str]) -> dict[str, str]:
    env = dict(base)
    env.update(APP_ENV)
    env.update({
        "DB_NAME": credentials["database"],
        "DB_USER": credentials["user"],
        "DB_PASSWORD": credentials["app_password"],
    })
    return env


def _start_app(config: RuntimeConfig, credentials: Mapping[str, str],
               base_env: Mapping[str, str]) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        [config.gosu, "datavisool", config.java, "-jar", str(config.server_jar)],
        env=app_environment(credentials, base_env),
        cwd=str(config.work_dir),
        start_new_session=True,
    )


def supervise(config: RuntimeConfig = RuntimeConfig(), *,
              base_env: Mapping[str, str] | None = None,
              query: Callable[..., bool] = _mysql_query,
              mysql_pid_validator: Callable[[int, RuntimeConfig], bool] = _is_expected_mysql_process,
              install_handlers: bool = True) -> int:
    env = dict(os.environ if base_env is None else base_env)
    marker = config.data_root / "config" / "clean-shutdown"
    credentials = load_or_create_credentials(config, env)
    try:
        marker.unlink()
    except FileNotFoundError:
        pass
    stopping = threading.Event()
    old_handlers: dict[int, object] = {}

    def request_stop(signum: int, _frame: object) -> None:
        stopping.set()

    if install_handlers:
        for signum in (signal.SIGTERM, signal.SIGINT):
            old_handlers[signum] = signal.signal(signum, request_stop)

    mysql: subprocess.Popen[bytes] | None = None
    app: subprocess.Popen[bytes] | None = None
    failure = 0
    mysql_ready = False
    try:
        mysql = _start_mysql(config, credentials, env)
        wait_for_mysql(config, mysql, credentials, stopping, query=query)
        mysql_ready = True
        if stopping.is_set():
            return 0
        if env.get(MYSQL_HOST_PORT_FLAG) == "1":
            ensure_root_host_mapping(config, credentials)
        app = _start_app(config, credentials, env)
        while not stopping.wait(config.poll_interval):
            mysql_code = mysql.poll()
            app_code = app.poll()
            if mysql_code is not None:
                print(f"MySQL exited unexpectedly (status {mysql_code})", file=sys.stderr)
                failure = mysql_code if mysql_code != 0 else 1
                break
            if app_code is not None:
                print(f"application exited unexpectedly (status {app_code})", file=sys.stderr)
                failure = app_code if app_code != 0 else 1
                break
        return 0 if stopping.is_set() else failure
    except InterruptedError:
        return 0 if stopping.is_set() else 1
    except Exception as exc:
        print(f"runtime error: {exc}", file=sys.stderr)
        return 1
    finally:
        # MySQL initialization uses a temporary daemon in the entrypoint's
        # process group. Stop app first, then the entire MySQL process group.
        stop_process_group(app, config.app_stop_timeout)
        mysql_was_running_at_shutdown = mysql is not None and mysql.poll() is None
        mysql_stop_deadline = time.monotonic() + config.mysql_stop_timeout
        mysql_stopped_cleanly = stop_process_group(mysql, config.mysql_stop_timeout)
        detached_mysql_stopped_cleanly = _stop_detached_mysql(
            config, max(0.0, mysql_stop_deadline - time.monotonic()),
            validator=mysql_pid_validator
        )
        mysql_exit_code = mysql.poll() if mysql is not None else None
        if (mysql_ready and mysql_was_running_at_shutdown and mysql_stopped_cleanly
                and detached_mysql_stopped_cleanly and mysql_exit_code == 0):
            try:
                _write_clean_marker(config)
            except OSError as exc:
                print(f"could not record clean MySQL shutdown: {exc}", file=sys.stderr)
        for signum, handler in old_handlers.items():
            signal.signal(signum, handler)  # type: ignore[arg-type]


def healthcheck(config: RuntimeConfig = RuntimeConfig(), *,
                opener: Callable[..., object] = urllib.request.urlopen,
                query: Callable[..., bool] = _mysql_query) -> int:
    try:
        credentials = _read_credentials(config.data_root / "config" / "database.json")
        if not query(config, credentials, timeout=config.query_timeout):
            raise RuntimeError("application database query failed")
        for suffix in ("/index.html", "/api/security/getEncryptKey"):
            request = urllib.request.Request(f"http://127.0.0.1:{config.app_port}{suffix}")
            with opener(request, timeout=config.http_timeout) as response:
                status = response.status if hasattr(response, "status") else response.getcode()
                if status < 200 or status >= 300:
                    raise RuntimeError(f"HTTP health endpoint returned status {status}")
        return 0
    except Exception as exc:
        print(f"healthcheck failed: {exc}", file=sys.stderr)
        return 1


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    command = arguments[0] if arguments else "run"
    if len(arguments) > 1 or command not in {"run", "healthcheck"}:
        print("usage: runtime.py [run|healthcheck]", file=sys.stderr)
        return 2
    if command == "healthcheck":
        return healthcheck()
    return supervise()


if __name__ == "__main__":
    raise SystemExit(main())
