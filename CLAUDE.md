# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

LICREAMO LMS is a virtual school platform for Licreamo — multi-tenant management of courses, modules, quizzes, enrollments, and payments. Sister project of [TCCorganizer](https://tccorganizer.neusco.org) — same look-and-feel, separate DB/deploy.

The project is in Spanish (README, user-facing text) but code identifiers are in English.

## Repository Structure

```
ccl-licreamo/
├── frontend/       # Angular 21 (standalone, signals, SCSS)
├── backend/        # Go 1.23 + Echo + pgx v5
│   ├── cmd/api/    # entry point (main.go)
│   ├── internal/   # business logic
│   │   ├── auth/       # JWT middleware + service + handler
│   │   ├── tenancy/    # tenant resolution middleware
│   │   ├── courses/    # example domain module
│   │   ├── config/     # env-based config
│   │   ├── db/         # pgxpool wrapper
│   │   └── http/       # Echo router wiring
│   └── migrations/ # SQL with golang-migrate (sequential: 0001_*, 0002_*, …)
└── infra/          # Docker Compose + Nginx + seed
```

## Build & Dev Commands

### Backend (`backend/`)
```bash
go build ./...          # Compile
go test ./...           # Run all tests
go run ./cmd/api        # Run locally (requires Postgres)
# With Docker hot-reload:
docker compose -f infra/docker-compose.dev.yml up
```

### Frontend (`frontend/`)
```bash
npm start               # ng serve en :4200
npm run build           # Production build
npm test                # Unit tests
```

### Full stack
```bash
docker compose -f infra/docker-compose.yml up -d       # Production
docker compose -f infra/docker-compose.dev.yml up      # Dev with hot-reload
```

## Architecture

### Backend (Go + Echo)

**Entry point**: `cmd/api/main.go` — loads config, connects DB, runs migrations, seeds, starts Echo.

**Auth**: JWT (HS256). Access token TTL configurable via `JWT_ACCESS_TTL_MINUTES` (default 15m). Refresh token via `JWT_REFRESH_TTL_DAYS` (default 30d). Token payload: `tid` (tenantID), `uid` (userID), `role`, `email`. Use `auth.GetClaims(c)` to extract from Echo context — never parse manually.

**Multi-tenancy**: Every request resolves to a tenant via `tenancy.Middleware`. Priority: `X-Tenant-Subdomain` header (dev) > Host subdomain (prod). Tenant ID injected as `tenant_id` in Echo context. All domain tables use **Postgres Row Level Security** — always set `app.tenant_id` session variable before queries.

**Domain modules** follow the pattern: `model.go` → `repository.go` (pgx queries) → `handler.go` (Echo handlers). No global service layer for simple CRUD — keep it flat.

**Router**: `internal/http/router.go`. Public routes registered on `e` directly; protected routes on `protected` group (has `auth.JWTMiddleware`). Add new domain handlers here.

**Migrations**: `backend/migrations/` — sequential SQL files (`0001_init.up.sql`, etc). Never edit existing migrations; always add a new one.

**Error responses**: use `map[string]interface{}{"error": map[string]interface{}{"code": "SNAKE_CODE", "message": "human text"}}`. Keep error codes in SCREAMING_SNAKE.

### Frontend (Angular 21)

Signal-based state management. Auth tokens stored in `localStorage` keys `licreamo_token` / `licreamo_refresh`. `authGuard` protects routes; `authInterceptor` attaches Bearer token and `X-Tenant-Subdomain` header (from `environment.tenantSubdomain`).

API base URL from `environment.apiBaseUrl` (production: `/api`, dev: `http://localhost:8080/api`). Never hardcode URLs in services.

Auth state lives in `AuthService` signals: `user`, `isAuthenticated`, `isAdmin`, `isTeacher`, `isStudent`. Call `authService.loadMe()` on app init to restore session.

Routing: login page + shell with section navigation. Add new pages under `src/app/pages/`.

## Coding Rules

- **No `any` en TypeScript** — siempre tipar con interfaces, genéricos, o `unknown`.
- **No hardcodear URLs** — usar `environment.apiBaseUrl` en servicios Angular.
- **No tocar migraciones existentes** — agregar una nueva con el siguiente número secuencial.
- **RLS obligatorio** — toda tabla de dominio (no sistema) debe tener RLS habilitado. Verificar en la migración.
- **GetClaims en Go** — nunca parsear el JWT manualmente; usar `auth.GetClaims(c)` en handlers protegidos.
- **Tenant ID en queries** — toda query que toque tablas RLS-protegidas debe operar con el tenant correcto inyectado en la sesión Postgres o filtrado por `tenant_id`.

## Environment Variables

```
POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
JWT_SECRET                  # required
JWT_ACCESS_TTL_MINUTES      # default 15
JWT_REFRESH_TTL_DAYS        # default 30
PORT                        # default 8080
ENV                         # development | production
GOOGLE_CLIENT_ID            # optional — enables Google OAuth
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
FRONTEND_URL
ADMIN_EMAIL
ADMIN_INITIAL_PASSWORD
```

## Roles

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo: tenants, usuarios, cursos, pagos, nómina |
| `teacher` | Gestiona sus propios cursos y módulos |
| `student` | Accede a cursos inscritos y paga inscripciones |

## Multi-tenancy

- **Producción**: subdomain del `Host` header (`ccl.neusco.com` → tenant `ccl`)


El aislamiento se garantiza con Postgres RLS en todas las tablas de dominio.

## Verificar 3x antes de asumir que algo existe o funciona
