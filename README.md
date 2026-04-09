# Life Manager

Personal life management system for Mac mini. Integrates Email (Gmail + iCloud),
Project / Todo / Idea / Card, an AI assistant, and Calendar into a single
self-hosted web app.

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLAlchemy · SQLite
- **Frontend**: React 18 · Vite · TailwindCSS · React Router
- **Runtime**: Mac mini (single-user), reachable over Tailscale

## Project layout

```
.
├── backend/        FastAPI app, SQLAlchemy models, routes
│   ├── app.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   ├── routes/
│   ├── schemas/
│   └── requirements.txt
├── frontend/       Vite + React + Tailwind UI
│   ├── package.json
│   └── src/
└── README.md
```

## Quick start (Mac mini)

### 1. Clone the dev branch

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/Kelvinkhlau/Kelvinkhlau.git life_manager
cd life_manager
git checkout claude/mac-mini-personal-system-Er7SF
```

### 2. Backend setup

```bash
# Requires Python 3.11+ (install via `brew install python@3.12` if needed)
python3.12 -m venv backend/venv
source backend/venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

# (Optional) copy env template and fill in API keys when needed
cp backend/.env.example backend/.env
```

### 3. Run backend

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8080 --reload
```

The API is now on `http://localhost:8080`. Verify:

```bash
curl http://localhost:8080/api/health
# {"status":"ok","version":"0.1.0","app":"Life Manager API","db":"ok"}
```

Interactive docs: `http://localhost:8080/docs`

### 4. Frontend setup (new terminal)

```bash
cd ~/Projects/life_manager/frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Dashboard should show a green
**API connected** pill.

## Phase roadmap

| Phase | Module | Status |
| ---- | ------ | ------ |
| 1 | Backend + frontend scaffold, health check, Project CRUD | ✅ in progress |
| 2 | Email sync (Gmail + iCloud) + AI classifier | pending |
| 3 | Project + Todo system with priority engine | pending |
| 4 | Idea + Card inspiration library | pending |
| 5 | Natural-language AI assistant | pending |
| 6 | Calendar integration (Google Calendar) | pending |
| 7 | UI polish + dark theme | pending |
| 8 | Tests + systemd deployment | pending |

## Development branch

All work lives on `claude/mac-mini-personal-system-Er7SF` until Phase 1
verification passes on the Mac mini.
