# JMS_Website

Personal website for John Sylvain. React frontend, Express + SQLite backend,
Nginx reverse proxy, the whole thing orchestrated by Docker Compose. Follows
the curriculum at <https://tschotter.github.io/webserver-tomb/>.

## Features

- Vertical navigation bar with Home / CV / Settings (gear) / Sign-in at the bottom.
- Landing page: hero, bio, link tree, contact cards.
- CV page: embedded resume PDF and a grid of project cards.
- Each project has its own page with threaded discussion.
- Comments are upvoteable. Default sort is highest voted; toggle to newest.
- Guests can read everything. Posting and voting require an account.
- A single admin role (granted via a CLI script on the host) can delete
  any comment. See the **Admin Access** section below.
- Dark mode is the default. Settings has a slider for light mode.
- Black background, white mono-spaced text, accent colors `#79bde8` / `#082e58`.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + React Router
- **Backend**: Node 20 + Express + TypeScript + `better-sqlite3`
- **Auth**: argon2id password hashes, HttpOnly session cookies, server-side
  sessions in SQLite, CSRF double-submit tokens
- **Reverse proxy / TLS**: Nginx + Let's Encrypt (Certbot)
- **Container orchestration**: Docker Compose v2

## Repository Layout

```
JMS_Website/
  api/                  Express + SQLite backend
  web/                  Vite + React frontend
  nginx/                Dockerfile, config template, entrypoint
  docker-compose.yml
  .env.example
```

## Local Development

You can develop either fully in Docker or with the dev servers directly.

### Option A — fully in Docker

```bash
cp .env.example .env
# generate a real secret:
sed -i "s|replace_me_with_openssl_rand_hex_32|$(openssl rand -hex 32)|" .env

docker compose up --build
```

Open <http://localhost>. The frontend is served by Nginx; API calls are
proxied to the `api` service.

### Option B — host dev servers (fastest feedback loop)

```bash
# terminal 1 — API
cd api
npm install
DB_PATH=$(pwd)/dev.db \
SESSION_SECRET=$(openssl rand -hex 32) \
NODE_ENV=development \
npm run dev

# terminal 2 — Web
cd web
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3000`, so the frontend at
<http://localhost:5173> talks to the host-running API.

### Tests

```bash
cd api && npm test       # API: auth, comments, votes (vitest + supertest)
cd web && npm test       # Web: auth flow, vote button (vitest + RTL)
```

## Production Deployment (Linux VPS)

These steps target a fresh Ubuntu 22.04+ VPS (DigitalOcean, Linode, Hetzner,
your university server, etc.) with a public IP and a domain pointing at it.

### 1. DNS

Create an `A` record for your domain pointing to the server's IP. Wait for
propagation (a few minutes).

### 2. Server prep

```bash
ssh root@your.server
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw

# Install Docker Engine + Compose plugin per the official guide:
# https://docs.docker.com/engine/install/ubuntu/
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Firewall: allow SSH and HTTP/S only
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Optionally create a non-root user and add them to the `docker` group.

### 3. Clone and configure

```bash
git clone https://github.com/<you>/JMS_Website.git /opt/jms
cd /opt/jms
cp .env.example .env
nano .env
# fill in:
#   DOMAIN=yourdomain.example.com
#   LETSENCRYPT_EMAIL=you@example.com
#   SESSION_SECRET=$(openssl rand -hex 32)
#   NODE_ENV=production
```

Drop your resume at `web/public/resume.pdf` (replacing the placeholder), and
edit `web/src/data/projects.json` with your real projects.

### 4. First boot — get a TLS cert

The Nginx config serves HTTP only until a Let's Encrypt cert exists, so the
ACME HTTP challenge can succeed.

```bash
docker compose up -d --build web api
# wait until the site responds on port 80, then obtain a cert:
docker compose run --rm certbot
# Certbot writes to the `letsencrypt` volume. Reload Nginx so it picks up TLS:
docker compose restart web
```

Verify HTTPS:

```bash
curl -I https://yourdomain.example.com
# expect HTTP/2 200 and Strict-Transport-Security header
```

### 5. Cert renewal

Add a weekly cron job on the host:

```bash
crontab -e
# minute hour day month dow command
0 3 * * 0 cd /opt/jms && docker compose run --rm certbot && docker compose restart web
```

### 6. Backups

The SQLite file lives in the `api_data` Docker volume. Snapshot it nightly:

```bash
crontab -e
30 2 * * * tar czf /var/backups/jms-$(date +\%F).tgz \
  -C /var/lib/docker/volumes/jms_website_api_data/_data .
```

Copy the resulting tarballs off-server (S3, rsync, etc.).

### 7. Updating

```bash
cd /opt/jms
git pull
docker compose up -d --build
```

## Troubleshooting

- **Browser can't reach the site**: confirm DNS, then `docker compose ps`.
  All three services (`api`, `web`, optionally `certbot`) should show
  `running` or `exited 0` for certbot.
- **Logs**: `docker compose logs -f api` or `... web`.
- **`SESSION_SECRET must be set`** on boot: your `.env` is missing or shorter
  than 32 chars.
- **Cookies never set in production**: cookies are marked `Secure`. They will
  not be sent over plain HTTP. Make sure your TLS cert exists and Nginx is
  serving HTTPS.
- **Cert renewal failing**: ensure ports 80 and 443 are open and that DNS
  still points here.

## Admin Access

There is exactly one privileged role: `admin`. Admins can delete any comment
from the project pages. There is no admin UI for management; promotion and
demotion happen via a small CLI script the server operator runs on the host.

There is no self-service "make me admin" path on purpose: admin is a server
operator decision, not a feature exposed to the web.

### One-time setup (you, the site owner)

1. Register a normal account through the UI: visit `/register` and pick a
   username/password (e.g. `jsylvain`). You are now a regular user.
2. SSH into the VPS and run the promote script against your username:

   ```bash
   cd /opt/jms
   docker compose exec api node dist/scripts/promote.js jsylvain
   # expected output: ok: jsylvain is now admin
   ```

3. Reload any open browser tab. The next request reads your role from the
   database (no re-login required), and a small **delete** button appears
   next to each comment on every project page.

### Demotion / rotating the admin

```bash
docker compose exec api node dist/scripts/promote.js jsylvain --demote
# ok: jsylvain is now user
```

To move admin to a different account, demote the old one and promote the new.

### Local development

Same flow, just without Docker:

```bash
cd api
DB_PATH=$(pwd)/dev.db npx tsx src/scripts/promote.ts <username>
```

### What admins can do

- `DELETE /api/comments/:id` — remove any comment on any project page.
  Requires the admin role, a valid session cookie, and a matching CSRF token,
  same as every other state-changing endpoint.

### What admins cannot do (by design)

- There is no edit-comment endpoint. Admin moderation is delete-only.
- There is no admin user listing, password reset, or impersonation. If you
  need those, add them as further routes guarded by `requireAdmin`.

## Security Notes

- Passwords are hashed with argon2id; raw passwords are never logged.
- Sessions are stored server-side in SQLite; the cookie is opaque and signed.
- Every state-changing endpoint requires a CSRF token (`X-CSRF-Token`
  header) that must match the one bound to the session.
- All DB access uses prepared statements with bound parameters.
- Request bodies and query params are validated by `zod` schemas at the
  route boundary; unknown fields are rejected.
- Auth endpoints and write endpoints are rate-limited.
- Nginx serves a strict Content-Security-Policy plus HSTS, X-Frame-Options,
  X-Content-Type-Options, and Referrer-Policy headers.

## License

Personal project. All rights reserved unless a `LICENSE` file is added.
