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

The repo ships with a multi-stage `Dockerfile` that builds a production image suitable for Unraid or any Docker host. The image runs database migrations on every start (set `SKIP_DB_MIGRATE=1` to skip).

Build the image:

```bash
docker build -t orderworks:latest .
```

Run migrations manually (optional because the entrypoint runs them automatically):

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public" \
  orderworks:latest npm run db:migrate
```

Start the container (example Unraid template command):

```bash
docker run -d \
  --name orderworks \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/orderworks?schema=public" \
  -e MAKERWORKS_WEBHOOK_SECRET="super-secret-token" \
  orderworks:latest
```

Expose the mapped port through Unraid's web UI and configure the two environment variables in the container template so MakerWorks webhook requests can be validated and the Prisma client can reach Postgres.

## API reference

### POST `/api/makerworks/jobs`

Ingests MakerWorks job payloads. Requests must include `Authorization: Bearer <MAKERWORKS_WEBHOOK_SECRET>`.

Payload fields accepted:

- `id` (string, MakerWorks job id)
- `paymentIntentId` (string)
- `totalCents` (number or numeric string)
- `currency` (string ISO currency code)
- `lineItems` (array)
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

All API responses are JSON. Validation errors return HTTP 422 with details.

## Admin UI

Navigate to the root path `/` to view the OrderWorks admin dashboard:

- Filter jobs by status or MakerWorks creation date.
- Inspect line items, shipping details, and metadata on each job.
- Reorder the live job queue by using the ↑ / ↓ buttons in the table; queue position is shown for every job and can be adjusted to prioritize work.
- Open a job detail view (`/jobs/:paymentIntentId`) to review all data and mark the job complete.

## MakerWorks configuration

Configure the MakerWorks webhook to point at your deployment:

- `ORDERWORKS_WEBHOOK_URL` â†’ `https://orderworks.example.com/api/makerworks/jobs`
- `ORDERWORKS_WEBHOOK_SECRET` â†’ value matching `MAKERWORKS_WEBHOOK_SECRET`

MakerWorks will send payloads to the webhook endpoint. OrderWorks validates the shared secret before storing or updating jobs.




