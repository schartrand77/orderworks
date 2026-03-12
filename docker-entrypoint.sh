#!/bin/sh
set -e

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  echo "Applying Prisma migrations..."
  if ! npm run db:migrate; then
    echo "Prisma migrations failed."
    echo "If this is P3009, resolve the failed migration and retry:"
    echo "  npx prisma migrate resolve --rolled-back <failed_migration_name>"
    echo "  npm run db:migrate"

    if [ "${PRISMA_AUTO_RESOLVE_FAILED_MIGRATIONS:-0}" = "1" ] && [ -n "${PRISMA_FAILED_MIGRATION_NAME:-}" ]; then
      echo "Auto-resolving failed migration ${PRISMA_FAILED_MIGRATION_NAME} as rolled back..."
      npx prisma migrate resolve --rolled-back "${PRISMA_FAILED_MIGRATION_NAME}"
      npm run db:migrate
    else
      exit 1
    fi
  fi
fi

exec "$@"
