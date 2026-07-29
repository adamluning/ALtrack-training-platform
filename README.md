# Training Platform

A full-stack web application for planning and tracking running training — schedule sessions, log distance and duration, set goals, record personal bests, and visualize training volume over time.

Live at: [altrack.se](https://altrack.se/)

## Features

- **Training calendar** — schedule and browse running sessions by date
- **Session logging** — record distance, duration, description, and post-session notes; mark sessions as completed
- **Goals** — set targets with a title, target value, and end date to work towards
- **Personal bests** — track your best times across distances
- **Stats & visualization** — monthly and yearly training volume, charted with Chart.js
- **Authentication** — email/password registration and login secured with JWT

## Tech Stack

| Layer          | Technology                                   |
|----------------|-----------------------------------------------|
| Backend        | Go, [Gin](https://github.com/gin-gonic/gin) web framework |
| Database       | PostgreSQL                                    |
| Migrations     | [golang-migrate](https://github.com/golang-migrate/migrate) |
| Auth           | JWT ([golang-jwt](https://github.com/golang-jwt/jwt)), bcrypt-hashed passwords |
| Frontend       | Vanilla HTML/CSS/JavaScript, [Chart.js](https://www.chartjs.org/) |
| Web server     | Nginx (serves static frontend, reverse-proxies `/api/` to the backend) |
| Containerization | Docker & Docker Compose |

## Project Structure

```
.
├── api/
│   └── main.go                # Application entry point
├── internal/
│   ├── auth/                  # Registration, login, JWT issuance, password hashing
│   ├── db/                    # Database connection/initialization
│   ├── middleware/             # Auth middleware (JWT verification)
│   ├── server/                # Router setup and route definitions
│   └── training/              # Sessions, goals, PBs, and stats — models, handlers, repository
├── migrations/                 # SQL schema migrations (up/down pairs)
├── frontend/                   # Static frontend (HTML/CSS/JS) and Chart.js vendor bundle
├── docker/                     # Dockerfiles for the API and frontend, plus Nginx config
├── docker-compose.yml           # Orchestrates db, migrate, api, and frontend services
├── go.mod / go.sum              # Go module dependencies
└── .env.example                 # Template for required environment variables
```

## Architecture

The application is composed of four Docker services, defined in `docker-compose.yml`:

1. **`db`** — PostgreSQL 15 instance, with a health check gating downstream services
2. **`migrate`** — runs SQL migrations from `migrations/` against `db` on startup, then exits
3. **`api`** — the Go/Gin backend, listens on port `8080` internally; starts only after migrations complete successfully. Not published to the host — it's reachable only from other containers on the Compose network
4. **`frontend`** — Nginx, built from the static frontend files and Chart.js vendor bundle baked into the image; published on host port `3000` (mapped from container port `80`); proxies any request under `/api/` to the `api` service


## Getting Started

### Prerequisites

- Docker and Docker Compose
- (For local, non-Docker development) Go 1.24+ and Node.js 18+

### Setup

1. Clone the repository and navigate into the project directory.

2. Copy the environment template and fill in your own values:
   ```bash
   cp .env.example .env
   ```
   Required variables:
   | Variable      | Description                              |
   |---------------|-------------------------------------------|
   | `JWT_SECRET`  | Secret key used to sign JWTs               |
   | `DB_HOST`     | Database hostname (`db` when using Docker Compose) |
   | `DB_PORT`     | Database port (default `5432`)             |
   | `DB_USER`     | PostgreSQL username                        |
   | `DB_PASSWORD` | PostgreSQL password                        |
   | `DB_NAME`     | PostgreSQL database name                   |

   > **Never commit your real `.env` file.** Use `.env.example` as the template and keep secrets out of version control.

3. Build and start all services:
   ```bash
   docker compose up -d --build
   ```
   This starts the database, applies migrations, then builds and starts the API and frontend images.

4. Open the app in your browser at [http://localhost:3000](http://localhost:3000). The API itself is not published to the host — it's only reachable through the frontend's `/api/` proxy (e.g. `http://localhost:3000/api/auth/login`).


## Development Notes

- Both `api` and `frontend` are built as immutable Docker images — there are no bind-mounted source volumes in `docker-compose.yml`. Any change to `frontend/` or the Go source requires a rebuild to take effect:
  ```bash
  docker compose up -d --build
  ```
- Database migrations live in `migrations/` as paired `up`/`down` SQL files and are applied automatically by the `migrate` service on `docker compose up`.
- For faster local iteration (e.g. live-reloading frontend edits without a full rebuild), consider a separate `docker-compose.override.yml` for development that bind-mounts `./frontend` and publishes the API port directly — keep that override out of what's deployed to production.

## Security Considerations

- Passwords are hashed before storage (see `internal/auth/password.go`); plaintext passwords are never persisted.
- Authenticated routes are protected by JWT verification middleware (`internal/middleware/auth.go`).
- Keep `.env`, database credentials, and the JWT signing secret out of version control and out of any public documentation.