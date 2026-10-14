#!/bin/sh
# Aplica as migrations pendentes antes de subir a API (idempotente).
set -e
node dist/db/migrate.js
exec node --enable-source-maps dist/index.js
