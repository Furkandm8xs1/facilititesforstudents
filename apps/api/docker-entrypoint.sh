#!/bin/sh
set -eu

node dist/scripts/migrate.js
exec node dist/src/main.js
