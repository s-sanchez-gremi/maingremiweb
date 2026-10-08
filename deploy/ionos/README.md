# Setting up Apex on IONOS Cloud

Architecture (one environment): **a Linux server** runs Docker (the app + Caddy for HTTPS) · **IONOS Managed PostgreSQL**
holds the data · **IONOS S3 Object Storage** holds the files (three buckets) · **IONOS mail** sends the form e-mails.

> **Verification status.** The app, image, deploy script (with automatic rollback), backup and restore drill are tested
> locally (`pnpm verify`, `scripts/deploy-drill.sh`, `scripts/backup-drill.sh`). The steps below that happen **inside IONOS**
> are written from IONOS's documentation and have **not** been run against your account: console labels may differ and a few
> details (marked ⚠) must be confirmed on the first run. Do them together with the person who has the IONOS login.

## 0. Decide first
- **Location (decided): Logroño, Spain** (`es/vit`; S3 region `eu-south-2`). ⚠ S3 in Logroño is documented; before creating anything confirm in the
  IONOS console that Cloud servers **and** Managed PostgreSQL are also offered in Logroño. If the managed database is not, fall back to Frankfurt for
  *everything* (server and database must share a data center; S3 region `de`) and change the endpoint/region values.
- **Staging (decided): the cheaper alternative.** Staging runs on its **own small server** with **PostgreSQL in Docker** (`deploy/compose.staging.yml`,
  `deploy/ionos/staging.env.example`), no managed database. Production uses the managed database (`deploy/compose.yml`). Use **separate S3 buckets and
  separate S3 keys** for staging, and only test data in staging. Follow sections 1, 3, 4, 5, 6, 7 for staging too and **skip section 2** (the database
  is the container); the staging database is backed up by the same `backup.sh` (`DOCKER_NETWORK=apex-staging_default`, `DATABASE_URL` pointing at host `db`).
- **Names**: S3 bucket names are global across IONOS: use a unique prefix (`yourprefix-apex-media`, `-private`, `-backups`).

## 1. Network and server
1. In the IONOS **Data Center Designer**, create a virtual data center in the chosen location.
2. Add a **private LAN**, then a **Linux server** (Ubuntu 24.04 LTS; 2 vCPU / 4 GB RAM is enough to start) attached to that LAN,
   with a **reserved public IP** and your **SSH public key** (no password logins).
3. Firewall (IONOS firewall and/or `ufw` on the server): allow **22** (only from your office/VPN if possible), **80**, **443**; nothing else.
4. Note the server's public IP.

## 2. Managed PostgreSQL
1. Create a **PostgreSQL cluster** in the same data center, attached to the **same private LAN** (give it a private address, e.g. `10.0.0.10/24`).
   Use the newest version offered (Apex is tested on 17; ⚠ confirm which versions IONOS offers: 15+ works).
2. Create the database `apex` and a user `apex_app`. ⚠ Confirm this user may create tables (migrations need it) — the owner role created with the cluster usually does.
2b. **Optional but recommended — one database user per app:** as the owner create five more roles, `create role apex_web login password '…'; create role apex_admin login password '…'; create role apex_crm login password '…'; create role apex_forms login password '…'; create role apex_sign login password '…';` (⚠ confirm the owner may create roles on IONOS Managed PostgreSQL), then use `DATABASE_URL_WEB` / `DATABASE_URL_ADMIN` / `DATABASE_URL_CRM` and a `.env.migrate` with the owner's URL as described in `DEPLOY.md` ("Database users per app"). Permissions are in `db/grants.sql`.
3. Connection string: `postgres://apex_app:PASSWORD@10.0.0.10:5432/apex?sslmode=require` (**keep `sslmode=require`**: production refuses to start without it).
4. Turn on IONOS's own backups / point-in-time recovery. They are **in addition** to our independent backup (section 6).

## 3. S3 buckets and keys
1. Create **object storage access keys** (one pair for the app, a *separate* pair for backups).
2. Create three buckets in the same region: `…-media`, `…-private`, `…-backups`. Endpoints / regions:
   | Location | Endpoint | `S3_REGION` |
   |---|---|---|
   | Frankfurt | `https://s3-eu-central-1.ionoscloud.com` | `de` |
   | Berlin | `https://s3-eu-central-2.ionoscloud.com` | `eu-central-2` |
   | Logroño | `https://s3-eu-south-2.ionoscloud.com` | `eu-south-2` |
3. Make **only the media bucket** publicly readable, with `deploy/ionos/media-bucket-policy.json` (edit the bucket name), for example:
   `aws s3api put-bucket-policy --endpoint-url <endpoint> --bucket yourprefix-apex-media --policy file://media-bucket-policy.json`.
   ⚠ Confirm IONOS accepts this policy form (otherwise use its console's public-read setting). **`-private` and `-backups` must stay private.**
4. ⚠ The app uses path-style addresses (`https://endpoint/bucket/key`). If an upload or an image fails on the first test, set `S3_FORCE_PATH_STYLE=0`.
5. Backup bucket: add a lifecycle rule to expire objects after 30–60 days (the backup script also prunes).

## 4. Domain, mail
- DNS: an **A record** for `www.yourdomain` (and the bare domain) to the server's public IP. Wait until it resolves before the first start (Caddy needs it to get the certificate).
- Mail: create a mailbox such as `no-reply@yourdomain`, use IONOS's SMTP host and port 587 (see `production.env.example`). ⚠ Send one test form to check delivery; also set SPF/DKIM DNS records per IONOS so messages do not land in spam.

## 5. Prepare the server (once)
```
ssh root@SERVER
adduser --disabled-password --gecos "" deploy
# Docker engine: follow https://docs.docker.com/engine/install/ubuntu/ (apt repository), then:
usermod -aG docker deploy
apt install -y unattended-upgrades ufw && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
mkdir -p /srv/apex/production && chown deploy:deploy /srv/apex/production
# allow the deploy user to log in with the CI key: append its PUBLIC key to /home/deploy/.ssh/authorized_keys
```
Then as `deploy`: create `/srv/apex/production/.env` from `production.env.example` and `backup.env` from `backup.env.example`
(`chmod 600` both). Log the server in to the image registry once: `echo TOKEN | docker login ghcr.io -u USER --password-stdin`
(a read-only package token).

## 5b. DNS and three apps
Three A records point at the server: `DOMAIN` (the website), `ADMIN_DOMAIN` (e.g. `admin.example.com`, the CMS admin) and `CRM_DOMAIN` (e.g. `crm.example.com`, the CRM app and client portal); all get a certificate from Caddy. Set `ADMIN_DOMAIN`, `CRM_DOMAIN`, `WEB_INTERNAL_URL=http://web:3000`, `CRM_URL`, `WEB_ADMIN_URL=https://ADMIN_DOMAIN`, `ADMIN_URL=https://ADMIN_DOMAIN`, `WEB_PREVIEW_URL=https://DOMAIN` and `SESSION_COOKIE_DOMAIN=<your domain>` (web and admin) in `.env` (see `production.env.example`). Put `ADMIN_ALLOWED_IPS` (office/VPN) in `.env` before the first login: it applies to both admins. Release one app only with `./deploy.sh <tag> web|admin|crm` (or the workflow's *only* input).

## 6. GitHub
Create the repository, push, and in **Settings → Environments** create `staging` and `production` (add **required reviewers** to production).
For each, add secrets: `DEPLOY_HOST`, `DEPLOY_USER` (`deploy`), `DEPLOY_DIR` (`/srv/apex/production`), `DEPLOY_SSH_KEY` (private key of a
deploy-only key pair) and `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan -t ed25519 SERVER_IP`, checked against the server's real fingerprint).
After that: **merging to `main` → CI → image → staging automatically**; **production = Actions → Release → Run workflow → tag → approve**.

## 7. First start and checks
1. First time only, deploy by hand: copy `deploy/compose.yml`, `Caddyfile`, `deploy.sh`, `warm.sh`, `backup.sh`, `restore-drill.sh` to the server directory and run
   `APEX_IMAGE=ghcr.io/OWNER/REPO ./deploy.sh sha-XXXXXXX`. Put `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` in `.env` for this first start only, then delete them.
2. Scheduler (as `deploy`, `crontab -e`):
   ```
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $(grep ^CRON_SECRET /srv/apex/production/.env | cut -d= -f2)" https://DOMAIN/api/cron/tick >/dev/null
   * * * * *   curl -fsS -X POST -H "Authorization: Bearer $(grep ^CRON_SECRET /srv/apex/production/.env | cut -d= -f2)" https://CRM_DOMAIN/api/cron/tick >/dev/null
   */5 * * * * cd /srv/apex/production && SITE_URL=https://DOMAIN ./warm.sh >/dev/null
   30 3 * * *  BACKUP_ENV=/srv/apex/production/backup.env /srv/apex/production/backup.sh
   0 4 1 * *   BACKUP_ENV=/srv/apex/production/backup.env /srv/apex/production/restore-drill.sh
   ```
3. Monitoring: create TWO external uptime monitors, on `https://DOMAIN/api/health?deep=1` and on `https://CRM_DOMAIN/api/health?deep=1`, the two dead-man's-switch checks (`BACKUP_PING_URL` in `backup.env`, `DRILL_PING_URL`) and set `ALERT_EMAIL` in the app env (see DEPLOY.md, Monitoring).
4. Acceptance checklist (tick each): `/api/health?deep=1` is 200 on both hosts · `https://CRM_DOMAIN/admin` answers 404 from outside the allow-list and `/portal/login` loads from anywhere · a form submitted on the public site reaches the CRM app (lead appears) · the site loads with a padlock · `curl -I` shows the security headers ·
   log in to the admin and change the password · upload an image and see it on a page (proves S3 public + private) ·
   submit a form: lead appears, both e-mails arrive · a file upload from a form is only downloadable from the admin ·
   run `backup.sh` once and `restore-drill.sh` once by hand and see **RESTORE DRILL PASSED** · save the backup passphrase somewhere outside the server.

> GitHub side: until the staging server exists the release workflow only builds and publishes the image; the staging deploy is skipped. After adding the `DEPLOY_*` secrets to the `staging` environment, run `gh variable set STAGING_ENABLED --body true`.
