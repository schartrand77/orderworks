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
```

The same `MAKERWORKS_WEBHOOK_SECRET` must be configured in MakerWorks when registering the webhook.

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

## Development server

Start the Next.js server:

```bash
npm run dev
```

The admin UI and API will be available at [http://localhost:3000](http://localhost:3000).

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

- `status` – one of `new`, `processing`, `done`. Multiple values can be supplied via repeated parameters or comma separation.
- `createdFrom` / `createdTo` – ISO date strings used to bound the MakerWorks `createdAt` timestamp.

### GET `/api/jobs/:paymentIntentId`

Returns the stored job for the given payment intent id.

### POST `/api/jobs/:paymentIntentId/complete`

Marks the job as `done` and records optional `invoiceUrl` + `notes`. Request body:

```json
{
  "invoiceUrl": "https://invoices.example.com/123",
  "notes": "Optional completion notes"
}
```

Omit `invoiceUrl` or send an empty string to leave it unchanged/clear it.

All API responses are JSON. Validation errors return HTTP 422 with details.

## Admin UI

Navigate to the root path `/` to view the OrderWorks admin dashboard:

- Filter jobs by status or MakerWorks creation date.
- Inspect line items, shipping details, and metadata on each job.
- Open a job detail view (`/jobs/:paymentIntentId`) to review all data and mark the job complete.

## MakerWorks configuration

Configure the MakerWorks webhook to point at your deployment:

- `ORDERWORKS_WEBHOOK_URL` → `https://orderworks.example.com/api/makerworks/jobs`
- `ORDERWORKS_WEBHOOK_SECRET` → value matching `MAKERWORKS_WEBHOOK_SECRET`

MakerWorks will send payloads to the webhook endpoint. OrderWorks validates the shared secret before storing or updating jobs.

