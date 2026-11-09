#!/usr/bin/env python3
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
"""Patch the pinned MySQL entrypoint to safely consume runtime-escaped passwords."""

from __future__ import annotations

import sys
from pathlib import Path


PATCHES = (
    ("IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}'", "IDENTIFIED BY '${MYSQL_ROOT_PASSWORD_SQL}'", 2),
    ('password="${MYSQL_ROOT_PASSWORD}"', 'password="${MYSQL_ROOT_PASSWORD_CLIENT}"', 1),
    ("docker_process_sql --dont-use-mysql-root-password --database=mysql <<-EOSQL\n",
     "docker_process_sql --dont-use-mysql-root-password --database=mysql 2>/dev/null <<-EOSQL\n", 1),
    ("IDENTIFIED BY '$MYSQL_PASSWORD' ;", "IDENTIFIED BY '$MYSQL_PASSWORD_SQL' ;", 1),
    ("docker_process_sql --database=mysql <<<\"CREATE USER '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD_SQL' ;\"",
     "docker_process_sql --database=mysql 2>/dev/null <<<\"CREATE USER '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD_SQL' ;\"", 1),
)


def patch_entrypoint(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if "MYSQL_ROOT_PASSWORD_SQL" in source or "MYSQL_PASSWORD_SQL" in source:
        raise RuntimeError("MySQL entrypoint already contains the DataVisool password patch")

    updated = source
    for original, replacement, expected_count in PATCHES:
        count = updated.count(original)
        if count != expected_count:
            raise RuntimeError(
                f"unsupported MySQL entrypoint: expected {expected_count} occurrence(s) "
                f"of a required password-handling fragment, found {count}"
            )
        updated = updated.replace(original, replacement)

    path.write_text(updated, encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: patch-mysql-entrypoint.py ENTRYPOINT", file=sys.stderr)
        return 2
    try:
        patch_entrypoint(Path(argv[1]))
    except (OSError, RuntimeError) as exc:
        print(f"MySQL entrypoint password patch failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
