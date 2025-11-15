#!/bin/sh
set -e

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  echo "Applying Prisma migrations..."
  npm run db:migrate
fi

exec "$@"
