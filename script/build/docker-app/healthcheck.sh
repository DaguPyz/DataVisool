#!/bin/sh
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
set -eu
# Check both frontend delivery and a public backend endpoint.
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/index.html >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/api/security/getEncryptKey >/dev/null

