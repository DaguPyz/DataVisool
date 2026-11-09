#!/bin/sh
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.

# The deployed runtime uses only POSIX tools and Docker Compose. Never source .env.
case "${DATAVISOOL_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in
  [Ee][Nn]*) DATAVISOOL_LANG=en-US ;;
  *) DATAVISOOL_LANG=zh-CN ;;
esac
export DATAVISOOL_LANG
dv_msg() { if [ "$DATAVISOOL_LANG" = en-US ]; then command printf '%s' "$2"; else command printf '%s' "$1"; fi; }

fail() { printf "$(dv_msg '错误：%s\n' 'Error: %s\n')" "$1" >&2; exit 1; }
usage() {
  if [ "$DATAVISOOL_LANG" = en-US ]; then
    cat <<'EOF'
Docker app (application with an existing MySQL database)
Usage: deploy_linux.sh [--check|--status|--stop|--restart|--logs|--help]
       deploy_linux.sh [--restart] [--wait-timeout SECONDS]
Without options, configure missing database settings and start the local image.
--check is read-only; --status, --stop and --logs manage the existing instance.
--restart stops the existing instance before starting it again.
The health check waits up to 300 seconds by default. Local Docker and Compose v2.20+ are required.
Resources and logs remain in resource/ and logs/ when stopped.
This launcher does not create databases, upgrade the deployment, or make backups.
EOF
    return
  fi
  cat <<'EOF'
Docker app 一键部署（应用连接已有 MySQL）
用法：deploy_linux.sh [--check|--status|--stop|--restart|--logs|--help]
      deploy_linux.sh [--restart] [--wait-timeout 秒数]
无参数：补齐 .env 中缺失的数据库配置，导入本地镜像并后台启动。
--check：只读检查，不询问、不创建文件、不导入镜像、不启动。
--status / --stop / --logs：查看状态、停止、跟随日志，不要求数据库配置完整。
--restart：停止成功后按当前配置重新启动；未运行时直接启动。
默认等待健康检查 300 秒。需要本机 Linux Docker 引擎及 Compose v2.20+。
资源和日志持久化在当前固定部署目录的 resource/、logs/；停止保留数据。
本入口暂不提供升级、备份或数据库创建功能。
EOF
}

mode=start
wait_timeout=300
wait_set=no
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      [ "$#" -eq 1 ] && [ "$mode" = start ] && [ "$wait_set" = no ] || fail "$(dv_msg '--help 不能与其他参数同时指定。' '--help cannot be combined with other arguments.')"
      usage; exit 0 ;;
    --check|--status|--stop|--restart|--logs)
      [ "$mode" = start ] || fail "$(dv_msg '操作参数只能指定一次。' 'Specify only one operation.')"
      mode=${1#--} ;;
    --wait-timeout)
      [ "$wait_set" = no ] && [ "$#" -gt 1 ] || fail "$(dv_msg '--wait-timeout 需要一个正整数。' '--wait-timeout requires a positive integer.')"
      shift
      case "$1" in ''|*[!0-9]*|0|0*) fail "$(dv_msg '--wait-timeout 需要一个正整数。' '--wait-timeout requires a positive integer.')" ;; esac
      [ "${#1}" -le 6 ] || fail "$(dv_msg '等待时间过大。' 'The wait time is too large.')"
      wait_timeout=$1; wait_set=yes ;;
    *) fail "$(dv_msg "不支持的参数：$1。运行 --help 查看用法。" "Unsupported argument: $1. Run --help for usage.")" ;;
  esac
  shift
done
if [ "$wait_set" = yes ]; then
  case "$mode" in start|restart) ;; *) fail "$(dv_msg '--wait-timeout 仅用于启动或重启。' '--wait-timeout is only available for start or restart.')" ;; esac
fi

helper_path=$0
case "$helper_path" in */*) ;; *) helper_path=$(command -v "$helper_path") || exit 1 ;; esac
helper_dir=${helper_path%/*}
case "$helper_dir" in -*) helper_dir=./$helper_dir ;; esac
package_root=$(CDPATH= cd -P "$helper_dir/.." 2>/dev/null && pwd -P) || fail "$(dv_msg '无法定位发布目录。' 'Cannot locate the deployment directory.')"
assets=$package_root/docker-app
env_file=$package_root/.env
env_source=$env_file
if [ ! -f "$env_file" ]; then env_source=$assets/.env.example; fi
run_dir=$package_root/run
marker=$package_root/.datavisool-deployment
lock_dir=$run_dir/.docker-launch.lock
lock_acquired=no
run_dir_created=no
terminal_state=
work_dir=
lock_tombstone_path() {
  tombstone_index=0
  while [ "$tombstone_index" -lt 100 ]; do
    tombstone_candidate=$run_dir/.docker-launch-reclaim.$$.${tombstone_index}
    if [ ! -e "$tombstone_candidate" ] && [ ! -L "$tombstone_candidate" ]; then
      printf '%s\n' "$tombstone_candidate"
      return 0
    fi
    tombstone_index=$((tombstone_index + 1))
  done
  return 1
}
remove_lock_tombstone() {
  rm -f "$1/owner"
  rmdir "$1/reaper" 2>/dev/null || :
  rmdir "$1" 2>/dev/null || :
}
release_lock() {
  [ "$lock_acquired" = yes ] || return 0
  if ! mkdir "$lock_dir/reaper" 2>/dev/null; then
    # A contender may be checking this live owner. Leave it intact; after this
    # process exits, the next invocation can reclaim it as a stale lock.
    lock_acquired=no
    return 0
  fi
  release_owner=$(cat "$lock_dir/owner" 2>/dev/null)
  if [ "$release_owner" != "$$" ]; then
    rmdir "$lock_dir/reaper" 2>/dev/null || :
    lock_acquired=no
    return 0
  fi
  release_tombstone=$(lock_tombstone_path) || {
    rmdir "$lock_dir/reaper" 2>/dev/null || :
    lock_acquired=no
    return 0
  }
  if mv "$lock_dir" "$release_tombstone" 2>/dev/null; then
    lock_acquired=no
    remove_lock_tombstone "$release_tombstone"
  else
    rmdir "$lock_dir/reaper" 2>/dev/null || :
    lock_acquired=no
  fi
}
cleanup() {
  if [ -n "$terminal_state" ]; then stty "$terminal_state" 2>/dev/null || :; fi
  if [ -n "$work_dir" ]; then
    rm -f "$work_dir/env" "$work_dir/updates" "$work_dir/original"
    rmdir "$work_dir" 2>/dev/null || :
  fi
  release_lock
  if [ "$run_dir_created" = yes ]; then rmdir "$run_dir" 2>/dev/null || :; fi
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

[ ! -f "$package_root/server.jar" ] && [ ! -d "$package_root/docker-allinone" ] || fail "$(dv_msg '发布目录混有其他部署类型，请使用独立目录。' 'The directory contains another deployment type. Use a separate directory.')"
for asset in IMAGE PLATFORM docker-compose.yml .env.example; do
  [ -f "$assets/$asset" ] && [ -r "$assets/$asset" ] || fail "$(dv_msg "Docker app 包缺少可读取的 docker-app/$asset。" "The Docker app package is missing a readable docker-app/$asset.")"
done
expected_image=$(cat "$assets/IMAGE")
expected_platform=$(cat "$assets/PLATFORM")
case "$expected_image" in ''|*[!a-zA-Z0-9./:_-]*|*:latest) fail "$(dv_msg '包内 IMAGE 不是有效的固定版本镜像。' 'The package IMAGE must be a valid, fixed-version image.')" ;; esac
case "$expected_image" in *:*) ;; *) fail "$(dv_msg '包内 IMAGE 缺少固定版本标签。' 'The package IMAGE is missing a fixed version tag.')" ;; esac
case "$expected_platform" in linux/amd64|linux/arm64) ;; *) fail "$(dv_msg '包内 PLATFORM 无效。' 'The package PLATFORM is invalid.')" ;; esac

# Pin the executable before reading .env names: a declared PATH must not affect
# either Docker lookup or the env command used below.
docker_bin=$(command -v docker) || fail "$(dv_msg '未找到 Docker，请安装 Docker 并加入 PATH。' 'Docker was not found. Install Docker and add it to PATH.')"
case "$docker_bin" in /*) ;; */*) docker_bin=$PWD/$docker_bin ;; *) fail "$(dv_msg '无法安全定位 Docker 可执行文件。' 'Cannot safely resolve the Docker executable.')" ;; esac
env_bin=$(command -v env) || fail "$(dv_msg '未找到 env 命令。' 'The env command was not found.')"
case "$env_bin" in /*) ;; */*) env_bin=$PWD/$env_bin ;; *) fail "$(dv_msg '无法安全定位 env 命令。' 'Cannot safely resolve the env executable.')" ;; esac

# Remove deployment values only from each Docker child process. Parse key names
# as data; never source .env or pass its values through shell code.
docker_cli() (
  env_names=
  if [ -r "$env_source" ]; then
    env_names=$(LC_ALL=C awk '
      function dotenv_key(line, key, rest) {
        sub(/^[ \t]*/, "", line); sub(/^export[ \t]+/, "", line)
        if(match(line, /^[A-Za-z_][A-Za-z0-9_]*/)) {
          key=substr(line, RSTART, RLENGTH); rest=substr(line, RLENGTH+1)
          if(rest ~ /^[ \t]*=/ || rest ~ /^[ \t]*$/ || rest ~ /^[ \t]+#/) return key
        }
        return ""
      }
      {line=$0; sub(/\r$/, "", line); if(NR==1) sub(/^\357\273\277/, "", line)
       key=dotenv_key(line); if(key!="") print key
      }
    ' "$env_source") || return 1
  fi
  set -f
  set -- "$docker_bin" "$@"
  newline=$(printf '\nx')
  IFS=${newline%x}
  for env_name in $env_names; do
    set -- -u "$env_name" "$@"
  done
  IFS=' '
  for env_name in DATAVISOOL_LANG DATAVISOOL_IMAGE DATAVISOOL_PROJECT_NAME APP_BIND_ADDRESS APP_PORT APP_UID APP_GID \
    DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD JAVA_TOOL_OPTIONS TZ \
    COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES \
    COMPOSE_DISABLE_ENV_FILE COMPOSE_PATH_SEPARATOR COMPOSE_CONVERT_WINDOWS_PATHS \
    COMPOSE_REMOVE_ORPHANS COMPOSE_IGNORE_ORPHANS COMPOSE_BAKE COMPOSE_MENU; do
    set -- -u "$env_name" "$@"
  done
  exec "$env_bin" "$@"
)
env_file_has_reserved_docker_key() {
  LC_ALL=C awk '
    function dotenv_key(line, key, rest) {
      sub(/^[ \t]*/, "", line); sub(/^export[ \t]+/, "", line)
      if(match(line, /^[A-Za-z_][A-Za-z0-9_]*/)) {
        key=substr(line, RSTART, RLENGTH); rest=substr(line, RLENGTH+1)
        if(rest ~ /^[ \t]*=/ || rest ~ /^[ \t]*$/ || rest ~ /^[ \t]+#/) return key
      }
      return ""
    }
    {line=$0; sub(/\r$/, "", line); if(NR==1) sub(/^\357\273\277/, "", line)
     key=dotenv_key(line)
     if(key ~ /^DOCKER_/ || key=="HOME" || key=="USERPROFILE" || key=="HOMEDRIVE" || key=="HOMEPATH") found=1
    }
    END {exit !found}
  ' "$env_source" 2>/dev/null
}
# Docker Desktop can expose the same socket through different local paths.
# Accept aliases only when both paths resolve to the very same Unix socket.
same_docker_endpoint() (
  [ "$1" = "$2" ] && exit 0
  case "$1" in unix:///*) saved_socket=${1#unix://} ;; *) exit 1 ;; esac
  case "$2" in unix:///*) current_socket=${2#unix://} ;; *) exit 1 ;; esac
  [ -S "$saved_socket" ] && [ -S "$current_socket" ] && [ "$saved_socket" -ef "$current_socket" ]
)
assert_docker_endpoint() {
  if ! same_docker_endpoint "$1" "$docker_endpoint"; then
    printf "$(dv_msg '原 Docker 地址：%s\n当前 Docker 地址：%s\n' 'Original Docker endpoint: %s\nCurrent Docker endpoint: %s\n')" "$1" "$docker_endpoint" >&2
    fail "$(dv_msg 'Docker context 已改变，请切回本实例原来使用的本机引擎。' 'The Docker context changed. Switch back to the local engine originally used by this instance.')"
  fi
}
printf "$(dv_msg '正在检查 Docker app 部署环境……\n' 'Checking the Docker app deployment environment...\n')"
if env_file_has_reserved_docker_key; then
  fail "$(dv_msg '.env 不能声明 DOCKER_*、HOME、USERPROFILE、HOMEDRIVE 或 HOMEPATH；这些变量控制 Docker 连接或配置目录，请在启动环境中设置。' '.env must not declare DOCKER_*, HOME, USERPROFILE, HOMEDRIVE or HOMEPATH. Set Docker connection and configuration variables in the launch environment.')"
fi
if [ -n "${DOCKER_HOST-}" ] && [ -z "${DOCKER_CONTEXT-}" ]; then
  docker_endpoint=$DOCKER_HOST
else
  if [ -n "${DOCKER_CONTEXT-}" ]; then
    docker_endpoint=$(docker_cli context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}' 2>/dev/null) || fail "$(dv_msg '无法读取 Docker context。' 'Cannot read the Docker context.')"
  else
    docker_endpoint=$(docker_cli context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null) || fail "$(dv_msg '无法读取 Docker context。' 'Cannot read the Docker context.')"
  fi
fi
case "$docker_endpoint" in unix://*|npipe://*) ;; *) fail "$(dv_msg '仅支持本机 Docker 引擎，请切换到本机 Docker context。' 'Only a local Docker engine is supported. Switch to a local Docker context.')" ;; esac
engine_os=$(docker_cli info --format '{{.OSType}}' 2>/dev/null) || fail "$(dv_msg '无法连接 Docker 引擎，请先启动 Docker 并检查访问权限。' 'Cannot connect to the Docker engine. Start Docker and check permissions.')"
[ "$engine_os" = linux ] || fail "$(dv_msg '需要 Linux 容器引擎；Windows 请切换到 Linux containers。' 'A Linux container engine is required. On Windows, switch to Linux containers.')"

project=
if [ -e "$marker" ]; then
  [ "$(cat "$marker" 2>/dev/null)" = docker-app-launcher-v1 ] || fail "$(dv_msg '该目录已属于其他部署类型。' 'This directory belongs to a different deployment type.')"
fi
if [ -f "$run_dir/project.name" ]; then
  [ -f "$marker" ] || fail "$(dv_msg '部署身份记录缺少 .datavisool-deployment，请检查原部署目录。' 'The deployment identity marker .datavisool-deployment is missing. Check the original deployment directory.')"
  [ "$(cat "$run_dir/deployment.root" 2>/dev/null)" = "$package_root" ] || fail "$(dv_msg '部署目录已移动或记录不匹配，请使用原固定部署目录。' 'The deployment directory moved or does not match its record. Use the original directory.')"
  assert_docker_endpoint "$(cat "$run_dir/docker.endpoint" 2>/dev/null)"
  project=$(cat "$run_dir/project.name")
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail "$(dv_msg '部署项目名记录无效。' 'The recorded deployment project name is invalid.')" ;; esac
fi

acquire_lock() {
  [ "$lock_acquired" = no ] || return 0
  umask 077
  if [ ! -d "$run_dir" ]; then run_dir_created=yes; fi
  mkdir -p "$run_dir" || fail "$(dv_msg '无法创建 run 目录。' 'Cannot create the run directory.')"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    mkdir "$lock_dir/reaper" 2>/dev/null || fail "$(dv_msg '存在其他部署操作或未完成的部署锁，请稍后重试。' 'Another deployment operation or incomplete lock exists. Try again later.')"
    owner=$(cat "$lock_dir/owner" 2>/dev/null)
    case "$owner" in ''|*[!0-9]*|0|1) rmdir "$lock_dir/reaper" 2>/dev/null || :; fail "$(dv_msg '存在未完成的部署锁，请确认其他部署操作已结束。' 'An incomplete deployment lock exists. Check that other deployment operations have finished.')" ;; esac
    if kill -0 "$owner" 2>/dev/null; then
      rmdir "$lock_dir/reaper" 2>/dev/null || :
      fail "$(dv_msg '其他部署操作正在执行，请稍后重试。' 'Another deployment operation is running. Try again later.')"
    fi
    stale_lock=$(lock_tombstone_path) || { rmdir "$lock_dir/reaper" 2>/dev/null || :; fail "$(dv_msg '无法安全清理旧部署锁。' 'Cannot safely clean up the stale deployment lock.')"; }
    mv "$lock_dir" "$stale_lock" 2>/dev/null || { rmdir "$lock_dir/reaper" 2>/dev/null || :; fail "$(dv_msg '无法安全清理旧部署锁。' 'Cannot safely clean up the stale deployment lock.')"; }
    if ! mkdir "$lock_dir" 2>/dev/null; then remove_lock_tombstone "$stale_lock"; fail "$(dv_msg '其他部署操作正在执行，请稍后重试。' 'Another deployment operation is running. Try again later.')"; fi
    lock_acquired=yes
    printf '%s\n' "$$" > "$lock_dir/owner" || fail "$(dv_msg '无法记录部署锁。' 'Cannot record the deployment lock.')"
    remove_lock_tombstone "$stale_lock"
    return 0
  fi
  lock_acquired=yes
  printf '%s\n' "$$" > "$lock_dir/owner" || fail "$(dv_msg '无法记录部署锁。' 'Cannot record the deployment lock.')"
}

inspect_field() { docker_cli inspect --format "$1" "$container_id" 2>/dev/null; }
find_container() {
  container_id=
  [ -n "$project" ] || return 1
  found_ids=$(docker_cli ps --all --quiet --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app') || fail "$(dv_msg '无法查询容器状态。' 'Cannot query container status.')"
  [ -n "$found_ids" ] || return 1
  # The service is intentionally single-instance; never choose an arbitrary container.
  case "$found_ids" in *[!a-fA-F0-9]*) fail "$(dv_msg '发现多个容器或无效容器 ID，请检查当前项目。' 'Multiple containers or an invalid container ID were found. Check the current project.')" ;; esac
  container_id=$found_ids
  recorded_project=$(inspect_field '{{ index .Config.Labels "com.docker.compose.project" }}') || fail "$(dv_msg '无法验证容器身份。' 'Cannot verify the container identity.')"
  recorded_service=$(inspect_field '{{ index .Config.Labels "com.docker.compose.service" }}') || fail "$(dv_msg '无法验证容器身份。' 'Cannot verify the container identity.')"
  recorded_root=$(inspect_field '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}') || fail "$(dv_msg '无法验证容器身份。' 'Cannot verify the container identity.')"
  [ "$recorded_project" = "$project" ] && [ "$recorded_service" = app ] && [ "$recorded_root" = "$package_root" ] || fail "$(dv_msg '容器归属与当前部署目录不一致，未执行操作。' 'The container does not belong to this deployment directory; no action was taken.')"
  container_image=$(inspect_field '{{.Config.Image}}') || fail "$(dv_msg '无法验证容器镜像。' 'Cannot verify the container image.')"
  [ "$container_image" = "$expected_image" ] || fail "$(dv_msg '当前容器使用其他版本镜像；本入口暂不提供升级，请使用原部署包管理。' 'The container uses another image version. Upgrades are not supported here; use its original package.')"
  container_status=$(inspect_field '{{.State.Status}}') || fail "$(dv_msg '无法读取容器状态。' 'Cannot read container status.')"
  container_health=$(inspect_field '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}') || fail "$(dv_msg '无法读取容器健康状态。' 'Cannot read container health.')"
  container_ports=$(inspect_field '{{range (index .NetworkSettings.Ports "8080/tcp")}}{{.HostIp}}:{{.HostPort}} {{end}}') || fail "$(dv_msg '无法读取容器端口。' 'Cannot read container ports.')"
}
show_status() {
  printf "$(dv_msg '容器 ID：%s\n状态：%s\n健康状态：%s\n' 'Container ID: %s\nStatus: %s\nHealth: %s\n')" "$container_id" "$container_status" "$container_health"
  if [ -n "$container_ports" ]; then printf "$(dv_msg '端口：%s\n' 'Port: %s\n')" "$container_ports"; fi
}
stop_application() {
  printf "$(dv_msg '正在检查当前目录的应用容器……\n' 'Checking the application container for this directory...\n')"
  if ! find_container; then printf "$(dv_msg '当前目录没有已记录的应用容器，无需停止。\n' 'No application container is recorded for this directory; nothing to stop.\n')"; return 0; fi
  case "$container_status" in exited|created|dead) printf "$(dv_msg '应用容器已停止。\n' 'Application container stopped.\n')"; return 0 ;; esac
  printf "$(dv_msg '正在停止应用容器 %s（最多等待 60 秒）……\n' 'Stopping application container %s (waiting up to 60 seconds)...\n')" "$container_id"
  docker_cli stop --time 60 "$container_id" || fail "$(dv_msg '停止应用容器失败，未继续启动。' 'Failed to stop the application container; startup was not continued.')"
  if find_container; then
    case "$container_status" in exited|created|dead) ;; *) fail "$(dv_msg '应用容器仍在运行，未继续启动。' 'The application container is still running; startup was not continued.')" ;; esac
  fi
  printf "$(dv_msg '应用容器已停止，资源、日志及配置已保留。\n' 'Application container stopped; resources, logs and configuration were retained.\n')"
}

case "$mode" in
  status)
    if find_container; then show_status; [ "$container_status" = running ] && exit 0; exit 3; fi
    printf "$(dv_msg '当前目录没有已记录的应用容器。\n' 'No application container is recorded for this directory.\n')"; exit 3 ;;
  stop) acquire_lock; stop_application; exit 0 ;;
  logs)
    find_container || fail "$(dv_msg '当前目录没有已记录的应用容器。' 'No application container is recorded for this directory.')"
    docker_cli logs --follow --tail 200 "$container_id"; exit $? ;;
esac

compose_version=$(docker_cli compose version --short 2>/dev/null) || fail "$(dv_msg '需要 Docker Compose v2.20+，请安装或更新 Docker Compose。' 'Docker Compose v2.20+ is required. Install or update Docker Compose.')"
printf '%s\n' "$compose_version" | awk -F. '{sub(/^v/, "", $1); exit !(($1+0 > 2) || ($1+0 == 2 && $2+0 >= 20))}' || fail "$(dv_msg '需要 Docker Compose v2.20+。' 'Docker Compose v2.20+ is required.')"
architecture=$(docker_cli info --format '{{.Architecture}}' 2>/dev/null) || fail "$(dv_msg '无法读取 Docker 引擎架构。' 'Cannot read the Docker engine architecture.')"
case "$architecture" in amd64|x86_64) engine_platform=linux/amd64 ;; arm64|aarch64) engine_platform=linux/arm64 ;; *) fail "$(dv_msg '不支持当前 Docker 引擎架构。' 'The Docker engine architecture is not supported.')" ;; esac
[ "$engine_platform" = "$expected_platform" ] || fail "$(dv_msg "发布包架构 $expected_platform 与 Docker 引擎 $engine_platform 不匹配。" "Package architecture $expected_platform does not match Docker engine architecture $engine_platform.")"
[ -f "$package_root/config/application.yml" ] && [ -r "$package_root/config/application.yml" ] || fail "$(dv_msg '缺少可读取的 config/application.yml。' 'config/application.yml is missing or unreadable.')"
if [ "$mode" != check ]; then
  acquire_lock
  if [ "$mode" = restart ]; then stop_application; fi
  if find_container && [ "$container_status" = running ]; then
    if [ -f "$env_file" ]; then chmod 600 "$env_file" || fail "$(dv_msg '无法保护 .env 的文件权限。' 'Cannot secure .env permissions.')"; fi
    show_status
    printf "$(dv_msg '应用容器已运行，未重复创建。配置修改后请使用 --restart。\n' 'The application container is already running. Use --restart to apply configuration changes.\n')"
    exit 0
  fi
fi

# Ask Compose to parse dotenv, including literal single-quoted secrets. Compose
# 2.20 supports config --format json; the minimal model exposes each value in a
# service environment field so the JSON parser can return KEY=value records.
probe_environment() {
  probe_json=$(docker_cli compose -p datavisool-env-probe --project-directory "$package_root" --env-file "$env_source" -f - config --format json 2>/dev/null <<'EOF'
services:
  app:
    image: scratch
    environment:
      DATAVISOOL_IMAGE: "${DATAVISOOL_IMAGE-}"
      DATAVISOOL_PROJECT_NAME: "${DATAVISOOL_PROJECT_NAME-}"
      APP_BIND_ADDRESS: "${APP_BIND_ADDRESS-}"
      APP_PORT: "${APP_PORT-}"
      APP_UID: "${APP_UID-}"
      APP_GID: "${APP_GID-}"
      DB_HOST: "${DB_HOST-}"
      DB_PORT: "${DB_PORT-}"
      DB_NAME: "${DB_NAME-}"
      DB_USER: "${DB_USER-}"
      DB_PASSWORD: "${DB_PASSWORD-}"
      JAVA_TOOL_OPTIONS: "${JAVA_TOOL_OPTIONS-}"
      TZ: "${TZ-}"
EOF
  ) || return 1
  printf '%s\n' "$probe_json" | LC_ALL=C awk '
    function ws() {while(substr(data,pos,1) ~ /[ \t\r\n]/ && pos<=length(data))pos++}
    function bad() {invalid=1; exit 1}
    function hex(s, n,i,c) {n=0; for(i=1;i<=length(s);i++){c=index("0123456789abcdef",tolower(substr(s,i,1)))-1;if(c<0)bad();n=n*16+c}return n}
    function utf(n) {
      if(n<128)return sprintf("%c",n)
      if(n<2048)return sprintf("%c%c",192+int(n/64),128+n%64)
      if(n<65536)return sprintf("%c%c%c",224+int(n/4096),128+int(n/64)%64,128+n%64)
      return sprintf("%c%c%c%c",240+int(n/262144),128+int(n/4096)%64,128+int(n/64)%64,128+n%64)
    }
    function str( s,c,e,n,low) {
      if(substr(data,pos++,1)!="\042")bad(); s=""
      while(pos<=length(data)) {
        c=substr(data,pos++,1); if(c=="\042")return s
        if(c ~ /[[:cntrl:]]/)bad()
        if(c=="\\") {
          e=substr(data,pos++,1)
          if(e=="u") {
            n=hex(substr(data,pos,4));pos+=4
            if(n>=55296&&n<=56319){if(substr(data,pos,2)!="\\u")bad();pos+=2;low=hex(substr(data,pos,4));pos+=4;if(low<56320||low>57343)bad();n=65536+(n-55296)*1024+low-56320}
            else if(n>=56320&&n<=57343)bad()
            if(n==0||n==10||n==13||(n<32&&n!=9)||n==127)bad()
            s=s utf(n)
          } else if(e=="n"||e=="r"||e=="b"||e=="f")bad()
          else if(e=="t")s=s "\t"
          else if(e=="\042"||e=="\\"||e=="/")s=s e;else bad()
        } else s=s c
      }
      bad()
    }
    function value(path,depth, c,k,n,token,start) {
      if(depth>100)bad(); ws();c=substr(data,pos,1)
      if(c=="{") {
        pos++;ws();if(substr(data,pos,1)=="}"){pos++;return}
        while(1){ws();k=str();ws();if(substr(data,pos++,1)!=":")bad();value(path "|" k,depth+1);ws();c=substr(data,pos++,1);if(c=="}")return;if(c!=",")bad()}
      } else if(c=="[") {
        pos++;ws();n=0;if(substr(data,pos,1)=="]"){pos++;sizes[path]=0;return}
        while(1){value(path "|" n++,depth+1);ws();c=substr(data,pos++,1);if(c=="]"){sizes[path]=n;return}if(c!=",")bad()}
      } else {
        if(c=="\042"){token=str();types[path]="string"}
        else {start=pos;while(pos<=length(data)&&substr(data,pos,1)!~/[ \t\r\n,}\]]/)pos++;token=substr(data,start,pos-start);if(token!~/^(true|false|null|-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?)$/)bad();types[path]="primitive"}
        fields[path]=token
      }
    }
    {data=data $0 "\n"}
    END {
      if(invalid)exit 1
      pos=1;value("",0);ws();if(pos<=length(data))exit 1
      base="|services|app|environment"
      count=split("DATAVISOOL_IMAGE DATAVISOOL_PROJECT_NAME APP_BIND_ADDRESS APP_PORT APP_UID APP_GID DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD JAVA_TOOL_OPTIONS TZ",keys," ")
      for(i=1;i<=count;i++){
        path=base "|" keys[i]
        if(!(path in fields)||types[path]!="string")exit 1
        decoded_value=fields[path];gsub(/[$][$]/,"$",decoded_value)
        if(decoded_value ~ /[\r\n]/)exit 1
        printf "%s=%s\n",keys[i],decoded_value
      }
    }
  ' 2>/dev/null
}
get_value() { printf '%s\n' "$resolved_env" | awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key)+2); exit }'; }
validate_env_lines() {
  awk '
    function managed(k) { return k ~ /^(DATAVISOOL_IMAGE|DATAVISOOL_PROJECT_NAME|APP_BIND_ADDRESS|APP_PORT|APP_UID|APP_GID|DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD|JAVA_TOOL_OPTIONS|TZ)$/ }
    { line=$0; sub(/\r$/, "", line); if(NR==1) sub(/^\357\273\277/, "", line)
      if (line !~ /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=/) next
      k=line; sub(/^[ \t]*(export[ \t]+)?/, "", k); sub(/[ \t]*=.*/, "", k)
      if (!managed(k)) next
      if (++seen[k]>1) bad=1
      v=line; sub(/^[^=]*=[ \t]*/, "", v); q=substr(v,1,1)
      if (q == "\047" || q == "\042") {
        closed=0
        for(i=2;i<=length(v);i++) {
          c=substr(v,i,1); n=substr(v,i+1,1)
          if(c=="\\" && (q=="\042" || n==q)) {i++; continue}
          if(c==q) {closed=1; if(substr(v,i+1) !~ /^[ \t]*(#.*)?$/) bad=1; break}
        }
        if(!closed) bad=1
      }
    }
    END {exit bad}
  ' "$env_source" || fail "$(dv_msg '.env 中有重复配置或多行/无效引号，请将部署参数写成单行值。' '.env contains duplicate settings or invalid/multiline quotes. Use single-line values.')"
}
env_source=$env_file
if [ ! -f "$env_file" ]; then
  [ "$mode" != check ] || fail "$(dv_msg '缺少 .env，请先无参数运行脚本补齐配置。' '.env is missing. Run without arguments to complete setup.')"
  env_source=$assets/.env.example
fi
validate_env_lines
resolved_env=$(probe_environment) || fail "$(dv_msg '.env 解析失败，请检查配置语法（配置内容不会打印）。' 'Failed to parse .env. Check its syntax; values are not printed.')"
db_host=$(get_value DB_HOST)
db_port=$(get_value DB_PORT)
db_name=$(get_value DB_NAME)
db_user=$(get_value DB_USER)
db_password=$(get_value DB_PASSWORD)
image=$(get_value DATAVISOOL_IMAGE)
configured_project=$(get_value DATAVISOOL_PROJECT_NAME)
app_port=$(get_value APP_PORT); app_port=${app_port:-8080}
app_uid=$(get_value APP_UID)
app_gid=$(get_value APP_GID)

updates=
# Values enter awk through stdin, never through command arguments or executable code.
queue_value() {
  # Double quotes can represent even a trailing backslash; $$ prevents Compose
  # from expanding dollar signs in literal credentials.
  quoted_value=$(printf '%s' "$2" | awk '{for(i=1;i<=length($0);i++){c=substr($0,i,1); if(c=="\\")printf "\\\\"; else if(c=="\042")printf "\\\042"; else if(c=="$")printf "$$"; else printf "%s",c}}')
  updates="${updates}$1=\"$quoted_value\"
"
}
missing() { case "$1" in ''|CHANGE_ME_*|change_me_*) return 0 ;; *) return 1 ;; esac; }
ask_value() {
  [ -t 0 ] && [ -t 1 ] || fail "$(dv_msg "缺少必要数据库配置 $1；请在交互终端运行脚本补齐，或编辑 .env。" "Required database setting $1 is missing. Run interactively or edit .env.")"
  if [ "$1" = DB_PASSWORD ]; then
    terminal_state=$(stty -g) || fail "$(dv_msg '无法隐藏密码输入。' 'Cannot hide password input.')"
    stty -echo || fail "$(dv_msg '无法隐藏密码输入。' 'Cannot hide password input.')"
    printf "$(dv_msg 'MySQL 密码（直接回车取消）：' 'MySQL password (press Enter to cancel): ')"
    IFS= read -r answer; read_status=$?
    stty "$terminal_state"; terminal_state=
    printf '\n'
  else
    printf "$(dv_msg '%s（直接回车取消）：' '%s (press Enter to cancel): ')" "$2"
    IFS= read -r answer; read_status=$?
  fi
  [ "$read_status" -eq 0 ] && [ -n "$answer" ] || fail "$(dv_msg '输入已取消，配置未保存。' 'Input cancelled; configuration was not saved.')"
  case "$answer" in *"
"*) fail "$(dv_msg '输入不能包含换行或回车。' 'Input cannot contain a newline or carriage return.')" ;; esac
}
for db_key in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD; do
  case "$db_key" in
    DB_HOST) value=$db_host; prompt="$(dv_msg 'MySQL 主机（宿主机默认用 host.docker.internal）' 'MySQL host (host.docker.internal for the host by default)')" ;;
    DB_PORT) value=$db_port; prompt="$(dv_msg 'MySQL 端口' 'MySQL port')" ;;
    DB_NAME) value=$db_name; prompt="$(dv_msg 'MySQL 数据库名称' 'MySQL database name')" ;;
    DB_USER) value=$db_user; prompt="$(dv_msg 'MySQL 用户名' 'MySQL username')" ;;
    DB_PASSWORD) value=$db_password; prompt="$(dv_msg 'MySQL 密码' 'MySQL password')" ;;
  esac
  if missing "$value"; then
    [ "$mode" != check ] || fail "$(dv_msg "缺少必要数据库配置 $db_key。" "Required database setting $db_key is missing.")"
    ask_value "$db_key" "$prompt"
    value=$answer
    queue_value "$db_key" "$value"
    case "$db_key" in DB_HOST) db_host=$value ;; DB_PORT) db_port=$value ;; DB_NAME) db_name=$value ;; DB_USER) db_user=$value ;; DB_PASSWORD) db_password=$value ;; esac
  fi
done
case "$db_host" in localhost|127.*|::1|'[::1]') fail "$(dv_msg '容器中的数据库地址指向容器自身；宿主机 MySQL 请使用 host.docker.internal 或宿主机可达地址。' 'The database address points to the container itself. Use host.docker.internal or a reachable host address for host MySQL.')" ;; esac
printf '%s\n' "$db_host" | LC_ALL=C awk '{exit !($0 ~ /^[a-zA-Z0-9_.:\[\]-]+$/)}' || fail "$(dv_msg 'MySQL 主机格式无效。' 'The MySQL host format is invalid.')"
case "$db_port" in ''|*[!0-9]*|0|0*) fail "$(dv_msg 'MySQL 端口必须是 1–65535。' 'The MySQL port must be in 1–65535.')" ;; esac
[ "${#db_port}" -le 5 ] && [ "$db_port" -le 65535 ] || fail "$(dv_msg 'MySQL 端口必须是 1–65535。' 'The MySQL port must be in 1–65535.')"
case "$db_name" in ''|*[!a-zA-Z0-9_-]*) fail "$(dv_msg '数据库名称只允许字母、数字、下划线或短横线。' 'The database name may contain only letters, digits, underscores and hyphens.')" ;; esac
[ "${#db_name}" -le 64 ] || fail "$(dv_msg '数据库名称最多 64 位。' 'The database name must be at most 64 characters.')"
case "$app_port" in ''|*[!0-9]*|0|0*) fail "$(dv_msg 'APP_PORT 必须是 1–65535。' 'APP_PORT must be in 1–65535.')" ;; esac
[ "${#app_port}" -le 5 ] && [ "$app_port" -le 65535 ] || fail "$(dv_msg 'APP_PORT 必须是 1–65535。' 'APP_PORT must be in 1–65535.')"

if [ -n "$project" ]; then
  if [ "$env_source" != "$env_file" ]; then
    # A missing config uses template defaults; the verified identity is retained.
    queue_value DATAVISOOL_PROJECT_NAME "$project"
    printf "$(dv_msg '根目录 .env 缺失，将沿用原项目名重新生成配置。\n' 'The root .env is missing; configuration will be recreated using the original project name.\n')"
  else
    [ "$configured_project" = "$project" ] || fail "$(dv_msg 'DATAVISOOL_PROJECT_NAME 已改变；请恢复原项目名，避免创建另一套实例。' 'DATAVISOOL_PROJECT_NAME changed. Restore the original name to avoid creating another instance.')"
  fi
else
  project=$configured_project
  if [ -z "$project" ] || [ "$project" = datavisool-web-app ]; then
    project=datavisool-app-$(printf '%s' "$package_root" | cksum | awk '{print $1}')
    [ "$mode" = check ] || queue_value DATAVISOOL_PROJECT_NAME "$project"
  fi
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail "$(dv_msg 'DATAVISOOL_PROJECT_NAME 格式无效。' 'DATAVISOOL_PROJECT_NAME has an invalid format.')" ;; esac
fi
if [ "$env_source" != "$env_file" ] || [ -z "$image" ]; then
  image=$expected_image
  queue_value DATAVISOOL_IMAGE "$expected_image"
fi
[ "$image" = "$expected_image" ] || fail "$(dv_msg 'DATAVISOOL_IMAGE 与包内固定版本不一致；本入口暂不提供升级。' 'DATAVISOOL_IMAGE differs from the fixed package version; upgrades are not supported here.')"
# Check a manually chosen project name before persisting/adopting its identity.
# Compose can otherwise recreate a different directory's app with the same name.
if [ "$mode" != check ] && find_container; then
  if [ "$container_status" = running ]; then
    fail "$(dv_msg '发现同名运行实例但当前目录缺少完整部署记录，请使用原部署入口管理。' 'A running instance with the same name exists, but this directory lacks complete records. Use the original deployment entry.')"
  fi
fi
if [ -z "$app_uid" ] || [ -z "$app_gid" ]; then
  [ "$mode" != check ] || fail "$(dv_msg 'APP_UID/APP_GID 未配置；请先正常启动以自动设置，或手动填写后再检查。' 'APP_UID/APP_GID are missing. Start normally to set them automatically or fill them in before checking.')"
  [ "$env_source" != "$env_file" ] || [ ! -f "$run_dir/project.name" ] || fail "$(dv_msg '已有部署的 APP_UID/APP_GID 缺失；请恢复原来的值以保护已有数据。' 'An existing deployment is missing APP_UID/APP_GID. Restore the original values to protect data.')"
  if [ "$(id -u)" = 0 ]; then
    default_uid=10001; default_gid=10001
  else
    default_uid=$(id -u); default_gid=$(id -g)
  fi
  [ -n "$app_uid" ] || app_uid=$default_uid
  [ -n "$app_gid" ] || app_gid=$default_gid
  queue_value APP_UID "$app_uid"
  queue_value APP_GID "$app_gid"
fi
case "$app_uid:$app_gid" in *[!0-9:]*|:*|*:) fail "$(dv_msg 'APP_UID/APP_GID 必须为非负整数。' 'APP_UID/APP_GID must be non-negative integers.')" ;; esac

compose_app() {
  docker_cli compose --project-directory "$package_root" --env-file "$env_file" -p "$project" -f "$assets/docker-compose.yml" "$@"
}
validate_compose() {
  compose_app config --quiet >/dev/null 2>&1 || fail "$(dv_msg 'Compose 配置校验失败，请检查 .env 和 docker-app/docker-compose.yml。' 'Compose validation failed. Check .env and docker-app/docker-compose.yml.')"
  [ "$(compose_app config --services 2>/dev/null)" = app ] || fail "$(dv_msg 'Docker app 只能包含 app 服务。' 'Docker app may contain only the app service.')"
  [ "$(compose_app config --images 2>/dev/null)" = "$expected_image" ] || fail "$(dv_msg 'Compose 镜像与当前发布包不一致。' 'The Compose image does not match this package.')"
  # Resolve mounts using Compose itself. Resource/config paths must remain tied to
  # this fixed directory; inspect these non-secret fields without printing config.
  mount_config=$(compose_app config --format json 2>/dev/null) || fail "$(dv_msg '无法解析 Compose 挂载配置。' 'Cannot parse the Compose mount configuration.')"
  # Parse JSON data, not shell code. Only the resolved image and mount fields are
  # used; no database values are printed or passed as command-line arguments.
  printf '%s\n' "$mount_config" | DATAVISOOL_VALIDATE_ROOT="$package_root" DATAVISOOL_VALIDATE_IMAGE="$expected_image" LC_ALL=C awk '
    function ws() {while(substr(data,pos,1) ~ /[ \t\r\n]/ && pos<=length(data))pos++}
    function bad() {invalid=1; exit 1}
    function hex(s, n,i,c) {n=0; for(i=1;i<=length(s);i++){c=index("0123456789abcdef",tolower(substr(s,i,1)))-1;if(c<0)bad();n=n*16+c}return n}
    function utf(n) {
      if(n<128)return sprintf("%c",n)
      if(n<2048)return sprintf("%c%c",192+int(n/64),128+n%64)
      if(n<65536)return sprintf("%c%c%c",224+int(n/4096),128+int(n/64)%64,128+n%64)
      return sprintf("%c%c%c%c",240+int(n/262144),128+int(n/4096)%64,128+int(n/64)%64,128+n%64)
    }
    function str( s,c,e,n,low) {
      if(substr(data,pos++,1)!="\042")bad(); s=""
      while(pos<=length(data)) {
        c=substr(data,pos++,1); if(c=="\042")return s
        if(c=="\\") {
          e=substr(data,pos++,1)
          if(e=="u") {
            n=hex(substr(data,pos,4));pos+=4
            if(n>=55296&&n<=56319){if(substr(data,pos,2)!="\\u")bad();pos+=2;low=hex(substr(data,pos,4));pos+=4;if(low<56320||low>57343)bad();n=65536+(n-55296)*1024+low-56320}
            s=s utf(n)
          } else if(e=="n")s=s "\n";else if(e=="r")s=s "\r";else if(e=="t")s=s "\t"
          else if(e=="b")s=s sprintf("%c",8);else if(e=="f")s=s sprintf("%c",12)
          else if(e=="\042"||e=="\\"||e=="/")s=s e;else bad()
        } else s=s c
      }
      bad()
    }
    function value(path,depth, c,k,n,token,start) {
      if(depth>100)bad(); ws();c=substr(data,pos,1)
      if(c=="{") {
        pos++;ws();if(substr(data,pos,1)=="}"){pos++;return}
        while(1){ws();k=str();ws();if(substr(data,pos++,1)!=":")bad();value(path "|" k,depth+1);ws();c=substr(data,pos++,1);if(c=="}")return;if(c!=",")bad()}
      } else if(c=="[") {
        pos++;ws();n=0;if(substr(data,pos,1)=="]"){pos++;sizes[path]=0;return}
        while(1){value(path "|" n++,depth+1);ws();c=substr(data,pos++,1);if(c=="]"){sizes[path]=n;return}if(c!=",")bad()}
      } else {
        if(c=="\042")token=str()
        else {start=pos;while(pos<=length(data)&&substr(data,pos,1)!~/[ \t\r\n,}\]]/)pos++;token=substr(data,start,pos-start);if(token!~/^(true|false|null|-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?)$/)bad()}
        fields[path]=token
      }
    }
    {data=data $0 "\n"}
    END {
      if(invalid)exit 1
      pos=1;value("",0);ws();if(pos<=length(data))exit 1
      base="|services|app";root=ENVIRON["DATAVISOOL_VALIDATE_ROOT"]
      if(fields[base "|image"]!=ENVIRON["DATAVISOOL_VALIDATE_IMAGE"]||sizes[base "|volumes"]!=3)exit 1
      for(i=0;i<3;i++) {
        p=base "|volumes|" i;t=fields[p "|target"]
        if(t=="/usr/app/resource")source=root "/resource"
        else if(t=="/datavisool/server/logs")source=root "/logs"
        else if(t=="/config/application.yml")source=root "/config/application.yml"
        else exit 1
        if(seen[t]++||fields[p "|type"]!="bind"||fields[p "|source"]!=source||fields[p "|bind|create_host_path"]=="true")exit 1
        if(t=="/config/application.yml"){if(fields[p "|read_only"]!="true")exit 1}
        else if(fields[p "|read_only"]=="true")exit 1
      }
      if(fields[base "|healthcheck|disable"]=="true")exit 1
    }
  ' || fail "$(dv_msg 'Compose 挂载配置不符合要求：请保留当前目录的 resource/、logs/ 和只读 config/application.yml。' 'Invalid Compose mounts. Retain the current resource/, logs/ and read-only config/application.yml mounts.')"
}
if [ "$mode" != check ]; then
  if [ "$env_source" != "$env_file" ] || [ -n "$updates" ]; then
    work_dir=$(mktemp -d "$run_dir/.env-work.XXXXXX") || fail "$(dv_msg '无法创建配置工作目录。' 'Cannot create the configuration working directory.')"
    cp "$env_source" "$work_dir/original" || fail "$(dv_msg '无法读取原配置。' 'Cannot read the original configuration.')"
    printf '%s' "$updates" > "$work_dir/updates"
    awk '
      FILENAME==ARGV[1] {p=index($0,"="); if(p){k=substr($0,1,p-1); values[k]=$0; order[++n]=k} next}
      {line=$0; sub(/\r$/, "", line); if(FNR==1) sub(/^\357\273\277/, "", line)
       k=line; sub(/^[ \t]*(export[ \t]+)?/, "", k); sub(/[ \t]*=.*/, "", k)
       if(k in values){print values[k]; written[k]=1} else print line}
      END{for(i=1;i<=n;i++)if(!written[order[i]])print values[order[i]]}
    ' "$work_dir/updates" "$work_dir/original" > "$work_dir/env" || fail "$(dv_msg '无法准备新配置。' 'Cannot prepare the new configuration.')"
    env_source=$work_dir/env
    validate_env_lines
    resolved_env=$(probe_environment) || fail "$(dv_msg '新 .env 校验失败，原配置未修改。' 'The new .env failed validation; the original was not changed.')"
    [ "$(get_value DB_PASSWORD)" = "$db_password" ] || fail "$(dv_msg '密码无法无损保存为 dotenv 单行值，原配置未修改。' 'The password cannot be saved losslessly as a single dotenv line; the original was not changed.')"
    chmod 600 "$work_dir/env" || fail "$(dv_msg '无法设置配置权限。' 'Cannot set configuration permissions.')"
    if [ -e "$env_file" ]; then
      cmp -s "$env_file" "$work_dir/original" || fail "$(dv_msg '.env 已被其他程序修改，请重试。' '.env was changed by another process. Try again.')"
      backup=$env_file.bak.$(date +%Y%m%d%H%M%S).$$
      [ ! -e "$backup" ] || fail "$(dv_msg '配置备份已存在。' 'The configuration backup already exists.')"
      cp "$env_file" "$backup" || fail "$(dv_msg '无法备份配置。' 'Cannot back up the configuration.')"
      chmod 600 "$backup" || fail "$(dv_msg '无法设置备份权限。' 'Cannot set backup permissions.')"
      printf "$(dv_msg '原配置已备份：%s\n' 'Original configuration backed up: %s\n')" "$backup"
    fi
    mv "$work_dir/env" "$env_file" || fail "$(dv_msg '无法保存配置。' 'Cannot save the configuration.')"
    env_source=$env_file
    printf "$(dv_msg '部署配置已保存到 .env。\n' 'Deployment configuration saved to .env.\n')"
  fi
  chmod 600 "$env_file" || fail "$(dv_msg '无法保护 .env 的文件权限。' 'Cannot secure .env permissions.')"
fi
for directory in resource logs; do
    if [ ! -e "$package_root/$directory" ] && [ "$mode" != check ]; then
      mkdir "$package_root/$directory" || fail "$(dv_msg "无法创建 $directory 目录。" "Cannot create directory $directory.")"
      if [ "$(id -u)" = 0 ]; then chown "$app_uid:$app_gid" "$package_root/$directory" || fail "$(dv_msg "无法设置 $directory 所有者。" "Cannot set the owner of $directory.")"; fi
    fi
    [ -d "$package_root/$directory" ] && [ ! -L "$package_root/$directory" ] || fail "$(dv_msg "$directory 必须为部署目录中的普通目录。" "$directory must be a normal directory in the deployment directory.")"
    # Check the configured UID/GID's access without broadening existing ownership.
    directory_mode=$(LC_ALL=C ls -ldn "$package_root/$directory") || fail "$(dv_msg '无法检查资源目录权限。' 'Cannot check resource directory permissions.')"
    printf '%s\n' "$directory_mode" | awk -v uid="$app_uid" -v gid="$app_gid" '
      {p=$1; if(uid==0)exit 0; if($3==uid)ok=substr(p,2,3)~/w/ && substr(p,2,3)~/x/;
       else if($4==gid)ok=substr(p,5,3)~/w/ && substr(p,5,3)~/x/; else ok=substr(p,8,3)~/w/ && substr(p,8,3)~/x/; exit !ok}
    ' || fail "$(dv_msg "$directory 目录对 APP_UID/APP_GID 不可写，请检查权限，脚本不会递归修改已有资源。" "$directory is not writable by APP_UID/APP_GID. Check permissions; existing resources will not be recursively modified.")"
done
validate_compose

image_platform=$(docker_cli image inspect --format '{{.Os}}/{{.Architecture}}' "$expected_image" 2>/dev/null)
if [ "$mode" = check ]; then
  if [ -n "$image_platform" ]; then
    [ "$image_platform" = "$expected_platform" ] || fail "$(dv_msg '本地镜像架构与发布包不一致。' 'The local image architecture does not match the package.')"
  else
    [ -f "$package_root/image.tar" ] && [ -r "$package_root/image.tar" ] || fail "$(dv_msg '本地缺少镜像，且发布包没有可读取的 image.tar。' 'The image is missing locally and the package has no readable image.tar.')"
  fi
  printf "$(dv_msg '检查通过；未修改配置、导入镜像或启动容器。数据库连通性尚未验证。\n' 'Checks passed. No configuration, image or container was changed; database connectivity was not tested.\n')"
  exit 0
fi

if [ -z "$image_platform" ]; then
  [ -f "$package_root/image.tar" ] && [ -r "$package_root/image.tar" ] || fail "$(dv_msg '缺少可读取的 image.tar。' 'A readable image.tar is missing.')"
  printf "$(dv_msg '正在导入发布包镜像：%s……\n' 'Importing package image: %s...\n')" "$expected_image"
  docker_cli load --input "$package_root/image.tar" || fail "$(dv_msg '导入镜像失败。' 'Failed to import the image.')"
  image_platform=$(docker_cli image inspect --format '{{.Os}}/{{.Architecture}}' "$expected_image" 2>/dev/null) || fail "$(dv_msg '导入后仍未找到包内指定镜像。' 'The package image was not found after import.')"
fi
[ "$image_platform" = "$expected_platform" ] || fail "$(dv_msg '镜像架构与当前发布包不一致。' 'The image architecture does not match this package.')"

# Persist the stable deployment identity before creating any container. A recorded
# container ID is only a hint; every operation discovers and validates live labels.
printf '%s\n' docker-app-launcher-v1 > "$marker" || fail "$(dv_msg '无法保存部署类型。' 'Cannot save the deployment type.')"
printf '%s\n' "$package_root" > "$run_dir/deployment.root" || fail "$(dv_msg '无法保存部署目录。' 'Cannot save the deployment directory.')"
printf '%s\n' "$docker_endpoint" > "$run_dir/docker.endpoint" || fail "$(dv_msg '无法保存 Docker 引擎记录。' 'Cannot save the Docker engine record.')"
printf '%s\n' "$project" > "$run_dir/project.name" || fail "$(dv_msg '无法保存项目名。' 'Cannot save the project name.')"
printf "$(dv_msg '正在后台启动应用，等待健康检查（最多 %s 秒）……\n' 'Starting the application in the background and waiting for health checks (up to %s seconds)...\n')" "$wait_timeout"
if ! compose_app up --detach --wait --wait-timeout "$wait_timeout" --pull never app; then
  if find_container; then printf '%s\n' "$container_id" > "$run_dir/container.id"; show_status; fi
  fail "$(dv_msg '应用未通过健康检查，容器及数据已保留。请运行 deploy_linux.sh --logs 查看日志。' 'The application failed its health check; the container and data were retained. Run deploy_linux.sh --logs.')"
fi
find_container || fail "$(dv_msg 'Compose 已返回，但未找到当前目录对应的应用容器。' 'Compose returned, but the application container for this directory was not found.')"
printf '%s\n' "$container_id" > "$run_dir/container.id" || fail "$(dv_msg '无法保存容器 ID。' 'Cannot save the container ID.')"
show_status
[ "$container_status" = running ] && [ "$container_health" = healthy ] || fail "$(dv_msg '应用容器尚未健康；请运行 --logs 查看日志。' 'The application container is not healthy. Run --logs to inspect logs.')"
printf "$(dv_msg '应用已启动，可以关闭当前窗口。\n访问地址：http://localhost:%s（远程访问请使用宿主机地址）\n资源目录：%s/resource\n日志目录：%s/logs\n日志命令：sh "%s/deploy_linux.sh" --logs\n' 'Application started. You may close this window.\nAddress: http://localhost:%s (use the host address for remote access)\nResources: %s/resource\nLogs: %s/logs\nLog command: sh "%s/deploy_linux.sh" --logs\n')" "$app_port" "$package_root" "$package_root" "$package_root"
