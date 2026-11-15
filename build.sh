#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$project_dir/src/scripts/build_site.py" "${1:-$project_dir/site}"
