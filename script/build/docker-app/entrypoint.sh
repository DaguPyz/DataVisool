#!/bin/sh
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
set -eu
for directory in /usr/app/resource /datavisool/server/logs; do
    if [ ! -d "$directory" ] || [ ! -w "$directory" ]; then
        echo "目录不可写：${directory}；请核对 .env 中 APP_UID/APP_GID 与宿主机目录权限。" >&2
        exit 1
    fi
done
if [ ! -r /config/application.yml ]; then
    echo "缺少可读取的 /config/application.yml 配置文件。" >&2
    exit 1
fi
exec java -jar /datavisool/server/server.jar "$@"

