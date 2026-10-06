# WeighToGo — Localhost Setup & Start Guide

Run the whole app on your own machine: backend API + frontend + local Redis cache.

## 1. What you need

- **Node.js 22** (`node --version`) and npm
- Windows PowerShell (commands below are PowerShell)
- A Supabase project (URL + anon key) — the database lives there

Repo layout:

```
CAPSTONE-WeighToGo/
├── backend/    Express API (port 5000)
└── frontend/   Vite + React PWA (port 5173)
```

## 2. Backend setup (first time only)

```powershell
cd backend
npm install
```

Create `backend\.env` with your values:

```ini
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=

JWT_SECRET=paste-output-of-command-below
JWT_EXPIRES_IN=7d

GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest

REDIS_URL=redis://127.0.0.1:6379
```

Generate the JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> A ready-made template lives in `backend\.env.example`.
> The app also runs without Supabase/Redis configured, but API routes return
> 503 (no database) and caching/rev-gating stays off (no Redis) — both fail
> open, nothing crashes.

## 3. Redis setup (first time only — already done on this machine)

Redis is the server-side cache: repeat reads answer in ~50 ms instead of
~3 s, and report pages skip refetching until data actually changes.

**Already installed here:** `%LOCALAPPDATA%\WeighToGo\redis`
(`redis-server.exe` + `cache-only.conf`: localhost-only, no persistence —
pure cache, nothing is written to disk). It auto-starts on logon via
`Start-WeighToGo-Redis.cmd` in your Startup folder.

Check it anytime:

```powershell
& "$env:LOCALAPPDATA\WeighToGo\redis\bin\redis-cli.exe" ping
# PONG = running
```

Start it manually if needed:

```powershell
& "$env:LOCALAPPDATA\WeighToGo\redis\Start-WeighToGo-Redis.cmd"
```

**Fresh machine?** Download `Redis-x64-5.0.14.1.zip` from
`github.com/tporadowski/redis/releases`, extract to
`%LOCALAPPDATA%\WeighToGo\redis\bin`, then save this as
`%LOCALAPPDATA%\WeighToGo\redis\cache-only.conf` (forward slashes required):

```ini
bind 127.0.0.1
port 6379
protected-mode yes
dir "C:/Users/YOU/AppData/Local/WeighToGo/redis"
save ''
appendonly no
logfile ''
```

## 4. Frontend setup (first time only)

```powershell
cd frontend
npm install
```

No `.env` needed for localhost — the dev server proxies `/api` to the
backend automatically. Only set `VITE_API_BASE_URL` if frontend and backend
ever live on different hosts (see `frontend\.env.example`).

## 5. Start the app (every day)

Two terminals:

```powershell
# Terminal 1 — backend (http://localhost:5000)
cd backend
npm run dev
```

```powershell
# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm run dev
```

Then open **http://localhost:5173** and log in. Seeded BNS accounts follow
the pattern `bns.<barangay-slug>@weightogo.gov.ph` with password
`Barangay@2026` (e.g. `bns.baclaran@weightogo.gov.ph`) — if your database
was seeded with `node scripts/resetAndSeed.js`. That script also prints every
new account it creates.

Useful checks:

| Check | How |
|---|---|
| Backend alive | `http://localhost:5000/api/health` → `{"status":"ok",...}` |
| Redis caching live | Open DevTools → Network → reload a list twice → 2nd response has `X-Cache: HIT` |
| PWA install banner (dev) | Append `?pwa=preview` to any logged-in URL |
| Production build | `cd frontend; npm run build` (also verifies the service worker) |

## 6. Troubleshooting

- **`ECONNREFUSED 127.0.0.1:6379`** in backend logs → Redis isn't running; start it (section 3). Everything still works, just uncached.
- **Port already in use** → another `node`/`vite` is running; stop it or change `PORT` (backend) — frontend port is set by Vite (`--port` flag).
- **Login fails locally** → confirm `JWT_SECRET` is set and `CLIENT_ORIGIN` matches the frontend URL exactly.
- **Install banner never appears** → it needs a secure context + logged-in page: use `?pwa=preview` for UI testing, or serve the production build over HTTPS for the real prompt.
- **Registers/checkups feel slow on first load** → normal: first visit scans the database (seconds on thousands of rows); revisits are instant via cache until data changes.
