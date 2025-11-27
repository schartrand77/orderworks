# Deploying OrderWorks on Unraid

The repo ships with an Unraid Community Applications template (`unraid/orderworks.xml`). Use it with an OrderWorks container image that you either build locally or publish to your registry (the template defaults to `ghcr.io/schartrand77/orderworks:latest`).

## 1. Build/push the container image (one-time)

```bash
# Build the multi-arch image on a workstation
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/schartrand77/orderworks:latest .

# Authenticate once and push (GHCR shown)
echo $GHCR_TOKEN | docker login ghcr.io -u schartrand77 --password-stdin
docker push ghcr.io/schartrand77/orderworks:latest
```

Skip the push step if you plan to build directly on the Unraid host and use a `localhost/orderworks:latest` tag. Update the template's Repository field accordingly.

## 2. Register the template repo in Unraid

1. Open the **Apps** tab.
2. Click the **three-dot menu** icon > **Manage Template Repositories**.
3. Add `https://github.com/schartrand77/orderworks` as a new repo. Unraid will automatically look under `/unraid` for XML templates.
4. The **OrderWorks** template now appears under **Apps > Installed Apps > Containers** (or search for it).

## 3. Configure environment variables

When adding the container, fill in the template inputs:

- **Database URL** - PostgreSQL connection string from inside the container. If you deploy the official Postgres template and name it `orderworks-db`, a typical string is `postgresql://orderworks:orderworks@orderworks-db:5432/orderworks?schema=public`.
- **MakerWorks Webhook Secret** - Must match the secret you configure in MakerWorks and is used for both the Bearer token and the `X-MakerWorks-Signature` HMAC header.
- **Web UI Port** - Defaults to `3000`. Map it to any host port you prefer.
- **Email settings** - (optional) Provide either a Resend API key or the SMTP host/port/credentials to enable completion receipts. Leave blank to disable emailing.
- **Skip DB Migrate** - Leave at `0` to let the container apply Prisma migrations on start. Set to `1` once you manage migrations elsewhere.

The template stores the values in Unraid's Docker configuration so you do not need a `.env` file on the host.

## 4. Deploy Postgres

Install the official Postgres template (Apps > search for *postgres*). Suggested defaults:

- Database name/user/password: `orderworks`
- Host port: `5432` (bridge network)
- Volume: map `/var/lib/postgresql/data` to `/mnt/user/appdata/postgres-orderworks`

Wait for the database container to start before launching OrderWorks.

## 5. Start OrderWorks

- Click **Apply** on the OrderWorks template.
- Confirm logs show `Applying Prisma migrations...` followed by `ready - started server`. The UI becomes available at `http://UNRAID-IP:HOST_PORT`.

To update, push a new image tag and click **Update** on the container or enable Unraid's auto-update plugin.

