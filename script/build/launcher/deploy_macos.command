#!/bin/sh
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.

script_path=$0
case "$script_path" in
  */*) ;;
  *) script_path=$(command -v "$script_path") || exit 1 ;;
esac
script_dir=${script_path%/*}
[ "$script_dir" != "$script_path" ] || script_dir=.
case "$script_dir" in
  -*) script_dir=./$script_dir ;;
esac
script_dir=$(CDPATH= cd -P "$script_dir" 2>/dev/null && pwd -P) || exit 1

/bin/sh "$script_dir/deploy_linux.sh" "$@"
status=$?
if [ "$#" -eq 0 ] && [ "$status" -ne 0 ] && [ -t 0 ] && [ -t 1 ]; then
  case "${DATAVISOOL_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in
    [Ee][Nn]*) printf '\nDeployment failed. Press Enter to close this window.' ;;
    *) printf '\n部署失败，按回车键关闭窗口。' ;;
  esac
  IFS= read -r _
fi
exit "$status"
