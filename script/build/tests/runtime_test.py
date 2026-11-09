# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
import contextlib
import importlib.util
import io
import json
import os
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "docker-allinone" / "runtime.py"
ENTRYPOINT_PATCHER = ROOT / "docker-allinone" / "patch-mysql-entrypoint.py"
SPECIAL_PASSWORD = "P$'\"\\tail\\"


class MySQLEntrypointPatchTests(unittest.TestCase):
    def test_patcher_uses_escaped_passwords_and_suppresses_sensitive_sql_errors(self):
        source = """\
CREATE USER 'root'@'${MYSQL_ROOT_HOST}' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}' ;
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}' ;
password="${MYSQL_ROOT_PASSWORD}"
docker_process_sql --dont-use-mysql-root-password --database=mysql <<-EOSQL
docker_process_sql --database=mysql <<<"CREATE USER '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD' ;"
"""
        with tempfile.TemporaryDirectory(prefix="datavisool-entrypoint-patch-") as directory:
            entrypoint = Path(directory) / "docker-entrypoint.sh"
            entrypoint.write_text(source, encoding="utf-8")
            result = subprocess.run([sys.executable, str(ENTRYPOINT_PATCHER), str(entrypoint)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            patched = entrypoint.read_text(encoding="utf-8")
            self.assertEqual(patched.count("${MYSQL_ROOT_PASSWORD_SQL}"), 2)
            self.assertIn('password="${MYSQL_ROOT_PASSWORD_CLIENT}"', patched)
            self.assertIn("IDENTIFIED BY '$MYSQL_PASSWORD_SQL' ;", patched)
            self.assertIn("--database=mysql 2>/dev/null <<-EOSQL", patched)
            self.assertIn("--database=mysql 2>/dev/null <<<", patched)

            repeated = subprocess.run([sys.executable, str(ENTRYPOINT_PATCHER), str(entrypoint)],
                                      capture_output=True, text=True, check=False)
            self.assertNotEqual(repeated.returncode, 0)
            self.assertIn("already contains", repeated.stderr)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="datavisool-runtime-")
        self.root = Path(self.temporary.name)
        self.data = self.root / "data"
        self.state = self.root / "state"
        self.state.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.work = self.root / "work"
        self.work.mkdir()
        self.mysql_version = self._executable("mysqld", self._version_script())
        self.mysql_client = self._executable("mysql", self._mysql_client_script())
        self.entrypoint = self._executable("entrypoint", self._entrypoint_script())
        self.gosu = self._executable("gosu", self._gosu_script())
        self.java = self._executable("java", self._java_script())
        self.harness = self.root / "run_runtime.py"
        self.harness.write_text(self._harness_script(), encoding="utf-8")
        self.config = {
            "data_root": str(self.data),
            "run_root": str(self.root / "run"),
            "mysql_entrypoint": str(self.entrypoint),
            "mysqld_version_command": str(self.mysql_version),
            "mysql_client": str(self.mysql_client),
            "gosu": str(self.gosu),
            "java": str(self.java),
            "server_jar": str(self.root / "server.jar"),
            "work_dir": str(self.work),
            "app_port": 18080,
            "startup_timeout": 3,
            "query_timeout": 0.2,
            "poll_interval": 0.02,
            "app_stop_timeout": 0.5,
            "mysql_stop_timeout": 0.5,
            "http_timeout": 0.2,
        }

    def tearDown(self):
        self.temporary.cleanup()

    def _executable(self, name, source):
        path = self.bin / name
        path.write_text(f"#!{sys.executable}\n" + source, encoding="utf-8")
        path.chmod(0o755)
        return path

    def _version_script(self):
        return """
import os, sys
print('mysqld Ver ' + os.environ.get('FAKE_MYSQL_VERSION', '8.4.11') + ' for test platform')
"""

    def _mysql_client_script(self):
        return """
import json, os, sys
from pathlib import Path
state = Path(os.environ['FAKE_RUNTIME_STATE'])
if not (state / 'mysql-ready').exists():
    raise SystemExit(1)
args = sys.argv[1:]
if '--protocol=SOCKET' in args:
    sql = sys.stdin.read()
    with (state / 'events').open('a', encoding='utf-8') as stream:
        stream.write('root-socket-query\\n')
    if os.environ.get('FAKE_ROOT_QUERY_FAIL') == '1':
        raise SystemExit(2)
    if 'SELECT COUNT(*) FROM mysql.user' in sql:
        print(os.environ.get('FAKE_ROOT_WILDCARD_EXISTS', '1'))
        raise SystemExit(0)
    (state / 'root-migration.sql').write_text(sql, encoding='utf-8')
    if os.environ.get('FAKE_ROOT_MIGRATION_FAIL') == '1':
        raise SystemExit(3)
    raise SystemExit(0)
with (state / 'events').open('a', encoding='utf-8') as stream:
    stream.write('database-query\\n')
with (state / 'mysql-client-env').open('w', encoding='utf-8') as stream:
    json.dump({'password': os.environ.get('MYSQL_PWD'), 'args': args}, stream)
"""

    def _entrypoint_script(self):
        return """
import json, os, signal, subprocess, sys, time
from pathlib import Path
state = Path(os.environ['FAKE_RUNTIME_STATE'])
events = state / 'events'
def log(value):
    with events.open('a', encoding='utf-8') as stream:
        stream.write(value + '\\n')
with (state / 'mysql-env').open('w', encoding='utf-8') as stream:
    json.dump({k: v for k, v in os.environ.items() if k.startswith('MYSQL_')}, stream)
with (state / 'mysql-arguments').open('w', encoding='utf-8') as stream:
    json.dump(sys.argv[1:], stream)
try:
    (state / 'mysql-ready').unlink()
except FileNotFoundError:
    pass
detached = os.environ.get('FAKE_DETACHED_MYSQL') == '1'
pid_file = next((arg.split('=', 1)[1] for arg in sys.argv[1:] if arg.startswith('--pid-file=')), None)
child = subprocess.Popen([sys.executable, os.environ['FAKE_MYSQL_CHILD']],
                         start_new_session=detached)
(state / 'mysql-child-pid').write_text(str(child.pid), encoding='utf-8')
if detached and pid_file:
    Path(pid_file).write_text(str(child.pid), encoding='ascii')
mode = os.environ.get('FAKE_ENTRYPOINT_MODE', 'normal')
if mode == 'fail-init':
    deadline = time.monotonic() + 3
    while not (state / 'child-heartbeat').exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    raise SystemExit(17)
def stop(_signum, _frame):
    log('mysql-stop')
    if not detached:
        try:
            child.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
if mode == 'delayed-ready':
    while True:
        time.sleep(0.05)
(state / 'mysql-ready').touch()
log('mysql-ready')
if mode == 'fail-after-ready':
    deadline = time.monotonic() + 3
    while not (state / 'app-start').exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    raise SystemExit(19)
while True:
    time.sleep(0.05)
"""

    def _child_script(self):
        return """
import os, signal, time
from pathlib import Path
state = Path(os.environ['FAKE_RUNTIME_STATE'])
heartbeat = state / 'child-heartbeat'
def stop(_signum, _frame):
    (state / 'mysql-child-stop').touch()
    raise SystemExit(0)
if os.environ.get('FAKE_CHILD_IGNORE_TERM') == '1':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
else:
    signal.signal(signal.SIGTERM, stop)
while True:
    with heartbeat.open('a', encoding='utf-8') as stream:
        stream.write('x')
    time.sleep(0.03)
"""

    def _gosu_script(self):
        return """
import os, sys
if len(sys.argv) < 4 or sys.argv[1] != 'datavisool':
    raise SystemExit(64)
java = os.environ['FAKE_JAVA_EXEC']
os.execv(java, [java, *sys.argv[3:]])
"""

    def _java_script(self):
        return """
import json, os, signal, sys, time
from pathlib import Path
state = Path(os.environ['FAKE_RUNTIME_STATE'])
(state / 'app-args').write_text(json.dumps(sys.argv[1:]), encoding='utf-8')
with (state / 'app-env').open('w', encoding='utf-8') as stream:
    json.dump({key: os.environ.get(key) for key in (
        'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
        'DATAVISOOL_RESOURCE_PATH_ROOT', 'DATAVISOOL_AI_STORAGE_PATH',
        'DATAVISOOL_LICENSE')}, stream)
(state / 'app-start').touch()
with (state / 'events').open('a', encoding='utf-8') as stream:
    stream.write('app-start\\n')
def stop(_signum, _frame):
    (state / 'app-stop').touch()
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
if os.environ.get('FAKE_APP_EXIT'):
    time.sleep(0.15)
    raise SystemExit(int(os.environ['FAKE_APP_EXIT']))
while True:
    time.sleep(0.05)
"""

    def _harness_script(self):
        return f"""
import importlib.util, json, os, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('lcp_runtime', {str(RUNTIME)!r})
runtime = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runtime
spec.loader.exec_module(runtime)
values = json.loads(os.environ['FAKE_RUNTIME_CONFIG'])
for key in ('data_root', 'run_root', 'server_jar', 'work_dir'):
    values[key] = Path(values[key])
def mysql_pid_validator(pid, config):
    state = Path(os.environ['FAKE_RUNTIME_STATE'])
    pid_file = config.run_root / 'mysqld.pid'
    try:
        return int(pid_file.read_text(encoding='ascii').strip()) == pid and not (state / 'mysql-child-stop').exists()
    except (OSError, ValueError):
        return False
raise SystemExit(runtime.supervise(runtime.RuntimeConfig(**values), base_env=os.environ,
                                   mysql_pid_validator=mysql_pid_validator))
"""

    def _environment(self, **overrides):
        env = os.environ.copy()
        env.update({
            "FAKE_RUNTIME_STATE": str(self.state),
            "FAKE_RUNTIME_CONFIG": json.dumps(self.config),
            "FAKE_MYSQL_CHILD": str(self._executable("mysql-child", self._child_script())),
            "FAKE_JAVA_EXEC": str(self.java),
            "DB_NAME": "custom_db",
            "DB_USER": "test_app",
            "DB_PASSWORD": SPECIAL_PASSWORD,
            "DATAVISOOL_MYSQL_HOST_PORT_ENABLED": "1",
            "PATH": str(self.bin) + os.pathsep + env.get("PATH", ""),
        })
        env.update(overrides)
        if env.pop("FAKE_OMIT_DB_ENV", None):
            for key in ("DB_NAME", "DB_USER", "DB_PASSWORD"):
                env.pop(key, None)
        if env.pop("FAKE_OMIT_HOST_MAPPING_FLAG", None):
            env.pop("DATAVISOOL_MYSQL_HOST_PORT_ENABLED", None)
        return env

    def _start(self, **overrides):
        return subprocess.Popen([sys.executable, str(self.harness)], env=self._environment(**overrides),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    def _wait_for(self, path, process, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if path.exists():
                return
            if process.poll() is not None:
                out, err = process.communicate()
                self.fail(f"runtime exited before {path.name}; stdout={out!r}, stderr={err!r}")
            time.sleep(0.02)
        self.fail(f"timed out waiting for {path.name}")

    def _stop(self, process, sig=signal.SIGTERM, timeout=5):
        if process.poll() is None:
            process.send_signal(sig)
        out, err = process.communicate(timeout=timeout)
        return process.returncode, out, err

    def _finish(self, process, timeout=5):
        out, err = process.communicate(timeout=timeout)
        return process.returncode, out, err

    @staticmethod
    def _pid_is_alive(pid):
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False

    def test_first_boot_credentials_readiness_signal_shutdown_and_reuse(self):
        env = self._environment(MYSQL_RANDOM_ROOT_PASSWORD="1", MYSQL_DATABASE="external_db",
                                MYSQL_INITDB_SKIP_TZINFO="1")
        process = subprocess.Popen([sys.executable, str(self.harness)], env=env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self._wait_for(self.state / "app-start", process)
        self.assertEqual(json.loads((self.state / "app-args").read_text(encoding="utf-8")),
                         ["-jar", str(self.root / "server.jar")])
        credential_file = self.data / "config" / "database.json"
        credentials = json.loads(credential_file.read_text(encoding="utf-8"))
        self.assertEqual(stat.S_IMODE(credential_file.stat().st_mode), 0o600)
        self.assertEqual(credentials["version"], 2)
        self.assertEqual(credentials["database"], "custom_db")
        self.assertEqual(credentials["user"], "test_app")
        self.assertEqual(credentials["mysql_version"], "8.4.11")
        self.assertEqual(credentials["root_password"], SPECIAL_PASSWORD)
        self.assertEqual(credentials["app_password"], SPECIAL_PASSWORD)
        mysql_env = json.loads((self.state / "mysql-env").read_text(encoding="utf-8"))
        self.assertEqual(set(mysql_env), {"MYSQL_ROOT_PASSWORD", "MYSQL_ROOT_HOST", "MYSQL_DATABASE",
                                          "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD_SQL",
                                          "MYSQL_ROOT_PASSWORD_CLIENT", "MYSQL_PASSWORD_SQL"})
        self.assertEqual(mysql_env["MYSQL_ROOT_HOST"], "%")
        self.assertEqual(mysql_env["MYSQL_DATABASE"], "custom_db")
        self.assertEqual(mysql_env["MYSQL_USER"], "test_app")
        self.assertEqual(mysql_env["MYSQL_PASSWORD"], SPECIAL_PASSWORD)
        self.assertEqual(mysql_env["MYSQL_ROOT_PASSWORD"], SPECIAL_PASSWORD)
        self.assertEqual(mysql_env["MYSQL_ROOT_PASSWORD_SQL"], SPECIAL_PASSWORD.replace("\\", "\\\\").replace("'", "\\'"))
        self.assertEqual(mysql_env["MYSQL_PASSWORD_SQL"], SPECIAL_PASSWORD.replace("\\", "\\\\").replace("'", "\\'"))
        self.assertEqual(mysql_env["MYSQL_ROOT_PASSWORD_CLIENT"], SPECIAL_PASSWORD.replace("\\", "\\\\").replace('"', '\\"'))
        mysql_args = json.loads((self.state / "mysql-arguments").read_text(encoding="utf-8"))
        self.assertIn("--bind-address=0.0.0.0", mysql_args)
        client_env = json.loads((self.state / "mysql-client-env").read_text(encoding="utf-8"))
        self.assertEqual(client_env["password"], credentials["app_password"])
        self.assertIn("--user=test_app", client_env["args"])
        self.assertIn("--database=custom_db", client_env["args"])
        app_env = json.loads((self.state / "app-env").read_text(encoding="utf-8"))
        self.assertEqual(app_env["DB_HOST"], "127.0.0.1")
        self.assertEqual(app_env["DB_PORT"], "3306")
        self.assertEqual(app_env["DB_NAME"], "custom_db")
        self.assertEqual(app_env["DB_USER"], "test_app")
        self.assertEqual(app_env["DB_PASSWORD"], SPECIAL_PASSWORD)
        events = (self.state / "events").read_text(encoding="utf-8").splitlines()
        self.assertLess(events.index("database-query"), events.index("app-start"))
        self.assertTrue((self.data / "resource").is_dir())
        self.assertTrue((self.data / "logs").is_dir())
        self.assertTrue((self.data / "config").is_dir())

        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)
        self.assertTrue((self.state / "app-stop").exists())
        self.assertIn("mysql-stop", (self.state / "events").read_text(encoding="utf-8"))
        self.assertTrue((self.data / "config" / "clean-shutdown").exists())
        first_bytes = credential_file.read_bytes()

        (self.state / "app-start").unlink()
        second = self._start()
        self._wait_for(self.state / "app-start", second)
        self.assertEqual(credential_file.read_bytes(), first_bytes)
        code, _, err = self._stop(second)
        self.assertEqual(code, 0, err)

    def test_unknown_mysql_data_without_credentials_is_not_initialized(self):
        mysql_dir = self.data / "mysql"
        mysql_dir.mkdir(parents=True)
        (mysql_dir / "ibdata1").write_bytes(b"unknown database")
        process = self._start()
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("refusing to generate new passwords", err)
        self.assertFalse((self.data / "config" / "database.json").exists())
        self.assertFalse((self.state / "mysql-env").exists())

    def test_first_boot_requires_all_non_empty_database_settings(self):
        process = self._start(DB_PASSWORD="")
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("provide non-empty DB_PASSWORD", err)
        self.assertFalse((self.state / "mysql-env").exists())
        self.assertFalse((self.data / "config" / "database.json").exists())

    def test_database_and_user_names_are_validated_without_echoing_password(self):
        secret = "must-not-appear-in-errors"
        process = self._start(DB_NAME="bad/name", DB_PASSWORD=secret)
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("DB_NAME must be", err)
        self.assertNotIn(secret, err)
        self.assertFalse((self.state / "mysql-env").exists())

        process = self._start(DB_USER="bad user")
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("DB_USER must be", err)
        self.assertFalse((self.state / "mysql-env").exists())

    def test_root_user_does_not_pass_forbidden_mysql_user_switches(self):
        process = self._start(DB_USER="root")
        self._wait_for(self.state / "app-start", process)
        mysql_env = json.loads((self.state / "mysql-env").read_text(encoding="utf-8"))
        self.assertEqual(set(mysql_env), {"MYSQL_ROOT_PASSWORD", "MYSQL_ROOT_HOST", "MYSQL_DATABASE",
                                          "MYSQL_ROOT_PASSWORD_SQL", "MYSQL_ROOT_PASSWORD_CLIENT"})
        self.assertEqual(mysql_env["MYSQL_ROOT_HOST"], "%")
        self.assertEqual(mysql_env["MYSQL_DATABASE"], "custom_db")
        client_env = json.loads((self.state / "mysql-client-env").read_text(encoding="utf-8"))
        self.assertIn("--user=root", client_env["args"])
        app_env = json.loads((self.state / "app-env").read_text(encoding="utf-8"))
        self.assertEqual(app_env["DB_USER"], "root")
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)

    def test_v1_credentials_are_rejected_without_modification(self):
        config_dir = self.data / "config"
        config_dir.mkdir(parents=True)
        legacy = {
            "version": 1, "database": "lcp_server", "user": "lcp_app",
            "mysql_version": "8.4.11", "root_password": "r" * 64, "app_password": "a" * 64,
        }
        credential_file = config_dir / "database.json"
        credential_file.write_text(json.dumps(legacy), encoding="utf-8")
        credential_file.chmod(0o600)
        original = credential_file.read_bytes()
        process = self._start(FAKE_OMIT_DB_ENV="1")
        code, _, err = self._finish(process, timeout=5)
        self.assertNotEqual(code, 0)
        self.assertIn("unsupported format", err)
        self.assertEqual(credential_file.read_bytes(), original)
        self.assertFalse((self.state / "app-start").exists())

    def test_existing_root_wildcard_account_is_never_modified(self):
        process = self._start(FAKE_ROOT_WILDCARD_EXISTS="1")
        self._wait_for(self.state / "app-start", process)
        self.assertFalse((self.state / "root-migration.sql").exists())
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)

    def test_host_mapping_disabled_uses_loopback_root_and_skips_migration(self):
        process = self._start(FAKE_OMIT_HOST_MAPPING_FLAG="1", FAKE_ROOT_WILDCARD_EXISTS="0")
        self._wait_for(self.state / "app-start", process)
        mysql_env = json.loads((self.state / "mysql-env").read_text(encoding="utf-8"))
        self.assertEqual(mysql_env["MYSQL_ROOT_HOST"], "127.0.0.1")
        events = (self.state / "events").read_text(encoding="utf-8").splitlines()
        self.assertNotIn("root-socket-query", events)
        self.assertFalse((self.state / "root-migration.sql").exists())
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)

    def test_root_host_migration_failure_is_generic_and_app_continues(self):
        process = self._start(FAKE_ROOT_QUERY_FAIL="1")
        self._wait_for(self.state / "app-start", process)
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)
        self.assertIn("could not verify MySQL root host access", err)
        self.assertNotIn(SPECIAL_PASSWORD, err)
        self.assertNotIn("SELECT COUNT(*)", err)

    def test_root_password_migration_escapes_special_characters(self):
        process = self._start(FAKE_ROOT_WILDCARD_EXISTS="0")
        self._wait_for(self.state / "app-start", process)
        migration = (self.state / "root-migration.sql").read_text(encoding="utf-8")
        self.assertTrue(migration.startswith("SET SESSION sql_mode='';\n"))
        escaped = SPECIAL_PASSWORD.replace("\\", "\\\\").replace("'", "\\'")
        self.assertIn("IDENTIFIED BY '" + escaped + "'", migration)
        self.assertNotIn(SPECIAL_PASSWORD, migration)
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)

    def test_root_host_create_failure_does_not_expose_sql_or_password(self):
        process = self._start(FAKE_ROOT_WILDCARD_EXISTS="0", FAKE_ROOT_MIGRATION_FAIL="1")
        self._wait_for(self.state / "app-start", process)
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)
        self.assertIn("could not add MySQL root host access", err)
        self.assertNotIn(SPECIAL_PASSWORD, err)
        self.assertNotIn("CREATE USER", err)

    def test_changed_environment_does_not_reset_saved_credentials(self):
        process = self._start()
        self._wait_for(self.state / "app-start", process)
        self._stop(process)
        (self.state / "app-start").unlink()
        (self.state / "mysql-env").unlink()
        credential_file = self.data / "config" / "database.json"
        original = credential_file.read_bytes()

        process = self._start(DB_PASSWORD="different password")
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("changing .env does not update existing MySQL accounts or passwords", err)
        self.assertNotIn("different password", err)
        self.assertEqual(credential_file.read_bytes(), original)
        self.assertFalse((self.state / "mysql-env").exists())

    def test_mysql_version_change_and_legacy_unpinned_credentials_are_rejected(self):
        process = self._start()
        self._wait_for(self.state / "app-start", process)
        code, _, err = self._stop(process)
        self.assertEqual(code, 0, err)
        (self.state / "app-start").unlink()
        process = self._start(FAKE_MYSQL_VERSION="8.4.12")
        code, _, err = self._finish(process)
        self.assertEqual(code, 1)
        self.assertIn("version differs", err)
        self.assertFalse((self.state / "app-start").exists())
        self.assertTrue((self.data / "config" / "clean-shutdown").exists())

        credentials_path = self.data / "config" / "database.json"
        credentials = json.loads(credentials_path.read_text(encoding="utf-8"))
        credentials.pop("mysql_version")
        credentials_path.write_text(json.dumps(credentials), encoding="utf-8")
        credentials_path.chmod(0o600)
        process = self._start()
        code, _, err = self._finish(process)
        self.assertEqual(code, 1)
        self.assertIn("unsupported format", err)

    def test_interrupted_initialization_kills_entrypoint_group_and_writes_no_marker(self):
        process = self._start(FAKE_ENTRYPOINT_MODE="fail-init", FAKE_CHILD_IGNORE_TERM="1")
        self._wait_for(self.state / "mysql-child-pid", process)
        self._wait_for(self.state / "child-heartbeat", process)
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 1)
        self.assertIn("exited during initialization", err)
        heartbeat = self.state / "child-heartbeat"
        before = heartbeat.stat().st_size
        time.sleep(0.12)
        self.assertEqual(heartbeat.stat().st_size, before)
        self.assertFalse((self.state / "app-start").exists())
        self.assertFalse((self.data / "config" / "clean-shutdown").exists())

    def test_signal_during_initialization_stops_mysql_without_starting_app(self):
        process = self._start(FAKE_ENTRYPOINT_MODE="delayed-ready", FAKE_DETACHED_MYSQL="1")
        self._wait_for(self.state / "mysql-env", process)
        self._wait_for(self.state / "mysql-child-pid", process)
        self._wait_for(self.state / "child-heartbeat", process)
        self._stop(process, sig=signal.SIGTERM)
        self.assertFalse((self.state / "app-start").exists())
        self.assertFalse((self.data / "config" / "clean-shutdown").exists())
        self.assertTrue((self.state / "mysql-child-stop").exists())
        self.assertFalse(self._pid_is_alive(int((self.state / "mysql-child-pid").read_text(encoding="utf-8"))))

    def test_unexpected_child_exit_is_nonzero_and_stops_its_peer(self):
        process = self._start(FAKE_APP_EXIT="23")
        self._wait_for(self.state / "app-start", process)
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 23, err)
        self.assertIn("mysql-stop", (self.state / "events").read_text(encoding="utf-8"))

    def test_unexpected_mysql_exit_stops_app_and_does_not_mark_clean_shutdown(self):
        process = self._start(FAKE_ENTRYPOINT_MODE="fail-after-ready")
        self._wait_for(self.state / "app-start", process)
        code, _, err = self._finish(process, timeout=5)
        self.assertEqual(code, 19, err)
        self.assertIn("MySQL exited unexpectedly", err)
        self.assertTrue((self.state / "app-stop").exists())
        self.assertFalse((self.data / "config" / "clean-shutdown").exists())

    def test_healthcheck_checks_tcp_database_and_both_http_endpoints(self):
        credentials_dir = self.data / "config"
        credentials_dir.mkdir(parents=True)
        (credentials_dir / "database.json").write_text(json.dumps({
            "version": 2,
            "database": "current_db",
            "user": "current_user",
            "mysql_version": "8.4.11",
            "root_password": "r" * 64,
            "app_password": "a" * 64,
        }), encoding="utf-8")
        (credentials_dir / "database.json").chmod(0o600)
        spec = importlib.util.spec_from_file_location("lcp_runtime_health", RUNTIME)
        runtime = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = runtime
        spec.loader.exec_module(runtime)
        runtime_config = runtime.RuntimeConfig(**{**self.config, "data_root": self.data})

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def getcode(self):
                return self.status

        seen = []
        queried_credentials = []

        def opener(request, timeout):
            seen.append((request.full_url, timeout))
            return Response()

        self.assertEqual(runtime.healthcheck(runtime_config, opener=opener,
                                             query=lambda _config, credentials, **_k: queried_credentials.append(dict(credentials)) or True), 0)
        self.assertEqual(queried_credentials[0]["database"], "current_db")
        self.assertEqual(queried_credentials[0]["user"], "current_user")
        self.assertEqual(queried_credentials[0]["app_password"], "a" * 64)
        self.assertEqual([url.rsplit(":18080", 1)[-1] for url, _ in seen],
                         ["/index.html", "/api/security/getEncryptKey"])
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(runtime.healthcheck(runtime_config, opener=opener,
                                                 query=lambda *_a, **_k: False), 1)


if __name__ == "__main__":
    unittest.main()
