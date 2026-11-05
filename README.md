# Flight Maps
An interactive web application that displays universities on a world map and
provides real-time flight pricing information from South Korea (Seoul/Incheon)
to nearby airports.

This is a monorepo with a Next.js frontend and a Django REST Framework backend.

## Repository structure

```
soil/
├── apps/
│   ├── client/        # Next.js frontend (map UI, scraping pipeline scripts)
│   │   ├── app/       # Pages + components
│   │   ├── lib/       # Shared frontend helpers (API client, etc.)
│   │   └── scripts/   # Data pipeline (Notion scrape → geocode → nearest airport)
│   └── server/        # Django REST Framework backend
│       ├── config/    # Django settings and URL routing
│       ├── universities/  # GET  /api/universities/
│       ├── flights/       # POST /api/flights/search/
│       └── bigmac/        # GET  /api/bigmac/index/
├── pnpm-workspace.yaml
└── package.json       # Root workspace scripts
```

## Backend (Django REST Framework)

```bash
cd apps/server
uv sync                 # creates .venv and installs deps from pyproject.toml
cp .env.example .env    # then fill in secrets
uv run manage.py migrate
uv run manage.py runserver   # http://localhost:8000
```

### API endpoints

| Method | Path                   | Description                          |
|--------|------------------------|--------------------------------------|
| GET    | `/api/universities/`   | University list from MongoDB         |
| POST   | `/api/flights/search/` | Flight prices via SerpAPI            |
| GET    | `/api/bigmac/index/`   | Big Mac Index with Korea comparison  |

## Frontend (Next.js)

```bash
pnpm install
pnpm --filter client dev        # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` to the backend base URL (defaults to
`http://localhost:8000`).

## Data pipeline

The TypeScript scraping scripts that populate MongoDB live in `apps/client/scripts/`
(they share the Node/pnpm toolchain). The full pipeline is:

```
pnpm --filter client run get-notion-links
pnpm --filter client run scrape
pnpm --filter client run geocode
pnpm --filter client run nearest-airport
```

A GitHub Actions workflow (`.github/workflows/dbpipeline.yml`) runs the pipeline
weekly.
