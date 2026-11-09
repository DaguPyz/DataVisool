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
Docker all-in-one (application and MySQL in one container)
Usage: deploy_linux.sh [--check|--status|--stop|--restart|--logs|--help]
       deploy_linux.sh [--restart] [--wait-timeout SECONDS]
Without options, configure missing database settings and start the local image.
--check is read-only; --status, --stop and --logs manage the existing instance.
--restart stops the existing instance before starting it again.
The health check waits up to 600 seconds by default. Local Docker and Compose v2.20+ are required.
Database data, resources, credentials and logs remain in data/ when stopped.
MySQL defaults to 127.0.0.1:3306; MYSQL_BIND_ADDRESS and MYSQL_PORT can change it.
First startup requires database name, username and password; retain these for existing data.
This launcher does not upgrade deployments or make backups.
EOF
    return
  fi
  cat <<'EOF'
Docker allinone 一键部署（应用和 MySQL 单容器）
用法：deploy_linux.sh [--check|--status|--stop|--restart|--logs|--help]
      deploy_linux.sh [--restart] [--wait-timeout 秒数]
无参数：准备配置和宿主机 data 目录，导入本地镜像并后台启动应用与 MySQL。
--check：只读检查，不询问、不创建文件、不导入镜像、不启动。
--status / --stop / --logs：查看状态、停止、跟随日志，不要求 .env 完整。
--restart：停止成功后按当前配置重新启动；未运行时直接启动。
默认等待健康检查 600 秒。需要本机 Linux Docker 引擎及 Compose v2.20+。
数据库、资源、凭据和日志保存在发布目录 data/，挂载到容器 /data；停止保留全部数据。
MySQL 默认映射到宿主机 127.0.0.1:3306，可用 MYSQL_BIND_ADDRESS / MYSQL_PORT 调整。
首次启动需填写数据库名称、用户名和密码，容器按这些值初始化 MySQL。
已有数据需沿用原凭据；本入口暂不提供升级或备份。
EOF
}

mode=start
wait_timeout=600
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
assets=$package_root/docker-allinone
env_file=$package_root/.env
env_source=$env_file
if [ ! -f "$env_file" ]; then env_source=$assets/.env.example; fi
run_dir=$package_root/run
data_dir=$package_root/data
marker=$package_root/.datavisool-deployment
lock_dir=$run_dir/.docker-launch.lock
lock_acquired=no
run_dir_created=no
terminal_state=
work_dir=
pending_work=
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
  if [ -n "$pending_work" ]; then rm -f "$pending_work"; fi
  release_lock
  if [ "$run_dir_created" = yes ]; then rmdir "$run_dir" 2>/dev/null || :; fi
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

[ ! -f "$package_root/server.jar" ] && [ ! -d "$package_root/docker-app" ] || fail "$(dv_msg '发布目录混有其他部署类型，请使用独立目录。' 'The directory contains another deployment type. Use a separate directory.')"
for asset in IMAGE PLATFORM docker-compose.yml .env.example; do
  [ -f "$assets/$asset" ] && [ -r "$assets/$asset" ] || fail "$(dv_msg "Docker allinone 包缺少可读取的 docker-allinone/$asset。" "The Docker all-in-one package is missing a readable docker-allinone/$asset.")"
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
    DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD JAVA_TOOL_OPTIONS TZ MYSQL_BIND_ADDRESS MYSQL_PORT \
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
printf "$(dv_msg '正在检查 Docker allinone 部署环境……\n' 'Checking the Docker all-in-one deployment environment...\n')"
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
has_identity=no
recover_identity=no
recorded_mysql_base=
if [ -e "$marker" ]; then
  [ "$(cat "$marker" 2>/dev/null)" = docker-allinone-launcher-v1 ] || fail "$(dv_msg '该目录属于其他部署方式，请勿混用旧 Node 管理器或 Docker app。' 'This directory belongs to another deployment type. Do not mix deployment managers.')"
fi
core_complete=yes
for state_file in project.name deployment.root docker.endpoint data.path mysql.base; do
  [ -s "$run_dir/$state_file" ] || core_complete=no
done
if [ "$core_complete" = yes ]; then
  [ -f "$marker" ] || fail "$(dv_msg '缺少部署类型标记，请检查原部署记录。' 'The deployment type marker is missing. Check the original deployment records.')"
  [ "$(cat "$run_dir/deployment.root" 2>/dev/null)" = "$package_root" ] || fail "$(dv_msg '部署目录记录不匹配，请使用原固定目录。' 'The deployment directory does not match its record. Use the original directory.')"
  assert_docker_endpoint "$(cat "$run_dir/docker.endpoint" 2>/dev/null)"
  project=$(cat "$run_dir/project.name")
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail "$(dv_msg '项目名记录无效。' 'The recorded project name is invalid.')" ;; esac
  [ "$(cat "$run_dir/data.path" 2>/dev/null)" = "$data_dir" ] || fail "$(dv_msg '宿主机数据目录记录不完整或已改变。' 'The host data directory record is incomplete or has changed.')"
  [ -s "$run_dir/mysql.base" ] || fail "$(dv_msg '缺少 MySQL 版本记录，请恢复部署记录。' 'The MySQL version record is missing. Restore the deployment records.')"
  recorded_mysql_base=$(cat "$run_dir/mysql.base")
  has_identity=yes
elif [ -f "$run_dir/data.pending" ]; then
  # A complete intent is atomically committed before the individual status files.
  # It can restore an interrupted first initialization, without inventing a new
  # project, data directory or database. Conflicting records always fail closed.
  [ "$(awk 'END{print NR}' "$run_dir/data.pending")" = 6 ] || fail "$(dv_msg '首次创建意图不完整，请恢复部署记录；未创建空数据库。' 'Initial creation records are incomplete. Restore the deployment records; no empty database was created.')"
  [ "$(sed -n '1p' "$run_dir/data.pending")" = docker-allinone-launcher-v1 ] || fail "$(dv_msg '首次创建意图类型不匹配。' 'The initial creation record has the wrong deployment type.')"
  project=$(sed -n '2p' "$run_dir/data.pending")
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail "$(dv_msg '首次创建意图的项目名无效。' 'The initial creation record has an invalid project name.')" ;; esac
  [ "$(sed -n '3p' "$run_dir/data.pending")" = "$package_root" ] || fail "$(dv_msg '首次创建意图不属于当前目录。' 'The initial creation record belongs to another directory.')"
  assert_docker_endpoint "$(sed -n '4p' "$run_dir/data.pending")"
  [ "$(sed -n '5p' "$run_dir/data.pending")" = "$data_dir" ] || fail "$(dv_msg '首次创建意图的宿主机数据目录无效。' 'The host data directory in the initial creation record is invalid.')"
  recorded_mysql_base=$(sed -n '6p' "$run_dir/data.pending")
  [ -n "$recorded_mysql_base" ] || fail "$(dv_msg '首次创建意图缺少 MySQL 版本。' 'The initial creation record is missing the MySQL version.')"
  for state_file in project.name deployment.root docker.endpoint data.path mysql.base; do
    case "$state_file" in
      project.name) expected_state=$project ;; deployment.root) expected_state=$package_root ;;
      docker.endpoint) expected_state=$docker_endpoint ;; data.path) expected_state=$data_dir ;;
      mysql.base) expected_state=$recorded_mysql_base ;;
    esac
    if [ -e "$run_dir/$state_file" ]; then
      if [ "$state_file" = docker.endpoint ]; then
        assert_docker_endpoint "$(cat "$run_dir/$state_file")"
      else
        [ "$(cat "$run_dir/$state_file")" = "$expected_state" ] || fail "$(dv_msg '现有部署记录与首次创建意图矛盾，未接管数据。' 'Existing deployment records conflict with the initial creation record; data was not taken over.')"
      fi
    fi
  done
  case "$mode" in start|restart) ;; *) fail "$(dv_msg '首次身份初始化尚未完成；请运行无参数启动恢复，当前操作未修改文件。' 'Initial identity setup is incomplete. Run without arguments to resume; this operation did not modify files.')" ;; esac
  has_identity=yes
  recover_identity=yes
elif [ -e "$marker" ] || [ -e "$run_dir/project.name" ] || [ -e "$run_dir/data.path" ] || [ -e "$run_dir/deployment.root" ]; then
  fail "$(dv_msg '部署身份记录不完整，请恢复原记录；未创建数据目录或空数据库。' 'Deployment identity records are incomplete. Restore them; no data directory or empty database was created.')"
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

inspect_data_dir() {
  [ ! -L "$data_dir" ] || fail "$(dv_msg '宿主机 data 目录不能是符号链接。' 'The host data directory cannot be a symbolic link.')"
  [ ! -e "$data_dir" ] || [ -d "$data_dir" ] || fail "$(dv_msg '宿主机 data 路径不是目录。' 'The host data path is not a directory.')"
  [ -d "$data_dir" ]
}
require_recorded_data() {
  if ! inspect_data_dir; then
    [ -f "$run_dir/data.pending" ] || fail "$(dv_msg '已记录的宿主机数据目录丢失，未创建空数据库。请恢复原 data 目录。' 'The recorded host data directory is missing. No empty database was created; restore the original data directory.')"
    [ "$mode" != check ] || fail "$(dv_msg '首次数据目录初始化尚未完成，请运行无参数启动恢复；未创建空数据库。' 'Initial data directory setup is incomplete. Run without arguments to resume; no empty database was created.')"
    return 1
  fi
}
inspect_field() { docker_cli inspect --format "$1" "$container_id" 2>/dev/null; }
find_container() {
  container_id=
  [ -n "$project" ] || return 1
  found_ids=$(docker_cli ps --all --quiet --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app') || fail "$(dv_msg '无法查询容器。' 'Cannot query containers.')"
  [ -n "$found_ids" ] || return 1
  case "$found_ids" in *[!a-fA-F0-9]*) fail "$(dv_msg '发现多个容器或无效容器 ID，未执行操作。' 'Multiple containers or an invalid container ID were found; no action was taken.')" ;; esac
  container_id=$found_ids
  [ "$(inspect_field '{{ index .Config.Labels "com.docker.compose.project" }}')" = "$project" ] &&
  [ "$(inspect_field '{{ index .Config.Labels "com.docker.compose.service" }}')" = app ] &&
  [ "$(inspect_field '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')" = "$package_root" ] || fail "$(dv_msg '容器归属与当前部署目录不一致。' 'The container does not belong to this deployment directory.')"
  [ "$(inspect_field '{{.Config.Image}}')" = "$expected_image" ] || fail "$(dv_msg '容器镜像与当前 Docker allinone 包不一致，本入口暂不提供升级。' 'The container image differs from this all-in-one package; upgrades are not supported here.')"
  data_mount=$(inspect_field '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Source}}|{{.RW}}{{end}}{{end}}') || fail "$(dv_msg '无法验证数据目录挂载。' 'Cannot verify the data directory mount.')"
  config_mount=$(inspect_field '{{range .Mounts}}{{if eq .Destination "/config/application.yml"}}{{.Type}}|{{.Source}}|{{.RW}}{{end}}{{end}}') || fail "$(dv_msg '无法验证配置挂载。' 'Cannot verify the configuration mount.')"
  [ "$data_mount" = "bind|$data_dir|true" ] && [ "$config_mount" = "bind|$package_root/config/application.yml|false" ] || fail "$(dv_msg '容器实际挂载与本实例宿主机数据目录/只读配置不一致，未执行操作。' 'Container mounts do not match the host data directory and read-only configuration; no action was taken.')"
  container_status=$(inspect_field '{{.State.Status}}') || fail "$(dv_msg '无法读取容器状态。' 'Cannot read container status.')"
  container_health=$(inspect_field '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}') || fail "$(dv_msg '无法读取健康状态。' 'Cannot read health status.')"
  container_ports=$(inspect_field '{{range (index .NetworkSettings.Ports "8080/tcp")}}{{.HostIp}}:{{.HostPort}} {{end}}') || fail "$(dv_msg '无法读取容器端口。' 'Cannot read container ports.')"
  container_mysql_ports=$(inspect_field '{{range (index .NetworkSettings.Ports "3306/tcp")}}{{.HostIp}}:{{.HostPort}} {{end}}') || fail "$(dv_msg '无法读取 MySQL 端口。' 'Cannot read the MySQL port.')"
}
assert_container_ports() {
  [ "$container_ports" = "$app_bind:$app_port " ] && [ "$container_mysql_ports" = "$mysql_bind:$mysql_port " ] ||
    fail "$(dv_msg '当前运行容器的端口映射与 .env 不一致；请用 --restart 重建端口映射。' 'The running container port mapping differs from .env. Use --restart to recreate it.')"
}
docker_mount_csv_source() {
  csv_source=$(printf '%s' "$1" | sed 's/"/""/g') || return 1
  printf 'type=bind,"source=%s",target=/data,readonly' "$csv_source"
}
show_status() {
  printf "$(dv_msg '容器 ID：%s\n状态：%s\n健康状态：%s\n宿主机数据目录：%s → /data\n' 'Container ID: %s\nStatus: %s\nHealth: %s\nHost data directory: %s -> /data\n')" "$container_id" "$container_status" "$container_health" "$data_dir"
  if [ -n "$container_ports" ]; then printf "$(dv_msg '端口：%s\n' 'Port: %s\n')" "$container_ports"; fi
  if [ -n "$container_mysql_ports" ]; then printf "$(dv_msg 'MySQL 地址：%s\n' 'MySQL address: %s\n')" "$container_mysql_ports"; else printf "$(dv_msg 'MySQL 端口尚未映射；已有容器请用 --restart 重建映射。\n' 'The MySQL port is not mapped. Use --restart to recreate an existing container mapping.\n')"; fi
}
assert_clean_exit() {
  exit_code=$(inspect_field '{{.State.ExitCode}}') || fail "$(dv_msg '无法确认容器退出状态，未继续重启。' 'Cannot confirm the container exit status; restart was not continued.')"
  oom_killed=$(inspect_field '{{.State.OOMKilled}}') || fail "$(dv_msg '无法确认容器退出原因，未继续重启。' 'Cannot confirm the container exit reason; restart was not continued.')"
  [ "$exit_code" = 0 ] && [ "$oom_killed" = false ] || fail "$(dv_msg '容器异常退出或被强制终止；数据目录已保留，未继续自动重启。请先查看日志。' 'The container exited abnormally or was killed. Data was retained and automatic restart stopped; check the logs.')"
  # The existing supervisor can exit 0 even after timing out and killing mysqld.
  # Its clean-shutdown marker is written only after a clean MySQL shutdown.
  stopped_image=$(inspect_field '{{.Image}}') || fail "$(dv_msg '无法读取原容器镜像，未继续重启。' 'Cannot read the original container image; restart was not continued.')"
  [ -n "$stopped_image" ] || fail "$(dv_msg '原容器镜像记录为空，未继续重启。' 'The original image record is empty; restart was not continued.')"
  mount_spec=$(docker_mount_csv_source "$data_dir") || fail "$(dv_msg '无法安全编码宿主机数据目录，未继续重启。' 'Cannot safely encode the host data path; restart was not continued.')"
  docker_cli run --rm --pull never --network none --read-only --mount "$mount_spec" --entrypoint /bin/sh "$stopped_image" -c 'test -s /data/config/clean-shutdown && test ! -L /data/config/clean-shutdown' >/dev/null 2>&1 || fail "$(dv_msg '未确认 MySQL 正常关闭标记；完整数据目录已保留，未继续自动重启。请先查看日志。' 'The MySQL clean-shutdown marker was not confirmed. Data was retained and automatic restart stopped. Check the logs.')"
}
stop_application() {
  printf "$(dv_msg '正在检查 Docker allinone 包应用和数据库容器……\n' 'Checking the Docker all-in-one application and database container...\n')"
  if ! find_container; then printf "$(dv_msg '当前目录没有已记录的容器，无需停止。\n' 'No container is recorded for this directory; nothing to stop.\n')"; return 0; fi
  case "$container_status" in
    created) printf "$(dv_msg '容器尚未启动。\n' 'The container has not started.\n')"; return 0 ;;
    exited|dead) assert_clean_exit; printf "$(dv_msg '容器已停止，MySQL 正常关闭标记已确认。\n' 'Container stopped; the MySQL clean-shutdown marker is confirmed.\n')"; return 0 ;;
  esac
  printf "$(dv_msg '正在停止应用和 MySQL（最多等待 120 秒）……\n' 'Stopping the application and MySQL (waiting up to 120 seconds)...\n')"
  docker_cli stop --time 120 "$container_id" || fail "$(dv_msg '停止容器失败，未继续启动。' 'Failed to stop the container; startup was not continued.')"
  find_container || fail "$(dv_msg '停止后无法确认原容器状态，未继续重启；数据目录未删除。' 'Cannot confirm the original container status after stopping; restart was not continued and data was retained.')"
  case "$container_status" in exited|dead) ;; *) fail "$(dv_msg '容器仍未退出，未继续重启。' 'The container has not exited; restart was not continued.')" ;; esac
  assert_clean_exit
  printf "$(dv_msg '容器已停止，MySQL 正常关闭标记已确认，完整数据目录保留。\n' 'Container stopped; the MySQL clean-shutdown marker is confirmed and all data was retained.\n')"
}

case "$mode" in
  status|stop|logs)
    if [ "$has_identity" = no ]; then
      printf "$(dv_msg '当前目录尚无 Docker allinone 包部署记录。\n' 'No Docker all-in-one deployment is recorded for this directory.\n')"
      [ "$mode" = stop ] && exit 0; exit 3
    fi
    require_recorded_data || fail "$(dv_msg '首次数据目录创建尚未完成，请运行正常启动恢复。' 'Initial data directory creation is incomplete. Start normally to resume.')"
    case "$mode" in
      status)
        if find_container; then show_status; [ "$container_status" = running ] && exit 0; exit 3; fi
        printf "$(dv_msg '未发现当前实例容器；宿主机数据目录 %s 已保留。\n' 'No container was found for this instance; host data directory %s was retained.\n')" "$data_dir"; exit 3 ;;
      stop) acquire_lock; stop_application; exit 0 ;;
      logs) find_container || fail "$(dv_msg '未发现当前实例容器。' 'No container was found for this instance.')"; docker_cli logs --follow --tail 200 "$container_id"; exit $? ;;
    esac ;;
esac

compose_version=$(docker_cli compose version --short 2>/dev/null) || fail "$(dv_msg '需要 Docker Compose v2.20+。' 'Docker Compose v2.20+ is required.')"
printf '%s\n' "$compose_version" | awk -F. '{sub(/^v/, "", $1); exit !(($1+0>2)||($1+0==2&&$2+0>=20))}' || fail "$(dv_msg '需要 Docker Compose v2.20+。' 'Docker Compose v2.20+ is required.')"
architecture=$(docker_cli info --format '{{.Architecture}}' 2>/dev/null) || fail "$(dv_msg '无法读取 Docker 引擎架构。' 'Cannot read the Docker engine architecture.')"
case "$architecture" in amd64|x86_64) engine_platform=linux/amd64 ;; arm64|aarch64) engine_platform=linux/arm64 ;; *) fail "$(dv_msg '不支持当前 Docker 引擎架构。' 'The Docker engine architecture is not supported.')" ;; esac
[ "$engine_platform" = "$expected_platform" ] || fail "$(dv_msg "发布包架构 $expected_platform 与 Docker 引擎 $engine_platform 不匹配。" "Package architecture $expected_platform does not match Docker engine architecture $engine_platform.")"
[ -f "$package_root/config/application.yml" ] && [ -r "$package_root/config/application.yml" ] || fail "$(dv_msg '缺少可读取的 config/application.yml。' 'config/application.yml is missing or unreadable.')"
awk '
  /^[ \t]*#/ {next}
  /^[ \t]*url[ \t]*:/ {urls++; if(index($0,"jdbc:mysql://127.0.0.1:3306/${DB_NAME}")==0)bad=1}
  /^[ \t]*username[ \t]*:/ {users++; if(index($0,"${DB_USER}")==0)bad=1}
  /^[ \t]*password[ \t]*:/ {passwords++; if(index($0,"${DB_PASSWORD}")==0)bad=1}
  END {exit (bad||urls!=1||users!=1||passwords!=1)}
' "$package_root/config/application.yml" || fail "$(dv_msg 'Docker allinone 包应用配置必须保留容器内数据库地址和 DB_USER/DB_PASSWORD 变量引用，请恢复模板。' 'The all-in-one application configuration must retain the container database address and DB_USER/DB_PASSWORD references. Restore the template.')"
if [ "$mode" != check ]; then acquire_lock; fi
if [ "$has_identity" = yes ]; then
  require_recorded_data || :
  if [ "$mode" = restart ]; then stop_application; fi
  find_container || :
fi

probe_environment() {
  probe_json=$(docker_cli compose -p datavisool-web-allinone-probe --project-directory "$package_root" --env-file "$env_source" -f - config --format json 2>/dev/null <<'EOF'
services:
  app:
    image: scratch
    environment:
      DATAVISOOL_IMAGE: "${DATAVISOOL_IMAGE-}"
      DATAVISOOL_PROJECT_NAME: "${DATAVISOOL_PROJECT_NAME-}"
      APP_BIND_ADDRESS: "${APP_BIND_ADDRESS-}"
      APP_PORT: "${APP_PORT-}"
      MYSQL_BIND_ADDRESS: "${MYSQL_BIND_ADDRESS-}"
      MYSQL_PORT: "${MYSQL_PORT-}"
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
      count=split("DATAVISOOL_IMAGE DATAVISOOL_PROJECT_NAME APP_BIND_ADDRESS APP_PORT MYSQL_BIND_ADDRESS MYSQL_PORT DB_NAME DB_USER DB_PASSWORD JAVA_TOOL_OPTIONS TZ",keys," ")
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
get_value() { printf '%s\n' "$resolved_env" | awk -v key="$1" 'index($0,key "=")==1{print substr($0,length(key)+2);exit}'; }
validate_env_lines() {
  awk '
    {line=$0;sub(/\r$/,"",line);if(NR==1)sub(/^\357\273\277/,"",line)
     if(line !~ /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=/)next
     k=line;sub(/^[ \t]*(export[ \t]+)?/,"",k);sub(/[ \t]*=.*/,"",k)
     if(k !~ /^(DATAVISOOL_IMAGE|DATAVISOOL_PROJECT_NAME|APP_PORT|APP_BIND_ADDRESS|MYSQL_BIND_ADDRESS|MYSQL_PORT|DB_NAME|DB_USER|DB_PASSWORD|JAVA_TOOL_OPTIONS|TZ)$/)next
     if(++seen[k]>1)bad=1
     v=line;sub(/^[^=]*=[ \t]*/,"",v);q=substr(v,1,1)
     if(q=="\047"||q=="\042"){
       closed=0;for(i=2;i<=length(v);i++){c=substr(v,i,1);n=substr(v,i+1,1);if(c=="\\"&&(q=="\042"||n==q)){i++;continue}if(c==q){closed=1;if(substr(v,i+1)!~/^[ \t]*(#.*)?$/)bad=1;break}}
       if(!closed)bad=1
     }
    }END{exit bad}
  ' "$env_source" || fail "$(dv_msg '.env 中有重复配置或无效/多行引号，请保留单行部署参数。' '.env contains duplicate settings or invalid/multiline quotes. Use single-line values.')"
}
env_source=$env_file
if [ ! -f "$env_file" ]; then
  [ "$mode" != check ] || fail "$(dv_msg '缺少 .env，请先无参数运行脚本完成首次初始化。' '.env is missing. Run without arguments to complete initial setup.')"
  env_source=$assets/.env.example
fi
validate_env_lines
resolved_env=$(probe_environment) || fail "$(dv_msg '.env 解析失败，请检查语法；原始配置内容未输出。' 'Failed to parse .env. Check its syntax; values are not printed.')"
image=$(get_value DATAVISOOL_IMAGE)
configured_project=$(get_value DATAVISOOL_PROJECT_NAME)
db_name=$(get_value DB_NAME)
db_user=$(get_value DB_USER)
db_password=$(get_value DB_PASSWORD)
app_port=$(get_value APP_PORT); app_port=${app_port:-8080}
app_bind=$(get_value APP_BIND_ADDRESS); app_bind=${app_bind:-0.0.0.0}
mysql_bind=$(get_value MYSQL_BIND_ADDRESS); mysql_bind=${mysql_bind:-127.0.0.1}
mysql_port=$(get_value MYSQL_PORT); mysql_port=${mysql_port:-3306}
case "$app_port" in ''|*[!0-9]*|0|0*) fail "$(dv_msg 'APP_PORT 必须是 1–65535。' 'APP_PORT must be in 1–65535.')" ;; esac
[ "${#app_port}" -le 5 ] && [ "$app_port" -le 65535 ] || fail "$(dv_msg 'APP_PORT 必须是 1–65535。' 'APP_PORT must be in 1–65535.')"
case "$mysql_port" in ''|*[!0-9]*|0|0*) fail "$(dv_msg 'MYSQL_PORT 必须是 1–65535。' 'MYSQL_PORT must be in 1–65535.')" ;; esac
[ "${#mysql_port}" -le 5 ] && [ "$mysql_port" -le 65535 ] || fail "$(dv_msg 'MYSQL_PORT 必须是 1–65535。' 'MYSQL_PORT must be in 1–65535.')"
printf '%s\n' "$mysql_bind" | LC_ALL=C awk -F. 'NF!=4{exit 1}{for(i=1;i<=4;i++)if($i!~/^[0-9]+$/||length($i)>3||$i+0>255||($i~/^0[0-9]/))exit 1}' || fail "$(dv_msg 'MYSQL_BIND_ADDRESS 必须是有效的宿主机 IPv4 地址。' 'MYSQL_BIND_ADDRESS must be a valid host IPv4 address.')"
if [ "$app_port" = "$mysql_port" ]; then
  [ "$app_bind" != "$mysql_bind" ] && [ "$app_bind" != 0.0.0.0 ] && [ "$mysql_bind" != 0.0.0.0 ] || fail "$(dv_msg '应用端口与 MySQL 端口在同一宿主地址上冲突，请修改 MYSQL_PORT。' 'The application and MySQL ports conflict on the same host address. Change MYSQL_PORT.')"
fi
updates=
queue_value() {
  quoted_value=$(printf '%s' "$2" | awk '{for(i=1;i<=length($0);i++){c=substr($0,i,1);if(c=="\\")printf "\\\\";else if(c=="\042")printf "\\\042";else if(c=="$")printf "$$";else printf "%s",c}}')
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
}
for db_key in DB_NAME DB_USER DB_PASSWORD; do
  case "$db_key" in
    DB_NAME) value=$db_name; prompt="$(dv_msg 'MySQL 数据库名称' 'MySQL database name')" ;;
    DB_USER) value=$db_user; prompt="$(dv_msg 'MySQL 用户名' 'MySQL username')" ;;
    DB_PASSWORD) value=$db_password; prompt="$(dv_msg 'MySQL 密码' 'MySQL password')" ;;
  esac
  if missing "$value"; then
    [ "$mode" != check ] || fail "$(dv_msg "缺少必要数据库配置 ${db_key}。" "Required database setting ${db_key} is missing.")"
    ask_value "$db_key" "$prompt"
    value=$answer
    queue_value "$db_key" "$value"
    case "$db_key" in DB_NAME) db_name=$value ;; DB_USER) db_user=$value ;; DB_PASSWORD) db_password=$value ;; esac
  fi
done
case "$db_name" in ''|*[!a-zA-Z0-9_-]*) fail "$(dv_msg '数据库名称只允许字母、数字、下划线或短横线。' 'The database name may contain only letters, digits, underscores and hyphens.')" ;; esac
[ "${#db_name}" -le 64 ] || fail "$(dv_msg '数据库名称最多 64 位。' 'The database name must be at most 64 characters.')"
case "$db_user" in ''|*[!a-zA-Z0-9_.-]*) fail "$(dv_msg '数据库用户名只允许字母、数字、下划线、点或短横线。' 'The database username may contain only letters, digits, underscores, dots and hyphens.')" ;; esac
[ "${#db_user}" -le 32 ] || fail "$(dv_msg '数据库用户名最多 32 位。' 'The database username must be at most 32 characters.')"
printf '%s' "$db_password" | LC_ALL=C awk 'BEGIN{RS="\0"} /[\r\n]/{exit 1}' || fail "$(dv_msg '密码必须是非空单行值。' 'The password must be a non-empty single-line value.')"
if [ "$has_identity" = yes ]; then
  if [ "$env_source" != "$env_file" ]; then
    # Keep the verified instance and host data directory when rebuilding config.
    queue_value DATAVISOOL_PROJECT_NAME "$project"
    printf "$(dv_msg '根目录 .env 缺失，将沿用原项目名和宿主机数据目录重新生成配置。\n' 'The root .env is missing; configuration will be recreated using the original project name and data directory.\n')"
  else
    [ "$configured_project" = "$project" ] || fail "$(dv_msg 'DATAVISOOL_PROJECT_NAME 已改变，请恢复原值，避免切换到其他实例。' 'DATAVISOOL_PROJECT_NAME changed. Restore the original value to avoid switching instances.')"
  fi
else
  project=$configured_project
  if [ -z "$project" ] || [ "$project" = datavisool-web-allinone ]; then
    project=datavisool-b-$(printf '%s' "$package_root" | cksum | awk '{print $1}')
    [ "$mode" = check ] || queue_value DATAVISOOL_PROJECT_NAME "$project"
  fi
  case "$project" in ''|*[!a-z0-9_-]*|-*|_*) fail "$(dv_msg 'DATAVISOOL_PROJECT_NAME 格式无效。' 'DATAVISOOL_PROJECT_NAME has an invalid format.')" ;; esac
fi
if [ "$env_source" != "$env_file" ] || [ -z "$image" ]; then image=$expected_image; queue_value DATAVISOOL_IMAGE "$expected_image"; fi
[ "$image" = "$expected_image" ] || fail "$(dv_msg 'DATAVISOOL_IMAGE 与 Docker allinone 包指定版本不同，本入口暂不提供升级。' 'DATAVISOOL_IMAGE differs from the all-in-one package version; upgrades are not supported here.')"
if [ "$has_identity" = no ]; then
  if find_container; then fail "$(dv_msg '发现已有同名容器但缺少本实例完整记录，未接管。' 'A container with the same name exists but this instance lacks complete records; it was not taken over.')"; fi
fi
inspect_data_dir || :

compose_app() { docker_cli compose --project-directory "$package_root" --env-file "$env_file" -p "$project" -f "$assets/docker-compose.yml" "$@"; }
validate_compose() {
  compose_app config --quiet >/dev/null 2>&1 || fail "$(dv_msg 'Compose 配置校验失败，请检查 .env 和 docker-allinone/docker-compose.yml。' 'Compose validation failed. Check .env and docker-allinone/docker-compose.yml.')"
  [ "$(compose_app config --services 2>/dev/null)" = app ] || fail "$(dv_msg 'Docker allinone 包只能包含一个 app 服务。' 'The all-in-one package may contain only one app service.')"
  [ "$(compose_app config --images 2>/dev/null)" = "$expected_image" ] || fail "$(dv_msg 'Compose 镜像与当前 Docker allinone 包不一致。' 'The Compose image does not match this all-in-one package.')"
  mount_config=$(compose_app config --format json 2>/dev/null) || fail "$(dv_msg '无法解析 Docker allinone 包 Compose 配置。' 'Cannot parse the all-in-one Compose configuration.')"
  printf '%s\n' "$mount_config" | DATAVISOOL_VALIDATE_ROOT="$package_root" DATAVISOOL_VALIDATE_IMAGE="$expected_image" DATAVISOOL_VALIDATE_PORT="$app_port" DATAVISOOL_VALIDATE_BIND="$app_bind" DATAVISOOL_VALIDATE_MYSQL_BIND="$mysql_bind" DATAVISOOL_VALIDATE_MYSQL_PORT="$mysql_port" DATAVISOOL_VALIDATE_DB_NAME="$db_name" DATAVISOOL_VALIDATE_DB_USER="$db_user" DATAVISOOL_VALIDATE_DB_PASSWORD="$db_password" LC_ALL=C awk '
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
      if(fields[base "|image"]!=ENVIRON["DATAVISOOL_VALIDATE_IMAGE"]||sizes[base "|volumes"]!=2)exit 1
      user=fields[base "|user"];if(user!=""&&user!="null"&&user!="0"&&user!="0:0"&&user!="root"&&user!="root:root")exit 1
      if(fields[base "|pull_policy"]!="never"||fields[base "|healthcheck|disable"]=="true")exit 1
      grace=fields[base "|stop_grace_period"];if(grace!="2m0s"&&grace!="120s")exit 1
      for(i=0;i<2;i++) {
        p=base "|volumes|" i;t=fields[p "|target"]
        if(seen[t]++)exit 1
        if(t=="/data") {if(fields[p "|type"]!="bind"||fields[p "|source"]!=root "/data"||fields[p "|read_only"]=="true"||fields[p "|bind|create_host_path"]!="false")exit 1}
        else if(t=="/config/application.yml") {if(fields[p "|type"]!="bind"||fields[p "|source"]!=root "/config/application.yml"||fields[p "|read_only"]!="true"||fields[p "|bind|create_host_path"]=="true")exit 1}
        else exit 1
      }
      if(sizes[base "|ports"]!=2)exit 1
      for(i=0;i<2;i++) {
        p=base "|ports|" i;t=fields[p "|target"]
        if(port_seen[t]++||fields[p "|protocol"]!="tcp")exit 1
        if(t=="8080") {if(fields[p "|published"]!=ENVIRON["DATAVISOOL_VALIDATE_PORT"]||fields[p "|host_ip"]!=ENVIRON["DATAVISOOL_VALIDATE_BIND"])exit 1}
        else if(t=="3306") {if(fields[p "|published"]!=ENVIRON["DATAVISOOL_VALIDATE_MYSQL_PORT"]||fields[p "|host_ip"]!=ENVIRON["DATAVISOOL_VALIDATE_MYSQL_BIND"])exit 1}
        else exit 1
      }
      password=fields[base "|environment|DB_PASSWORD"];gsub(/[$][$]/,"$",password)
      if(fields[base "|environment|DATAVISOOL_MYSQL_HOST_PORT_ENABLED"]!="1")exit 1
      if(fields[base "|environment|DB_NAME"]!=ENVIRON["DATAVISOOL_VALIDATE_DB_NAME"]||fields[base "|environment|DB_USER"]!=ENVIRON["DATAVISOOL_VALIDATE_DB_USER"]||password!=ENVIRON["DATAVISOOL_VALIDATE_DB_PASSWORD"])exit 1
      for(k in fields)if(index(k,base "|environment|")==1&&k!=base "|environment|JAVA_TOOL_OPTIONS"&&k!=base "|environment|TZ"&&k!=base "|environment|DB_NAME"&&k!=base "|environment|DB_USER"&&k!=base "|environment|DB_PASSWORD"&&k!=base "|environment|DATAVISOOL_MYSQL_HOST_PORT_ENABLED")exit 1
    }
  ' || fail "$(dv_msg 'Docker allinone 包配置必须保留 data/ 和只读应用配置挂载、120 秒停止宽限，以及 .env 指定的应用与 MySQL TCP 端口映射。' 'The all-in-one Compose configuration must retain the data and read-only configuration mounts, 120-second stop grace period, and the application and MySQL TCP port mappings from .env.')"
}

if [ "$mode" != check ]; then
  if [ "$env_source" != "$env_file" ] || [ -n "$updates" ]; then
    work_dir=$(mktemp -d "$run_dir/.env-work.XXXXXX") || fail "$(dv_msg '无法准备配置工作目录。' 'Cannot prepare the configuration working directory.')"
    cp "$env_source" "$work_dir/original" || fail "$(dv_msg '无法读取原配置。' 'Cannot read the original configuration.')"
    printf '%s' "$updates" > "$work_dir/updates"
    awk '
      FILENAME==ARGV[1]{p=index($0,"=");if(p){k=substr($0,1,p-1);values[k]=$0;order[++n]=k}next}
      {line=$0;sub(/\r$/,"",line);if(FNR==1)sub(/^\357\273\277/,"",line);k=line;sub(/^[ \t]*(export[ \t]+)?/,"",k);sub(/[ \t]*=.*/,"",k);if(k in values){print values[k];written[k]=1}else print line}
      END{for(i=1;i<=n;i++)if(!written[order[i]])print values[order[i]]}
    ' "$work_dir/updates" "$work_dir/original" > "$work_dir/env" || fail "$(dv_msg '无法准备新配置。' 'Cannot prepare the new configuration.')"
    env_source=$work_dir/env
    validate_env_lines
    resolved_env=$(probe_environment) || fail "$(dv_msg '新配置解析失败，原配置未修改。' 'The new configuration could not be parsed; the original was not changed.')"
    [ "$(get_value DATAVISOOL_IMAGE)" = "$expected_image" ] && [ "$(get_value DATAVISOOL_PROJECT_NAME)" = "$project" ] || fail "$(dv_msg '新配置与部署身份不一致。' 'The new configuration does not match the deployment identity.')"
    [ "$(get_value DB_NAME)" = "$db_name" ] && [ "$(get_value DB_USER)" = "$db_user" ] && [ "$(get_value DB_PASSWORD)" = "$db_password" ] || fail "$(dv_msg '数据库配置无法无损保存为 dotenv 单行值，原配置未修改。' 'Database settings cannot be saved losslessly as single dotenv lines; the original was not changed.')"
    if [ -e "$env_file" ]; then
      cmp -s "$env_file" "$work_dir/original" || fail "$(dv_msg '.env 已由其他程序修改，请重试。' '.env was changed by another process. Try again.')"
      backup=$env_file.bak.$(date +%Y%m%d%H%M%S).$$
      [ ! -e "$backup" ] || fail "$(dv_msg '配置备份已存在。' 'The configuration backup already exists.')"
      cp "$env_file" "$backup" && chmod 600 "$backup" || fail "$(dv_msg '无法备份配置。' 'Cannot back up the configuration.')"
      printf "$(dv_msg '原 .env 已备份：%s\n' 'Original .env backed up: %s\n')" "$backup"
    fi
    chmod 600 "$work_dir/env" && mv "$work_dir/env" "$env_file" || fail "$(dv_msg '无法保存配置。' 'Cannot save the configuration.')"
    env_source=$env_file
    printf "$(dv_msg 'Docker allinone 包配置已保存；首次启动将使用填写的数据库名称、用户名和密码。\n' 'All-in-one configuration saved; initial startup will use the supplied database name, username and password.\n')"
  fi
  chmod 600 "$env_file" || fail "$(dv_msg '无法保护配置文件权限。' 'Cannot secure configuration file permissions.')"
fi
validate_compose
if [ "$has_identity" = yes ] && find_container && [ "$container_status" = running ]; then
  assert_container_ports
  if [ "$mode" != check ]; then show_status; printf "$(dv_msg '容器已在运行，未重复创建。\n' 'The container is already running; it was not recreated.\n')"; exit 0; fi
fi

image_platform=$(docker_cli image inspect --format '{{.Os}}/{{.Architecture}}' "$expected_image" 2>/dev/null)
if [ -z "$image_platform" ]; then
  [ -f "$package_root/image.tar" ] && [ -r "$package_root/image.tar" ] || fail "$(dv_msg '本地缺少镜像且没有可读取的 image.tar。' 'The image is missing locally and no readable image.tar exists.')"
  if [ "$mode" != check ]; then
    printf "$(dv_msg '正在导入 Docker allinone 包镜像：%s……\n' 'Importing all-in-one package image: %s...\n')" "$expected_image"
    docker_cli load --input "$package_root/image.tar" || fail "$(dv_msg '导入镜像失败。' 'Failed to import the image.')"
    image_platform=$(docker_cli image inspect --format '{{.Os}}/{{.Architecture}}' "$expected_image" 2>/dev/null) || fail "$(dv_msg '导入后仍未找到指定镜像。' 'The specified image was not found after import.')"
  fi
fi
mysql_base=
if [ -n "$image_platform" ]; then
  [ "$image_platform" = "$expected_platform" ] || fail "$(dv_msg '本地镜像架构与 Docker allinone 包不匹配。' 'The local image architecture does not match the all-in-one package.')"
  [ "$(docker_cli image inspect --format '{{ index .Config.Labels "io.datavisool.deployment" }}' "$expected_image" 2>/dev/null)" = allinone ] || fail "$(dv_msg '指定镜像不是包含应用和 MySQL 的 Docker allinone 包镜像。' 'The specified image is not an application and MySQL all-in-one image.')"
  mysql_base=$(docker_cli image inspect --format '{{ index .Config.Labels "io.datavisool.mysql.base" }}' "$expected_image" 2>/dev/null) || fail "$(dv_msg '无法读取 MySQL 基底版本。' 'Cannot read the MySQL base version.')"
  case "$mysql_base" in ''|'<no value>') fail "$(dv_msg 'Docker allinone 包镜像缺少 MySQL 基底版本标签。' 'The all-in-one image is missing its MySQL base version label.')" ;; esac
  if [ "$has_identity" = yes ]; then
    [ "$recorded_mysql_base" = "$mysql_base" ] || fail "$(dv_msg 'MySQL 基底版本与原数据目录记录不同，未启动；请先安排数据库迁移。' 'The MySQL base version differs from the data record; startup was stopped. Arrange a database migration first.')"
  fi
fi
if [ "$mode" = check ]; then
  printf "$(dv_msg '检查通过；未修改配置、导入镜像、创建数据目录或启动容器。\n宿主机数据目录：%s → /data\n' 'Checks passed; no configuration, image, data directory or container was changed.\nHost data directory: %s -> /data\n')" "$data_dir"
  exit 0
fi

if [ "$has_identity" = no ] || [ "$recover_identity" = yes ]; then
  # Record initialization before creating data/ so interruptions can be resumed.
  pending_work=$run_dir/.data.pending.$$
  printf '%s\n' docker-allinone-launcher-v1 "$project" "$package_root" "$docker_endpoint" "$data_dir" "$mysql_base" > "$pending_work" &&
  mv "$pending_work" "$run_dir/data.pending" || fail "$(dv_msg '无法记录首次数据目录创建状态。' 'Cannot record initial data directory creation state.')"
  pending_work=
  printf '%s\n' docker-allinone-launcher-v1 > "$marker" &&
  printf '%s\n' "$package_root" > "$run_dir/deployment.root" &&
  printf '%s\n' "$docker_endpoint" > "$run_dir/docker.endpoint" &&
  printf '%s\n' "$data_dir" > "$run_dir/data.path" &&
  printf '%s\n' "$mysql_base" > "$run_dir/mysql.base" &&
  printf '%s\n' "$project" > "$run_dir/project.name" || fail "$(dv_msg '无法保存 Docker allinone 包实例身份。' 'Cannot save the all-in-one instance identity.')"
  has_identity=yes
fi
if ! inspect_data_dir; then
  [ -f "$run_dir/data.pending" ] || fail "$(dv_msg '已记录的宿主机数据目录丢失，未创建空数据库。' 'The recorded host data directory is missing; no empty database was created.')"
  printf "$(dv_msg '正在创建宿主机数据目录：%s……\n' 'Creating host data directory: %s...\n')" "$data_dir"
  mkdir "$data_dir" || fail "$(dv_msg '数据目录创建失败，记录已保留，可再次运行启动恢复。' 'Failed to create the data directory. Records were retained; restart to resume.')"
  inspect_data_dir || fail "$(dv_msg '创建后无法验证宿主机数据目录。' 'Cannot verify the host data directory after creation.')"
fi
rm -f "$run_dir/data.pending" || fail "$(dv_msg '无法完成数据目录身份记录。' 'Cannot complete the data directory identity record.')"
printf "$(dv_msg '正在后台启动应用和 MySQL，等待健康检查（最多 %s 秒）……\n' 'Starting the application and MySQL and waiting for health checks (up to %s seconds)...\n')" "$wait_timeout"
if ! compose_app up --detach --wait --wait-timeout "$wait_timeout" --pull never app; then
  if find_container; then printf '%s\n' "$container_id" > "$run_dir/container.id"; show_status; fi
  fail "$(dv_msg 'Docker allinone 包未通过健康检查；容器和完整数据目录已保留。请运行 deploy_linux.sh --logs 查看日志。' 'The all-in-one package failed its health check; the container and data were retained. Run deploy_linux.sh --logs.')"
fi
find_container || fail "$(dv_msg 'Compose 返回后未找到当前 Docker allinone 包容器。' 'Compose returned, but the all-in-one container was not found.')"
assert_container_ports
printf '%s\n' "$container_id" > "$run_dir/container.id" || fail "$(dv_msg '无法保存容器 ID。' 'Cannot save the container ID.')"
show_status
[ "$container_status" = running ] && [ "$container_health" = healthy ] || fail "$(dv_msg '应用和数据库尚未健康，请查看 --logs。' 'The application and database are not healthy. Run --logs to inspect logs.')"
printf "$(dv_msg '应用和 MySQL 已启动，可以关闭窗口。\n访问地址：http://localhost:%s（远程访问请使用宿主机地址）\n宿主机数据目录：%s\n日志命令：sh "%s/deploy_linux.sh" --logs\n' 'Application and MySQL started. You may close this window.\nAddress: http://localhost:%s (use the host address for remote access)\nHost data directory: %s\nLog command: sh "%s/deploy_linux.sh" --logs\n')" "$app_port" "$data_dir" "$package_root"
