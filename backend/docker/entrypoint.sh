#!/bin/sh
set -e

echo "=== Running database migrations ==="
python -m migrations.run_all

echo "=== Starting application ==="
exec "$@"

