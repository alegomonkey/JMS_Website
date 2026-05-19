# JMS_Website

Personal site for John Sylvain. React frontend, Express + SQLite backend,
Nginx reverse proxy with TLS, all orchestrated by Docker Compose. Built to
follow the curriculum at <https://tschotter.github.io/webserver-tomb/>.

## What it does

- **Home** (`/`) — hero, bio, link tree, contact cards, embedded resume PDF.
- **Projects** (`/projects`) — paginated project grid with a keyboard-driven
  tag filter combobox; URL search params keep filters shareable.
- **Project detail** (`/projects/:slug`) — overview, contributions, repo
  link, and a threaded comment thread you can upvote.
- **Cribbage speed test** (`/cribbage`) — counting drill against a freshly
  shuffled deck. Daily mode is seeded per-day (5/20/100 hands) and rolls
  over at midnight Eastern Time; free-play is unlimited practice. Three
  lives per run; the API recomputes each hand's score and rejects daily
  runs whose dealt cards don't match the day's seed.
- **Records** (`/cribbage/records`) — today's daily leaderboard, one tab per
  length. Each row links to a per-game detail page
  (`/cribbage/games/:id`) with the full hand-by-hand breakdown.
- **Profile** (`/profile/:username`) — bio, cribbage stats split into tabs
  (Best daily / Best overall / Recent games) with click-throughs to any
  game's detail page, plus a per-profile comment thread.
- **Auth** — register / sign in / sign out; guests can read, accounts can
  post, vote, and record cribbage results. One admin role can delete any
  comment (CLI-granted on the host).
- **Settings** — theme switch (defaults to OS `prefers-color-scheme`) and
  an on-screen-keyboard toggle for the cribbage input on desktop.
- **Mobile-first, AAA-targeting** — responsive at 320 / 375 / 768 / 1024 /
  1440 px, hamburger drawer with focus trap below 768 px, axe-tested per
  route. See [`web/ACCESSIBILITY.md`](web/ACCESSIBILITY.md).

## Tools

| Layer            | Tech                                                              |
| ---------------- | ----------------------------------------------------------------- |
| Frontend         | React 18, TypeScript, Vite, React Router 6, CSS Modules           |
| Backend          | Node 20, Express, TypeScript, `better-sqlite3`, Zod               |
| Auth & security  | argon2id, HttpOnly + signed session cookies, CSRF double-submit   |
| Reverse proxy    | Nginx + Let's Encrypt (Certbot)                                   |
| Orchestration    | Docker Compose v2                                                 |
| Testing          | Vitest, Supertest (API), React Testing Library, `jest-axe` (Web)  |

## Quickstart (host dev servers)

Two terminals, no Docker required:

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

Then open <http://localhost:5173>. Vite proxies `/api` calls to the API on
port 3000.

### Tests

```bash
cd api && npm test     # auth, comments, votes
cd web && npm test     # components, page a11y (axe), drawer + combobox behavior
```

### Production build (full Docker stack)

```bash
cp .env.example .env
sed -i "s|replace_me_with_openssl_rand_hex_32|$(openssl rand -hex 32)|" .env
docker compose up --build
# then open http://localhost
```

## Deeper docs

- **Production deployment, admin access, security, troubleshooting** →
  [`setup/README.md`](setup/README.md)
- **Accessibility manual checklist** → [`web/ACCESSIBILITY.md`](web/ACCESSIBILITY.md)
- **Project content** — edit `web/src/data/projects.json`, drop a resume at
  `web/public/resume.pdf`.

## Repository layout

```
JMS_Website/
├── api/                Express + SQLite backend
├── web/                Vite + React frontend
│   └── ACCESSIBILITY.md
├── nginx/              Reverse-proxy Dockerfile & config templates
├── setup/              Full setup & deployment guide
├── docker-compose.yml
├── .env.example
└── README.md
```

## License

Personal project. All rights reserved unless a `LICENSE` file is added.
