#!/bin/sh
set -e

# Run database migrations
npx prisma migrate deploy 2>/dev/null || echo "Migration skipped (may already be applied)"

# Execute the main command
exec "$@"
