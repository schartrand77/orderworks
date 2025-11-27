# OrderWorks

OrderWorks ingests MakerWorks fabrication job forms, persists them in Postgres, and provides an admin dashboard for reviewing and
 completing work.

## Prerequisites

- Node.js 20+
- PostgreSQL database accessible via a connection string

## Environment variables

Create a `.env` file (or set environment variables in your deployment platform) with:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public"
MAKERWORKS_WEBHOOK_SECRET="super-secret-token"
RECEIPT_FROM_EMAIL="MakerWorks Receipts <no-reply@makerworks.app>"
RECEIPT_REPLY_TO_EMAIL="MakerWorks <info@makerworks.app>"
# Resend transport (optional)
RESEND_API_KEY=""
# SMTP transport (optional; use if not configuring Resend)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="smtp-username"
SMTP_PASSWORD="smtp-password"
SMTP_SECURE="false"
```

The same `MAKERWORKS_WEBHOOK_SECRET` must be configured in MakerWorks when registering the webhook. Provide `RECEIPT_FROM_EMAIL` plus either `RESEND_API_KEY` or the SMTP variables to enable receipt emails whenever a job is marked as completed. Leave `RESEND_API_KEY` blank if you plan to send mail only via SMTP. Set `RECEIPT_REPLY_TO_EMAIL` if replies should route to a different mailbox (e.g., `info@makerworks.app`).

## Install dependencies

```bash
npm install
```

## Database migrations & Prisma client

Generate the Prisma client (required after cloning or changing the schema):

```bash
npm run db:generate
```

Apply migrations to your database:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public" npm run db:migrate
```

The project ships with an initial migration (`prisma/migrations`) that creates the `jobs` table and associated enum.

## Sample data

Seed a sample MakerWorks job (id `makerworks-sample-job`) that you can inspect in the UI:

```bash
npm run seed:sample
```

The command is idempotent, so you can re-run it any time to reset the sample job's data.

## Development server

Start the Next.js server:

```bash
npm run dev
```

The admin UI and API will be available at [http://localhost:3000](http://localhost:3000).

## Docker Compose (local dev)

If you prefer to run everything in containers during development, use the provided `docker-compose.yml` to run the Next.js dev server and a local Postgres instance:

```bash
docker compose up --build
```

This starts:

- `app` — `node:20` container running `npm run dev` with your working tree bind-mounted for hot reloads. It automatically runs `npm install`, `npm run db:generate`, and `npm run db:migrate` before the dev server launches, so the schema is applied. The server listens on port `3000` in the container and is exposed at [http://localhost:3001](http://localhost:3001).
- `db` — PostgreSQL 16 with credentials `orderworks` / `orderworks`, exposed at `localhost:5433`, and data persisted in the `postgres-data` volume.

Environment variables (e.g., `DATABASE_URL`, default `MAKERWORKS_WEBHOOK_SECRET=dev-secret`) live inside `docker-compose.yml`; tweak them there if needed. Stop the stack with:

```bash
docker compose down
```

Add `-v` if you want to reset the Postgres volume between runs.

## Docker / Unraid deployment

The repo ships with a multi-stage `Dockerfile` that produces a production image suitable for Unraid or any Docker host. The `docker-entrypoint.sh` script applies Prisma migrations on every start—set `SKIP_DB_MIGRATE=1` if you manage migrations separately.

### Build the image

```bash
docker build -t orderworks:latest .
```

### (Optional) run migrations manually

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public" \
  orderworks:latest npm run db:migrate
```

### Start the container

```bash
docker run -d \
  --name orderworks \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public" \
  -e MAKERWORKS_WEBHOOK_SECRET="super-secret-token" \
  orderworks:latest
```

Configure additional email-related variables if you want completion receipts sent from the container.

### Unraid Community Applications template

An Unraid CA template lives at [`unraid/orderworks.xml`](unraid/orderworks.xml). Add this repository as a template source inside Unraid (**Apps > menu > Manage Template Repositories > Add `https://github.com/schartrand77/orderworks`**) and the OrderWorks template will appear in the Apps tab. Fill in the `DATABASE_URL`, `MAKERWORKS_WEBHOOK_SECRET`, and any optional email variables when creating the container.

The template defaults to pulling `ghcr.io/schartrand77/orderworks:latest`; update the repository tag if you publish the image elsewhere. Detailed Unraid setup notes (building/pushing the image, Postgres pairing, variable descriptions, etc.) live in [`docs/unraid.md`](docs/unraid.md).

## API reference

### POST `/api/makerworks/jobs`

Ingests MakerWorks job payloads. Requests must include both `Authorization: Bearer <MAKERWORKS_WEBHOOK_SECRET>` and `X-MakerWorks-Signature: sha256=<HMAC>` where the HMAC value is the SHA-256 digest of the exact JSON body using the shared secret as the key.

Payload fields accepted:

- `id` (string, MakerWorks job id)
- `paymentIntentId` (string)
- `totalCents` (number or numeric string)
- `currency` (string ISO currency code)
- `lineItems` (array of objects: `{ description, quantity, unitPriceCents, ... }`)
- `shipping` (object, optional)
- `metadata` (object, optional)
- `userId` (string, optional)
- `customerEmail` (string email, optional)
- `createdAt` (ISO timestamp)

The endpoint creates or updates the stored job record and returns the persisted job JSON.

### GET `/api/jobs`

Lists stored jobs with optional filters:

- `status` – one of `pending`, `printing`, `completed`. Multiple values can be supplied via repeated parameters or comma separation.
- `createdFrom` / `createdTo` – ISO date strings used to bound the MakerWorks `createdAt` timestamp.

### GET `/api/jobs/:paymentIntentId`

Returns the stored job for the given payment intent id.

### PATCH `/api/jobs/:paymentIntentId`

Updates a job's status (pending, printing, or completed) plus optional `invoiceUrl` and `notes`. When the status transitions to `completed`, a receipt email is sent to the job's `customerEmail`.

```json
{
  "status": "completed",
  "invoiceUrl": "https://invoices.example.com/123",
  "notes": "Optional completion notes"
}
```

Omit `invoiceUrl` or send an empty string to leave it unchanged/clear it. Requests missing a customer email or the required email environment variables will fail when attempting to complete a job.

### DELETE `/api/jobs/:paymentIntentId`

Permanently deletes the specified job and compacts the remaining queue positions. Use this to remove test data or duplicate MakerWorks submissions. Returns HTTP 200 with `{ "deleted": true }` when successful.

### GET `/api/makerworks/status`

Returns the most recent MakerWorks ingestion timestamp plus a `connected`/`waiting`/`stale` indicator. This powers the dashboard badge.

### GET `/api/makerworks/health`

Provides a superset of the status payload that also includes webhook event counters, last event time, and total jobs stored. Use this for external health checks or uptime monitors.

### HEAD `/api/makerworks/health`

Same as the GET endpoint but without a response body, suitable for lightweight probes.

All API responses are JSON. Validation errors return HTTP 422 with details.

## Admin UI

Navigate to the root path `/` to view the OrderWorks admin dashboard:

- Filter jobs by status or MakerWorks creation date.
- Inspect line items, shipping details, and metadata on each job.
- Reorder the live job queue by using the ↑ / ↓ buttons in the table; queue position is shown for every job and can be adjusted to prioritize work.
- Open a job detail view (`/jobs/:paymentIntentId`) to review all data and mark the job complete.
- Delete a job entirely from the detail view if it was created in error or is no longer needed.

## MakerWorks configuration

Configure the MakerWorks webhook to point at your deployment:

- `ORDERWORKS_WEBHOOK_URL` - `https://orderworks.example.com/api/makerworks/jobs`
- `ORDERWORKS_WEBHOOK_SECRET` - value matching `MAKERWORKS_WEBHOOK_SECRET`

MakerWorks must send both the Bearer token and HMAC signature headers:

1. `Authorization: Bearer <MAKERWORKS_WEBHOOK_SECRET>`
2. `X-MakerWorks-Signature: sha256(HMAC(secret, raw_body))`

OrderWorks validates both headers before storing or updating jobs.




