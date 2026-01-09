# OrderWorks

OrderWorks syncs MakerWorks fabrication jobs from Postgres, stores queue metadata in the `orderworks` schema, and provides an admin
dashboard and API for reviewing and completing work.

## Prerequisites

- Node.js 20+
- PostgreSQL 15.x database accessible via a connection string (OrderWorks targets the MakerWorks stack, which runs Postgres 15. It also works on newer versions, but we test against 15 to ensure compatibility.)

## Environment variables

Create a `.env` file (or set environment variables in your deployment platform) with the variables below.

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/makerworks?schema=orderworks"
DOCKER_DATABASE_URL="postgresql://postgres:postgres@db:5432/makerworks?schema=orderworks"
ADMIN_USERNAME="admin@example.com"
ADMIN_PASSWORD="change-me"
ADMIN_SESSION_SECRET="long-random-secret"
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
# Optional - skip auto-migrations in docker-entrypoint.sh
SKIP_DB_MIGRATE="0"
```

OrderWorks reads jobs directly from the MakerWorks Postgres database and keeps its own copy (plus queue metadata) inside the
`orderworks` schema. No webhook is required; point `DATABASE_URL` (and `DOCKER_DATABASE_URL` for Docker Compose) at MakerWorks.
Provide `RECEIPT_FROM_EMAIL` plus either `RESEND_API_KEY` or the SMTP variables to enable receipt emails when a job is marked
completed. Set `RECEIPT_REPLY_TO_EMAIL` if replies should route to a different mailbox (for example, `info@makerworks.app`).

`DATABASE_URL` points the Next.js dev server at Postgres listening on `localhost:5432`. Running `docker compose up` starts a bundled
Postgres container that exposes this port (and automatically creates the `orderworks` schema via
`docker/postgres-init/01-orderworks-schema.sql`), so the default connection string works out of the box. `DOCKER_DATABASE_URL` is
only used by `docker-compose.yml`; it defaults to the Compose `db` service but you can override it if you need the dev container to
talk to the real MakerWorks database on your network. `ADMIN_USERNAME` and `ADMIN_PASSWORD` gate access to the dashboard and
admin-only API routes. `ADMIN_SESSION_SECRET` signs the session cookie; change it any time you need to invalidate existing logins.

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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/makerworks?schema=orderworks" npm run db:migrate
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

If you prefer to run everything in containers during development, use the provided `docker-compose.yml` to run the Next.js dev server while sharing the MakerWorks v2 database:

```bash
docker compose up --build
```

This starts two services:

- `db` - PostgreSQL `15-alpine` container seeded with a `makerworks` database and an `orderworks` schema (via files in `docker/postgres-init`). The data directory persists through `postgres-data` volume. Postgres is published on [localhost:5432](http://localhost:5432) so the local Next.js server (`npm run dev`) and psql clients can connect without extra configuration. Using Postgres 15 keeps the dockerized workflow aligned with the MakerWorks stack so migrations behave the same in both places.
- `app` - `node:20` container running `npm run dev` with your working tree bind-mounted for hot reloads. It automatically runs `npm install`, `npm run db:generate`, and `npm run db:migrate` before the dev server launches, so the schema is applied. The server listens on port `3000` in the container and is exposed at [http://localhost:3001](http://localhost:3001).

The default experience is fully self-contained: `app` talks to the `db` service via `DOCKER_DATABASE_URL`, and your local tools point at the same Postgres instance with `DATABASE_URL`. If you want the dev container to use the real MakerWorks database instead, override `DOCKER_DATABASE_URL` in `.env` to point at that server (you can also keep the bundled Postgres running locally for non-container dev). When targeting an external MakerWorks instance, ensure the `orderworks` schema exists once with `CREATE SCHEMA IF NOT EXISTS orderworks;` so Prisma can migrate without colliding with MakerWorks enums/tables.

Environment variables live inside `.env` and `docker-compose.yml`; tweak them there if needed. Stop the stack with:

```bash
docker compose down
```

## Docker / Unraid deployment

The repo ships with a multi-stage `Dockerfile` that produces a production image suitable for Unraid or any Docker host. The `docker-entrypoint.sh` script applies Prisma migrations on every start—set `SKIP_DB_MIGRATE=1` if you manage migrations separately.

### Build the image

```bash
docker build -t orderworks:latest .
```

### (Optional) run migrations manually

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/makerworks?schema=orderworks" \
  orderworks:latest npm run db:migrate
```

### Start the container

```bash
docker run -d \
  --name orderworks \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/makerworks?schema=orderworks" \
  orderworks:latest
```

Configure additional email-related variables if you want completion receipts sent from the container.

### Unraid Community Applications template

An Unraid CA template lives at [`unraid/orderworks.xml`](unraid/orderworks.xml). Add this repository as a template source inside Unraid (**Apps > menu > Manage Template Repositories > Add `https://github.com/schartrand77/orderworks`**) and the OrderWorks template will appear in the Apps tab. Fill in the `DATABASE_URL` and any optional email variables when creating the container.

The template defaults to pulling `ghcr.io/schartrand77/orderworks:latest`; update the repository tag if you publish the image elsewhere. Detailed Unraid setup notes (building/pushing the image, Postgres pairing, variable descriptions, etc.) live in [`docs/unraid.md`](docs/unraid.md).

## MakerWorks database synchronization

OrderWorks connects to the same Postgres instance that powers MakerWorks. MakerWorks stores jobs in `public.jobs`; OrderWorks keeps
its own working copy (with queue and fulfillment metadata) inside `orderworks.jobs`. On startup and whenever an admin hits the
dashboard or job APIs, OrderWorks compares the latest `public.jobs.updatedAt` timestamp with what it has already synced. New or
modified MakerWorks rows are copied over automatically; no webhook or additional HTTP access is required. Older MakerWorks installs
only need to ensure the Postgres role used by OrderWorks can `SELECT` from `public.jobs`.

OrderWorks never mutates the MakerWorks tables. Queue position, fulfillment status, payment annotations, and notes all live
exclusively in the `orderworks` schema. MakerWorks remains responsible for creating jobs; OrderWorks reads them as soon as they
appear in the database.

## StockWorks integration

StockWorks can surface the OrderWorks queue so inventory and production stay aligned:

- If StockWorks points its `DATABASE_URL` at the same MakerWorks Postgres instance, it reads from `orderworks.jobs` directly and the
  Orders tab populates automatically.
- If StockWorks cannot reach the database (for example it remains on SQLite), it can pull from the OrderWorks HTTP API instead. In
  that case configure StockWorks with `ORDERWORKS_BASE_URL` plus the OrderWorks `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

OrderWorks does not require any extra environment variables for StockWorks.

## API reference

### GET `/api/jobs`

Lists stored jobs with optional filters:

- `status` – one of `pending`, `printing`, `completed`. Multiple values can be supplied via repeated parameters or comma separation.
- `createdFrom` / `createdTo` – ISO date strings used to bound the MakerWorks `createdAt` timestamp.

### GET `/api/jobs/:paymentIntentId`

Returns the stored job for the given payment intent id.

### PATCH `/api/jobs/:paymentIntentId`

Updates a job's status (pending, printing, or completed) along with optional `notes` and `fulfillmentStatus`. When the status transitions to `completed`, a receipt email is sent to the job's `customerEmail`.

```json
{
  "status": "completed",
  "notes": "Optional completion notes",
  "fulfillmentStatus": "shipped"
}
```

Requests missing a customer email or the required email environment variables will fail when attempting to complete a job.

### DELETE `/api/jobs/:paymentIntentId`

Permanently deletes the specified job and compacts the remaining queue positions. Use this to remove test data or duplicate MakerWorks submissions. Returns HTTP 200 with `{ "deleted": true }` when successful.

### GET `/api/makerworks/status`

For administrators only. Returns the most recent MakerWorks job timestamp plus a `connected`/`waiting`/`stale` indicator. The endpoint triggers a background sync from `public.jobs` before responding so the status always reflects the source database. This powers the dashboard badge.

### GET `/api/makerworks/health`

Provides a superset of the status payload that includes OrderWorks job totals, the last MakerWorks `updatedAt` timestamp observed, and the latest successful sync time. Use this for external health checks or uptime monitors.

### HEAD `/api/makerworks/health`

Same as the GET endpoint but without a response body, suitable for lightweight probes.

All API responses are JSON. Validation errors return HTTP 422 with details.

## Admin UI

Navigate to the root path `/` to view the OrderWorks admin dashboard:

- Filter jobs by status or MakerWorks creation date.
- Inspect line items, shipping details, and metadata on each job.
- Reorder the live job queue by using the Move Up / Move Down controls in the table; queue position is shown for every job and can be adjusted to prioritize work.
- Open a job detail view (`/jobs/:paymentIntentId`) to review all data and mark the job complete.
- Use **Send to slicer** to launch Bambu Studio on the workstation viewing the dashboard; the `bambu-studio://` link is handled entirely by the browser/OS, so nothing inside the container (or server) ever touches your slicer.
- Delete a job entirely from the detail view if it was created in error or is no longer needed.

Visit `/login` to authenticate with the configured admin credentials. Sessions last 12 hours by default; logging out or rotating `ADMIN_SESSION_SECRET` immediately revokes access.

## PWA / Home screen install

OrderWorks is installable as a home screen app (PWA) when served from a secure context:

- Works on `http://localhost` during development.
- Requires `https://` in production (opening `http://SERVER-IP:PORT` will not offer install in Chrome/Safari).

If you are behind a reverse proxy/ingress, ensure it terminates TLS and forwards `X-Forwarded-Proto: https` so auth cookies are marked `Secure`.

## MakerWorks configuration

Because OrderWorks now syncs directly from the MakerWorks database, the only MakerWorks-side change required is granting the OrderWorks Postgres user read access to `public.jobs`. (The default `postgres` superuser already has this.) Remove any previously configured MakerWorks webhooks that pointed at OrderWorks-new jobs will appear automatically as soon as they are saved inside MakerWorks.
