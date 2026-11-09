#!/bin/sh
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.

case "${DATAVISOOL_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in
  [Ee][Nn]*) DATAVISOOL_LANG=en-US ;;
  *) DATAVISOOL_LANG=zh-CN ;;
esac
export DATAVISOOL_LANG
dv_msg() {
  if [ "$DATAVISOOL_LANG" = en-US ]; then command printf '%s' "$2"; else command printf '%s' "$1"; fi
}

# Docker packages have their own runtime and do not require a host JDK or Node.js.
entry_path=$0
case "$entry_path" in */*) ;; *) entry_path=$(command -v "$entry_path") || exit 1 ;; esac
entry_dir=${entry_path%/*}
[ "$entry_dir" != "$entry_path" ] || entry_dir=.
case "$entry_dir" in -*) entry_dir=./$entry_dir ;; esac
entry_dir=$(CDPATH= cd -P "$entry_dir" 2>/dev/null && pwd -P) || exit 1
if [ -d "$entry_dir/docker-app" ] && [ ! -f "$entry_dir/server.jar" ] && [ ! -d "$entry_dir/docker-allinone" ]; then
  if [ ! -r "$entry_dir/docker-app/launch.sh" ]; then
    printf "$(dv_msg '错误：Docker app 包缺少 docker-app/launch.sh，请重新解压完整发布包。\n' 'Error: docker-app/launch.sh is missing. Extract the complete package again.\n')" >&2
    exit 1
  fi
  exec /bin/sh "$entry_dir/docker-app/launch.sh" "$@"
fi
if [ -d "$entry_dir/docker-allinone" ] && [ ! -f "$entry_dir/server.jar" ] && [ ! -d "$entry_dir/docker-app" ]; then
  if [ ! -r "$entry_dir/docker-allinone/launch.sh" ]; then
    printf "$(dv_msg '错误：Docker allinone 包缺少 docker-allinone/launch.sh，请重新解压完整发布包。\n' 'Error: docker-allinone/launch.sh is missing. Extract the complete package again.\n')" >&2
    exit 1
  fi
  exec /bin/sh "$entry_dir/docker-allinone/launch.sh" "$@"
fi

usage() {
  if [ "$DATAVISOOL_LANG" = en-US ]; then
    cat <<'EOF'
Native deployment launcher

Usage:
  ./deploy_linux.sh           Complete required configuration and start in the background
  ./deploy_linux.sh --check   Check deployment requirements without prompting or starting
  ./deploy_linux.sh --status  Show the process recorded for this deployment
  ./deploy_linux.sh --stop    Stop the recorded process
  ./deploy_linux.sh --restart  Stop and restart the application
  ./deploy_linux.sh --help    Show this help

Java 17 and MySQL are required. Missing database settings are requested interactively.
If Java 17 is unavailable, the launcher asks for a JDK path for this run only.
Configuration is backed up before changes; logs are in logs/startup.log and process records in run/.
For a new database, the administrator password is requested without saving it to the configuration.
Startup waits up to 120 seconds for the application and local HTTP checks.
EOF
    return
  fi
  cat <<'EOF'
常规部署一键启动

用法：
  ./deploy_linux.sh          补齐必要配置，然后在后台启动应用
  ./deploy_linux.sh --check  只检查部署条件，不询问、不修改、不启动
  ./deploy_linux.sh --status 查看此目录记录的应用进程
  ./deploy_linux.sh --stop   停止此目录记录的应用进程
  ./deploy_linux.sh --restart 停止成功后重新启动；未运行时直接启动
  ./deploy_linux.sh --help   显示帮助

需要 Java 17 和已有 MySQL。数据库名、用户名或密码未填写时交互补齐。
启动或重启时找不到可用 Java 17，会询问 JDK 安装目录；留空取消，路径仅本次使用。
配置保存前自动备份；日志在 logs/startup.log，进程信息在 run/。
空数据库首次初始化时会提示输入管理员密码，输入不会保存到配置文件。
启动时等待应用启动及本机 HTTP 检查，最长 120 秒；脚本不会安装软件或配置开机自启。
EOF
}

fail() {
  printf "$(dv_msg '错误：%s\n' 'Error: %s\n')" "$1" >&2
  exit 1
}

mode=start
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      [ "$mode" = start ] || fail "$(dv_msg '参数只能指定一次。' 'Specify an operation only once.')"
      mode=help
      ;;
    --check|--status|--stop|--restart)
      [ "$mode" = start ] || fail "$(dv_msg '参数只能指定一次。' 'Specify an operation only once.')"
      mode=${arg#--}
      ;;
    *)
      fail "$(dv_msg "不支持的参数：$arg。运行 ./deploy_linux.sh --help 查看用法。" "Unsupported argument: $arg. Run ./deploy_linux.sh --help for usage.")"
      ;;
  esac
done

if [ "$mode" = help ]; then
  usage
  exit 0
fi

case "$mode" in
  start) printf "$(dv_msg '准备启动应用，正在检查部署目录……\n' 'Preparing to start; checking the deployment directory...\n')" ;;
  check) printf "$(dv_msg '正在检查部署条件……\n' 'Checking deployment requirements...\n')" ;;
  status) printf "$(dv_msg '正在查询应用进程……\n' 'Checking the application process...\n')" ;;
  stop) printf "$(dv_msg '准备停止应用，正在检查部署目录……\n' 'Preparing to stop; checking the deployment directory...\n')" ;;
  restart) printf "$(dv_msg '准备重启应用，正在检查部署目录……\n' 'Preparing to restart; checking the deployment directory...\n')" ;;
esac

script_path=$0
case "$script_path" in
  */*) ;;
  *) script_path=$(command -v "$script_path") || fail "$(dv_msg '无法定位部署脚本。' 'Cannot locate the deployment script.')" ;;
esac
script_dir=${script_path%/*}
[ "$script_dir" != "$script_path" ] || script_dir=.
case "$script_dir" in
  -*) script_dir=./$script_dir ;;
esac
package_root=$(CDPATH= cd -P "$script_dir" 2>/dev/null && pwd -P) || fail "$(dv_msg '无法定位解压目录。' 'Cannot locate the extracted package directory.')"

native_marker=no
app_marker=no
allinone_marker=no
[ -f "$package_root/server.jar" ] && native_marker=yes
[ -d "$package_root/docker-app" ] && app_marker=yes
[ -d "$package_root/docker-allinone" ] && allinone_marker=yes

if [ "$native_marker" = yes ] && { [ "$app_marker" = yes ] || [ "$allinone_marker" = yes ]; }; then
  fail "$(dv_msg '压缩包同时包含常规部署和 Docker 产物标记，无法判断部署类型。' 'The package contains both native and Docker deployment files; its type is ambiguous.')"
fi
if [ "$app_marker" = yes ] && [ "$allinone_marker" = yes ]; then
  fail "$(dv_msg '压缩包同时包含 Docker 应用和 Docker 一体化产物标记，无法判断部署类型。' 'The package contains both Docker app and all-in-one deployment files; its type is ambiguous.')"
fi
if [ "$native_marker" != yes ]; then
  if [ "$app_marker" = yes ] || [ "$allinone_marker" = yes ]; then
    fail "$(dv_msg '检测到 Docker 部署包；此一键脚本目前仅支持常规 Java 部署，请按包内的 部署说明.md 操作。' 'A Docker package was detected; use its included deployment instructions.')"
  fi
  fail "$(dv_msg '未识别此压缩包：缺少 server.jar 或 Docker 产物标记。' 'Unrecognized package: server.jar and Docker deployment files are missing.')"
fi

jar_file=$package_root/server.jar
[ -f "$jar_file" ] && [ -r "$jar_file" ] || fail "$(dv_msg '缺少可读取的 server.jar。' 'server.jar is missing or unreadable.')"

config_file=$package_root/config/application.yml
run_dir=$package_root/run
pid_file=$run_dir/application.pid
start_file=$run_dir/application.start
lock_dir=$run_dir/.deploy.lock
log_file=$package_root/logs/startup.log
lock_acquired=no
config_work=
terminal_state=

cleanup() {
  if [ -n "$terminal_state" ]; then stty "$terminal_state" 2>/dev/null || :; fi
  if [ -n "$config_work" ]; then
    rm -f "$config_work/original" "$config_work/updates" "$config_work/updated"
    rmdir "$config_work" 2>/dev/null || :
  fi
  if [ "$lock_acquired" = yes ]; then
    rm -f "$lock_dir/owner"
    rmdir "$lock_dir" 2>/dev/null || :
  fi
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Match the recorded creation time and this package's absolute JAR path before
# treating a PID as ours. A recycled PID must never be stopped.
inspect_process() {
  app_pid=
  [ -r "$pid_file" ] && [ -r "$start_file" ] || return 1
  IFS= read -r app_pid < "$pid_file" || return 1
  case "$app_pid" in ''|*[!0-9]*|0|1) return 1 ;; esac
  IFS= read -r recorded_start < "$start_file" || return 1
  [ -n "$recorded_start" ] || return 1
  kill -0 "$app_pid" 2>/dev/null || return 1
  process_state=$(LC_ALL=C ps -p "$app_pid" -o stat= 2>/dev/null) || { kill -0 "$app_pid" 2>/dev/null && return 2; return 1; }
  case "$process_state" in *Z*) return 1 ;; esac
  current_start=$(LC_ALL=C ps -p "$app_pid" -o lstart= 2>/dev/null) || { kill -0 "$app_pid" 2>/dev/null && return 2; return 1; }
  [ "$current_start" = "$recorded_start" ] || return 1
  process_command=$(ps -ww -p "$app_pid" -o args= 2>/dev/null) || { kill -0 "$app_pid" 2>/dev/null && return 2; return 1; }
  case "$process_command" in
    *"-jar $jar_file"*) return 0 ;;
    *) return 1 ;;
  esac
}

acquire_lock() {
  [ "$lock_acquired" = yes ] && return 0
  mkdir -p "$run_dir" || fail "$(dv_msg '无法创建 run 目录。' 'Cannot create the run directory.')"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    owner=
    if [ -r "$lock_dir/owner" ]; then IFS= read -r owner < "$lock_dir/owner" || :; fi
    case "$owner" in
      ''|*[!0-9]*|0|1) fail "$(dv_msg '存在未完成的部署锁，请确认其他部署脚本已结束后再检查 run/.deploy.lock。' 'An incomplete deployment lock exists. Check that no other launcher is running, then inspect run/.deploy.lock.')" ;;
    esac
    if kill -0 "$owner" 2>/dev/null; then fail "$(dv_msg '其他部署操作正在执行，请稍后重试。' 'Another deployment operation is running. Try again later.')"; fi
    rm -f "$lock_dir/owner" || fail "$(dv_msg '无法清理已结束的部署锁。' 'Cannot remove the stale deployment lock.')"
    rmdir "$lock_dir" 2>/dev/null || fail "$(dv_msg '部署锁目录不是预期内容，请检查 run/.deploy.lock。' 'The deployment lock contains unexpected files. Inspect run/.deploy.lock.')"
    mkdir "$lock_dir" 2>/dev/null || fail "$(dv_msg '其他部署操作正在执行，请稍后重试。' 'Another deployment operation is running. Try again later.')"
  fi
  lock_acquired=yes
  printf '%s\n' "$$" > "$lock_dir/owner" || fail "$(dv_msg '无法记录部署锁。' 'Cannot record the deployment lock.')"
}

show_running() {
  printf "$(dv_msg '应用进程正在后台运行，PID：%s\n日志：%s\n' 'Application process is running in the background, PID: %s\nLog: %s\n')" "$app_pid" "$log_file"
}

stop_application() {
  printf "$(dv_msg '正在检查当前应用进程……\n' 'Checking the current application process...\n')"
  inspect_process
  inspection=$?
  case "$inspection" in
    1) printf "$(dv_msg '未发现此目录记录且身份匹配的运行中应用，无需停止。\n' 'No matching running application is recorded for this directory; nothing to stop.\n')"; return 0 ;;
    2) fail "$(dv_msg '无法验证应用进程，未执行停止或后续启动；请检查系统 ps 命令权限。' 'Cannot verify the application process; stop and restart were not performed. Check permission to run ps.')" ;;
  esac
  stop_pid=$app_pid
  printf "$(dv_msg '正在停止应用进程，PID：%s……\n' 'Stopping application process, PID: %s...\n')" "$stop_pid"
  kill -TERM "$stop_pid" || fail "$(dv_msg '无法向应用进程发送停止信号。' 'Cannot send the stop signal to the application process.')"
  printf "$(dv_msg '停止请求已发送，正在等待进程退出（最多 15 秒）……\n' 'Stop signal sent; waiting up to 15 seconds for exit...\n')"
  remaining=15
  while [ "$remaining" -gt 0 ]; do
    inspect_process
    inspection=$?
    case "$inspection" in
      1)
        rm -f "$pid_file" "$start_file"
        printf "$(dv_msg '应用进程已停止。\n' 'Application process stopped.\n')"
        return 0
        ;;
      2) fail "$(dv_msg '无法确认应用进程已退出，未继续启动；请查看 --status 和日志。' 'Cannot confirm that the process exited; startup was not continued. Check --status and the log.')" ;;
    esac
    sleep 1
    remaining=$((remaining - 1))
  done
  fail "$(dv_msg '已请求停止，进程仍在退出中；请稍后查看 --status 和日志，未强制终止。' 'The process is still stopping. Check --status and the log later; it was not forcibly terminated.')"
}

if [ "$mode" = status ]; then
  inspect_process
  inspection=$?
  case "$inspection" in
    0) show_running; exit 0 ;;
    1) printf "$(dv_msg '未发现此目录记录且身份匹配的运行中应用。\n' 'No matching running application is recorded for this directory.\n')"; exit 3 ;;
    2) fail "$(dv_msg '无法验证已记录的应用进程；为避免误报或操作其他进程，请检查系统 ps 命令权限。' 'Cannot verify the recorded process. Check permission to run ps.')" ;;
  esac
fi
if [ "$mode" = stop ] || [ "$mode" = restart ]; then
  umask 077
  acquire_lock
  stop_application
  [ "$mode" = stop ] && exit 0
  printf "$(dv_msg '停止步骤已完成，准备重新启动应用……\n' 'Stop completed; preparing to restart...\n')"
fi
if [ "$mode" = start ]; then
  inspect_process
  inspection=$?
  case "$inspection" in
    0) show_running; exit 0 ;;
    1) ;;
    2) fail "$(dv_msg '无法验证已记录的应用进程；为避免启动重复实例，请检查系统 ps 命令权限。' 'Cannot verify the recorded process; no duplicate instance was started. Check permission to run ps.')" ;;
  esac
fi

[ -f "$config_file" ] && [ -r "$config_file" ] || fail "$(dv_msg '缺少可读取的 config/application.yml，请从发布包恢复该文件。' 'config/application.yml is missing or unreadable. Restore it from the package.')"

# The shipped template has one non-comment line for each of these three keys.
# Match those lines only; do not infer YAML nesting or rebuild missing fields.
database_config() {
  awk -v action="$1" -v language="$DATAVISOOL_LANG" '
    function token(value, pattern) {
      return value ~ ("^(" pattern "|" quote "(" pattern ")" quote "|\"(" pattern ")\")[ \t]*(#.*)?$")
    }
    function missing(key, value) {
      value = tolower(value)
      if (value ~ /^([ \t]*|null|~)[ \t]*(#.*)?$/ || token(value, "[ \t]*")) return 1
      if (key == "username") return token(value, "change_me_database_user(name)?")
      return token(value, "change_me_database_password")
    }
    function database_name_missing(raw, value, first, name) {
      value = raw; sub(/[ \t]+#.*/, "", value); sub(/[ \t]+$/, "", value)
      first = substr(value, 1, 1)
      if ((first == quote || first == "\"") && substr(value, length(value), 1) == first) {
        value = substr(value, 2, length(value) - 2)
        if (first == quote) gsub(quote quote, quote, value)
      }
      if (value !~ /^jdbc:mysql:\/\/[^\/?# \t]+\/[^\/?# \t]*([?][^ \t]*)?$/ || tolower(value) ~ /^jdbc:mysql:\/\/mysql-host([:\/])/) {
        print (language == "en-US" ? "The URL must contain a valid MySQL host, port and connection format. Restore the template or fix the host; the launcher only fills in the database name." : "url 必须保留有效的 MySQL 主机、端口和连接格式；请恢复模板或修改主机地址，脚本只补齐数据库名。") > "/dev/stderr"
        invalid = 1
        return 0
      }
      database_url = value
      name = value; sub(/^jdbc:mysql:\/\/[^\/]+\//, "", name); sub(/\?.*$/, "", name)
      return name == "" || tolower(name) == "change_me_database_name"
    }
    BEGIN { quote = sprintf("%c", 39); split("url username password", keys, " ") }
    FILENAME == ARGV[1] {
      tab = index($0, "\t")
      replacements[substr($0, 1, tab - 1)] = substr($0, tab + 1)
      next
    }
    {
      line = $0; cr = ""; bom = ""
      if (sub(/\r$/, "", line)) cr = "\r"
      if (FNR == 1 && sub(/^\357\273\277/, "", line)) bom = "\357\273\277"
      if (match(line, /^[ \t]*(url|username|password)[ \t]*:[ \t]*/)) {
        prefix = substr(line, 1, RLENGTH)
        value = substr(line, RLENGTH + 1)
        key = prefix; sub(/^[ \t]*/, "", key); sub(/[ \t]*:.*/, "", key)
        counts[key]++; needed[key] = (key == "url" ? database_name_missing(value) : missing(key, value))
        if (action == "write" && key in replacements) {
          comment = ""
          if (match(value, /(^|[ \t]+)#/)) comment = " " substr(value, RSTART)
          updated = replacements[key]; gsub(quote, quote quote, updated)
          sub(/[ \t]*$/, "", prefix)
          line = prefix " " quote updated quote comment
        }
      }
      if (action == "write") printf "%s%s%s\n", bom, line, cr
    }
    END {
      for (i = 1; i <= 3; i++) {
        key = keys[i]
        if (counts[key] != 1) {
          printf (language == "en-US" ? "Configuration field %s must occur exactly once; found %d. Restore or remove duplicate fields.\n" : "配置项 %s 必须恰好有一行；当前 %d 行，请恢复缺失字段或移除重名字段。\n"), key, counts[key] > "/dev/stderr"
          invalid = 1
        }
      }
      if (invalid) exit 2
      if (action == "inspect") for (i = 1; i <= 3; i++) if (needed[keys[i]]) print keys[i]
      if (action == "url") print database_url
    }
  ' "${3:-/dev/null}" "$2"
}

make_absolute() {
  candidate=$1
  case "$candidate" in
    /*) printf '%s\n' "$candidate" ;;
    */*)
      candidate_dir=${candidate%/*}
      candidate_name=${candidate##*/}
      [ -n "$candidate_dir" ] || candidate_dir=.
      case "$candidate_dir" in
        -*) candidate_dir=./$candidate_dir ;;
      esac
      absolute_dir=$(CDPATH= cd -P "$candidate_dir" 2>/dev/null && pwd -P) || return 1
      printf '%s/%s\n' "$absolute_dir" "$candidate_name"
      ;;
    *) return 1 ;;
  esac
}

find_path_java() {
  search_path=${PATH:-/usr/bin:/bin}
  saved_ifs=$IFS
  case "$-" in *f*) had_noglob=yes ;; *) had_noglob=no ;; esac
  set -f
  IFS=:
  for search_dir in $search_path; do
    [ -n "$search_dir" ] || search_dir=.
    candidate=$search_dir/java
    if [ -f "$candidate" ] && [ -x "$candidate" ]; then
      resolved=$(make_absolute "$candidate") || resolved=
      if [ -n "$resolved" ]; then
        IFS=$saved_ifs
        [ "$had_noglob" = yes ] || set +f
        printf '%s\n' "$resolved"
        return 0
      fi
    fi
  done
  IFS=$saved_ifs
  [ "$had_noglob" = yes ] || set +f
  return 1
}

printf "$(dv_msg '正在检查 Java 17 和数据库配置……\n' 'Checking Java 17 and database configuration...\n')"
java_bin=
java_error=
if [ -n "${JAVA_HOME:-}" ]; then
  if [ ! -f "$JAVA_HOME/bin/java" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
    java_error="$(dv_msg "JAVA_HOME 已设置，但其中找不到可执行的 Java：$JAVA_HOME/bin/java。请将 JAVA_HOME 指向 Java 17。" "JAVA_HOME is set but Java is not executable at $JAVA_HOME/bin/java. Point JAVA_HOME to Java 17.")"
  else
    java_bin=$(make_absolute "$JAVA_HOME/bin/java") || java_error="$(dv_msg '无法解析 JAVA_HOME 中 Java 的绝对路径。' 'Cannot resolve the Java path in JAVA_HOME.')"
  fi
else
  java_bin=$(find_path_java) || java_bin=
  [ -n "$java_bin" ] || java_error="$(dv_msg '未找到 Java。请安装 Java 17，或设置 JAVA_HOME 指向 Java 17。' 'Java was not found. Install Java 17 or set JAVA_HOME.')"
fi

validate_java17() {
  [ -n "$java_bin" ] || return 1
  java_version_output=$("$java_bin" -version 2>&1)
  if [ "$?" -ne 0 ]; then java_error="$(dv_msg "无法读取 Java 版本：$java_version_output" "Cannot read the Java version: $java_version_output")"; return 1; fi
  java_major=$(printf '%s\n' "$java_version_output" | awk -F '"' '
    /version/ && NF >= 2 {
      version = $2
      if (version ~ /^1\./) sub(/^1\./, "", version)
      sub(/[^0-9].*$/, "", version)
      print version
      exit
    }
  ')
  if [ "$java_major" != 17 ]; then java_error="$(dv_msg "需要 Java 17；检测到的版本为 ${java_major:-无法识别}。" "Java 17 is required; detected major version: ${java_major:-unknown}.")"; return 1; fi
  return 0
}

while ! validate_java17; do
  [ "$mode" != check ] || fail "$java_error"
  [ -t 0 ] || fail "$(dv_msg "$java_error 当前没有交互终端，请设置 JAVA_HOME 后重试。" "$java_error No interactive terminal is available; set JAVA_HOME and try again.")"
  printf '%s\n' "$java_error" >&2
  printf "$(dv_msg 'JDK 17 安装目录（包含 bin/java，留空取消）：' 'JDK 17 installation directory (containing bin/java; leave blank to cancel): ')" >&2
  IFS= read -r jdk_home || fail "$(dv_msg '输入已取消，未启动应用。' 'Input cancelled; the application was not started.')"
  case "$jdk_home" in
    \"*\") jdk_home=${jdk_home#\"}; jdk_home=${jdk_home%\"} ;;
    \'*\') jdk_home=${jdk_home#\'}; jdk_home=${jdk_home%\'} ;;
  esac
  case "$jdk_home" in *[![:space:]]*) ;; *) fail "$(dv_msg '输入已取消，未启动应用。' 'Input cancelled; the application was not started.')" ;; esac
  java_bin=
  if [ -f "$jdk_home/bin/java" ] && [ -x "$jdk_home/bin/java" ]; then
    java_bin=$(make_absolute "$jdk_home/bin/java") || java_error="$(dv_msg '无法解析 JDK 安装目录，请重新输入。' 'Cannot resolve the JDK installation directory. Try again.')"
  else
    java_error="$(dv_msg "此目录中找不到可执行的 bin/java：$jdk_home，请重新输入 JDK 安装目录。" "No executable bin/java was found in $jdk_home. Enter another JDK directory.")"
  fi
done

missing_keys=$(database_config inspect "$config_file") || fail "$(dv_msg '请检查数据库配置行。' 'Check the database configuration entries.')"
if [ "$mode" = check ]; then
  if [ -n "$missing_keys" ]; then
    printf "$(dv_msg '缺少必要配置：\n' 'Required configuration is missing:\n')" >&2
    for key in $missing_keys; do
      if [ "$key" = url ]; then printf "$(dv_msg 'url（数据库名称）\n' 'url (database name)\n')" >&2; else printf '%s\n' "$key" >&2; fi
    done
    fail "$(dv_msg '请不带参数运行脚本交互补齐，或手动编辑 config/application.yml。' 'Run the script without arguments to complete the configuration, or edit config/application.yml.')"
  fi
  printf "$(dv_msg '检查通过：配置已填写，Java 17 可用。检查模式：未启动应用，未测试数据库连接。\n' 'Checks passed: configuration is filled in and Java 17 is available. The application was not started and the database connection was not tested.\n')"
  exit 0
fi

umask 077
acquire_lock
inspect_process
inspection=$?
case "$inspection" in
  0) show_running; exit 0 ;;
  1) ;;
  2) fail "$(dv_msg '无法验证已记录的应用进程；为避免启动重复实例，请检查系统 ps 命令权限。' 'Cannot verify the recorded process; no duplicate instance was started. Check permission to run ps.')" ;;
esac
# Another launcher may have updated the configuration before this lock was acquired.
missing_keys=$(database_config inspect "$config_file") || fail "$(dv_msg '请检查数据库配置行。' 'Check the database configuration entries.')"

ask_value() {
  key=$1
  while :; do
    case "$key" in
      url) printf "$(dv_msg 'MySQL 数据库名称（例如 datavisool_server02）：' 'MySQL database name (for example datavisool_server02): ')" >&2 ;;
      username) printf "$(dv_msg 'MySQL 用户名：' 'MySQL username: ')" >&2 ;;
      password)
        terminal_state=$(stty -g) || fail "$(dv_msg '无法设置密码输入终端。' 'Cannot configure the password input terminal.')"
        stty -echo || fail "$(dv_msg '无法关闭密码回显。' 'Cannot disable password echo.')"
        printf "$(dv_msg 'MySQL 密码（输入不显示）：' 'MySQL password (input hidden): ')" >&2
        ;;
      *) fail "$(dv_msg '发现未知的必要配置项。' 'Unknown required configuration entry.')" ;;
    esac
    answer=
    IFS= read -r answer
    read_status=$?
    if [ -n "$terminal_state" ]; then
      stty "$terminal_state" || fail "$(dv_msg '无法恢复终端输入状态。' 'Cannot restore the terminal input state.')"
      terminal_state=
      printf '\n' >&2
    fi
    [ "$read_status" -eq 0 ] || fail "$(dv_msg '输入已取消，配置未保存。' 'Input cancelled; configuration was not saved.')"
    case "$answer" in
      *[![:space:]]*) ;;
      *) printf "$(dv_msg '该项不能为空，请重新输入。\n' 'This value cannot be empty. Try again.\n')" >&2; continue ;;
    esac
    carriage_return=$(printf '\r')
    case "$answer" in *"$carriage_return"*) printf "$(dv_msg '请输入单行内容。\n' 'Enter a single-line value.\n')" >&2; continue ;; esac
    if [ "$key" = url ]; then
      case "$answer" in
        *[!a-zA-Z0-9_-]*) printf "$(dv_msg '只需输入数据库名称，支持字母、数字、下划线和短横线。\n' 'Enter only the database name using letters, digits, underscores or hyphens.\n')" >&2; continue ;;
      esac
      [ "${#answer}" -le 64 ] || { printf "$(dv_msg '数据库名称不能超过 64 个字符。\n' 'The database name must not exceed 64 characters.\n')" >&2; continue; }
      database_name_lower=$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')
      [ "$database_name_lower" != change_me_database_name ] || { printf "$(dv_msg '请替换模板中的数据库名称。\n' 'Replace the database name placeholder.\n')" >&2; continue; }
      answer=$database_url_prefix$answer$database_url_suffix
    fi
    case "$key:$answer" in
      password:CHANGE_ME_DATABASE_PASSWORD|username:CHANGE_ME_DATABASE_USER)
        printf "$(dv_msg '请替换模板占位值。\n' 'Replace the template placeholder.\n')" >&2; continue ;;
    esac
    printf '%s\t%s\n' "$key" "$answer" >> "$config_work/updates" || fail "$(dv_msg '无法保存输入内容。' 'Cannot save the entered values.')"
    answer=
    return 0
  done
}

if [ -n "$missing_keys" ]; then
  [ -t 0 ] || fail "$(dv_msg '缺少必要数据库配置；请在交互终端运行脚本补齐，或先编辑 config/application.yml。' 'Database settings are missing. Run interactively or edit config/application.yml first.')"
  [ ! -L "$config_file" ] || fail "$(dv_msg '配置文件是符号链接，请直接编辑其目标文件后重新运行。' 'The configuration is a symbolic link. Edit its target directly and retry.')"
  config_work=$(mktemp -d "$package_root/config/.deploy-config.XXXXXX") || fail "$(dv_msg '配置目录不可写。' 'The configuration directory is not writable.')"
  cat "$config_file" > "$config_work/original" || fail "$(dv_msg '无法备份现有配置。' 'Cannot back up the existing configuration.')"
  : > "$config_work/updates" || fail "$(dv_msg '无法准备配置写入。' 'Cannot prepare the configuration update.')"
  database_url=$(database_config url "$config_work/original") || fail "$(dv_msg '无法读取数据库连接模板。' 'Cannot read the database connection template.')"
  url_without_query=${database_url%%\?*}
  database_url_prefix=${url_without_query%/*}/
  database_url_suffix=
  case "$database_url" in *\?*) database_url_suffix="?${database_url#*\?}" ;; esac
  for key in $missing_keys; do ask_value "$key"; done
  database_config write "$config_work/original" "$config_work/updates" > "$config_work/updated" || fail "$(dv_msg '配置生成失败，原文件未修改。' 'Failed to generate configuration; the original file was not changed.')"
  remaining_keys=$(database_config inspect "$config_work/updated") || fail "$(dv_msg '新配置校验失败，原文件未修改。' 'The new configuration failed validation; the original file was not changed.')"
  [ -z "$remaining_keys" ] || fail "$(dv_msg '新配置仍缺少必要值，原文件未修改。' 'Required values are still missing; the original configuration was not changed.')"
  cmp -s "$config_work/original" "$config_file" || fail "$(dv_msg '配置文件已被其他程序修改，已停止保存，请重新运行。' 'The configuration was changed by another process. No changes were saved; retry.')"
  backup_file=$config_file.bak.$(date +%Y%m%d%H%M%S).$$
  [ ! -e "$backup_file" ] || fail "$(dv_msg '配置备份文件已存在，未覆盖。' 'The configuration backup already exists and was not overwritten.')"
  mv "$config_work/original" "$backup_file" || fail "$(dv_msg '备份配置失败，原文件未修改。' 'Configuration backup failed; the original was not changed.')"
  mv "$config_work/updated" "$config_file" || fail "$(dv_msg "配置替换失败，备份保存在 $backup_file。" "Configuration replacement failed. The backup is at $backup_file.")"
  printf "$(dv_msg '已补齐配置，原配置备份：%s\n' 'Configuration completed. Original backup: %s\n')" "$backup_file"
fi

mkdir -p "$package_root/logs" || fail "$(dv_msg '无法创建日志目录。' 'Cannot create the log directory.')"
cd -P "$package_root" || fail "$(dv_msg '无法切换到解压目录。' 'Cannot change to the package directory.')"
command -v nohup >/dev/null 2>&1 || fail "$(dv_msg '未找到系统 nohup 命令，无法在后台运行。' 'nohup was not found; the application cannot run in the background.')"
command -v curl >/dev/null 2>&1 || fail "$(dv_msg '启动检查需要 curl，请安装后重试。' 'curl is required for startup checks. Install it and retry.')"
touch "$log_file" || fail "$(dv_msg '无法写入启动日志。' 'Cannot write the startup log.')"
prompt_admin_password() {
  [ -t 0 ] || fail "$(dv_msg '首次初始化需要管理员密码；请在交互终端启动，或设置 DATAVISOOL_ADMIN_PASSWORD。' 'Initial setup requires an administrator password. Start interactively or set DATAVISOOL_ADMIN_PASSWORD.')"
  terminal_state=$(stty -g) || fail "$(dv_msg '无法设置密码输入终端。' 'Cannot configure the password input terminal.')"
  stty -echo || fail "$(dv_msg '无法关闭密码回显。' 'Cannot disable password echo.')"
  printf "$(dv_msg '首次初始化数据库，请设置管理员密码（至少 8 个字符、最多 72 字节，留空取消）：' 'Initial database setup: enter an administrator password (at least 8 characters, at most 72 bytes; blank cancels): ')" >&2
  DATAVISOOL_ADMIN_PASSWORD=
  IFS= read -r DATAVISOOL_ADMIN_PASSWORD
  read_status=$?
  stty "$terminal_state" || fail "$(dv_msg '无法恢复终端输入状态。' 'Cannot restore the terminal input state.')"
  terminal_state=
  printf '\n' >&2
  [ "$read_status" -eq 0 ] && [ -n "$DATAVISOOL_ADMIN_PASSWORD" ] || fail "$(dv_msg '输入已取消，未启动应用。' 'Input cancelled; the application was not started.')"
  export DATAVISOOL_ADMIN_PASSWORD
}

while :; do
  log_offset=$(wc -c < "$log_file" | tr -d '[:space:]') || fail "$(dv_msg '无法读取启动日志。' 'Cannot read the startup log.')"
  log_offset=$((log_offset + 1))
  printf "$(dv_msg '正在后台启动应用并等待就绪（最多 120 秒）……\n日志：%s\n' 'Starting in the background and waiting for readiness (up to 120 seconds)...\nLog: %s\n')" "$log_file"
  # The temporary administrator password is inherited by this child only.
  nohup "$java_bin" -jar "$jar_file" --spring.config.location=./config/application.yml </dev/null >> "$log_file" 2>&1 &
  new_pid=$!
  unset DATAVISOOL_ADMIN_PASSWORD
  new_recorded=no
  new_start=$(LC_ALL=C ps -p "$new_pid" -o lstart= 2>/dev/null)
  if [ -n "$new_start" ]; then
    if ! printf '%s\n' "$new_start" > "$start_file" || ! printf '%s\n' "$new_pid" > "$pid_file"; then
      kill -TERM "$new_pid" 2>/dev/null || :
      rm -f "$pid_file" "$start_file"
      fail "$(dv_msg '无法记录应用进程，已请求停止本次启动的进程。' 'Cannot record the application process; a stop was requested.')"
    fi
    new_recorded=yes
  elif kill -0 "$new_pid" 2>/dev/null; then
    kill -TERM "$new_pid" 2>/dev/null || :
    fail "$(dv_msg '无法读取新进程的启动时间，已请求停止本次启动的进程；请检查系统 ps 命令权限。' 'Cannot read the new process start time; a stop was requested. Check permission to run ps.')"
  fi
  deadline=$(($(date +%s) + 120))
  ready=no
  restart_for_admin=no
  while [ "$(date +%s)" -lt "$deadline" ]; do
    current_log=$(tail -c "+$log_offset" "$log_file" 2>/dev/null) || fail "$(dv_msg '无法读取启动日志。' 'Cannot read the startup log.')"
    if ! kill -0 "$new_pid" 2>/dev/null; then
      wait "$new_pid" 2>/dev/null || :
      current_log=$(tail -c "+$log_offset" "$log_file" 2>/dev/null) || fail "$(dv_msg '无法读取启动日志。' 'Cannot read the startup log.')"
      if [ "$new_recorded" = yes ]; then rm -f "$pid_file" "$start_file"; fi
      unavailable_port=$(printf '%s\n' "$current_log" | LC_ALL=C sed -n 's/.*DATAVISOOL_PORT_UNAVAILABLE port=\([0-9][0-9]*\).*/\1/p' | head -n 1)
      if [ -n "$unavailable_port" ]; then
        fail "$(dv_msg "端口 $unavailable_port 无法绑定，可能已被占用或监听地址不可用；请检查配置和日志：$log_file" "Port $unavailable_port cannot be bound; it may be occupied or the listen address unavailable. Check the configuration and log: $log_file")"
      fi
      if printf '%s\n' "$current_log" | LC_ALL=C grep -q 'IllegalStateException:.*DATAVISOOL_ADMIN_PASSWORD'; then
        prompt_admin_password
        restart_for_admin=yes
        break
      fi
      fail "$(dv_msg "应用启动失败，请查看日志：$log_file" "Application startup failed. Check the log: $log_file")"
    fi
    if printf '%s\n' "$current_log" | grep -Fq 'Started DatavisoolServerApplication in '; then
      port=$(printf '%s\n' "$current_log" | sed -n 's/.*Tomcat started on port \([0-9][0-9]*\) (http).*/\1/p' | tail -n 1)
      context=$(printf '%s\n' "$current_log" | sed -n "s/.*Tomcat started on port [0-9][0-9]* (http) with context path '\(.*\)'.*/\1/p" | tail -n 1)
      [ "$context" != / ] || context=
      if [ -n "$port" ] && [ "$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$port$context/api/security/getEncryptKey" 2>/dev/null)" = 200 ] && [ "$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$port$context/index.html" 2>/dev/null)" = 200 ] && kill -0 "$new_pid" 2>/dev/null; then
        ready=yes
        break
      fi
    fi
    sleep 1
  done
  [ "$restart_for_admin" = yes ] && continue
  break
done
[ "$new_recorded" = yes ] || fail "$(dv_msg "应用进程未能记录，请查看日志：$log_file" "The application process could not be recorded. Check the log: $log_file")"
if ! inspect_process; then
  kill -TERM "$new_pid" 2>/dev/null || :
  rm -f "$pid_file" "$start_file"
  fail "$(dv_msg "应用进程未通过存活检查，请查看日志：$log_file" "The application did not pass its process check. Check the log: $log_file")"
fi
show_running
[ "$ready" = yes ] || fail "$(dv_msg "等待应用就绪超时；进程仍在运行，请查看日志：$log_file，或使用 --status / --stop。" "Timed out waiting for readiness. The process is still running; check $log_file or use --status / --stop.")"
printf "$(dv_msg '应用已就绪，可访问 http://localhost:%s%s/。可以关闭当前窗口。\n' 'Application is ready at http://localhost:%s%s/. You may close this window.\n')" "$port" "$context"
