# EXPLAIN ANALYZE Snapshots

Use this file to track recurring query-plan checks for high-value paths.

## Snapshot template

- Date:
- Environment:
- Dataset notes:
- Prisma schema migration level:

### Query 1: dashboard list (`jobs` by queue/date/status)
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  id,
  payment_intent_id,
  queue_position,
  status,
  makerworks_created_at
FROM "jobs"
WHERE status = 'pending'
ORDER BY queue_position ASC, id ASC
LIMIT 75;
```

- Planning Time:
- Execution Time:
- Rows:
- Buffers:
- Notes:

### Query 2: job detail by payment intent
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM "jobs"
WHERE payment_intent_id = 'pi_example';
```

- Planning Time:
- Execution Time:
- Notes:

### Query 3: source delta read (MakerWorks sync)
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  source.id,
  source."paymentIntentId",
  source."updatedAt"
FROM public."jobs" AS source
WHERE source."updatedAt" > NOW() - INTERVAL '1 day'
ORDER BY source."updatedAt" ASC;
```

- Planning Time:
- Execution Time:
- Notes:
