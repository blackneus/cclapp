# LICREAMO LMS

Plataforma de escuela virtual para Licreamo — gestión de cursos, módulos, cuestionarios, inscripciones y pagos.

**URL local:** http://localhost (o http://localhost:8090 si usas `HOST_PORT=8090`)  
**Sister project:** [TCCorganizer](https://tccorganizer.neusco.org) — mismo look-and-feel, BD/deploy separados.

## Stack

- **Frontend:** Angular 21 (standalone, signals, SCSS)
- **Backend:** Go 1.23 + Echo + pgx v5
- **DB:** PostgreSQL 16 con Row Level Security
- **Infra:** Docker Compose + Nginx

## Setup local

### 1. Prerequisitos

- Docker + Docker Compose v2
- (Opcional) Go 1.23+ para desarrollo del backend sin Docker
- (Opcional) Node 22+ para desarrollo del frontend sin Docker

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Edita .env — al menos cambia JWT_SECRET y las passwords
```

Para Google OAuth, crea credenciales en [Google Cloud Console](https://console.cloud.google.com):
- Tipo: "Web application"
- Redirect URI: `http://localhost/api/auth/google/callback`
- Copia `Client ID` y `Client Secret` a `.env`

### 3. Levantar el stack

```bash
# Producción (build completo)
docker compose -f infra/docker-compose.yml up -d

# Desarrollo con hot-reload
docker compose -f infra/docker-compose.dev.yml up
```

El primer arranque:
1. Ejecuta las migraciones automáticamente
2. Crea el tenant `licreamo` (subdomain `ccl`)
3. Crea el usuario admin con las credenciales de `.env`

### 4. Verificar que funciona

```bash
# Health check del backend
curl http://localhost/api/health

# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Subdomain: ccl" \
  -d '{"email":"irving.soloriog@neusco.org","password":"AdminPass123!"}'
```

Abre http://localhost en el navegador para ver el frontend.

### 5. Correr junto con TCCorganizer

Si TCCorganizer ya usa el puerto 80:

```bash
HOST_PORT=8090 docker compose -f infra/docker-compose.yml up -d
# Accede en http://localhost:8090
```

## Desarrollo local (sin Docker)

### Backend

```bash
cd backend
cp ../.env .env.local  # o exporta las vars manualmente
go run ./cmd/api
# Corre en :8080, requiere Postgres en localhost:5432
```

### Frontend

```bash
cd frontend
npm install
npm start  # ng serve en :4200
```

## Estructura del proyecto

```
ccl-licreamo/
├── frontend/       # Angular 21
├── backend/        # Go + Echo
│   ├── cmd/api/    # entry point
│   ├── internal/   # lógica de negocio
│   └── migrations/ # SQL puro con golang-migrate
├── infra/          # Docker Compose + Nginx + seed
└── docs/decisions/ # ADRs
```

## Comandos útiles

```bash
# Ver logs del backend
docker compose -f infra/docker-compose.yml logs -f backend

# Correr test de aislamiento RLS
docker exec licreamo-db psql -U licreamo -d licreamo -f /seed/test_rls.sql

# Rebuil solo el backend
docker compose -f infra/docker-compose.yml up -d --build backend

# Bajar y limpiar volúmenes (⚠ borra la BD)
docker compose -f infra/docker-compose.yml down -v
```

## Roles

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo: tenants, usuarios, cursos, pagos, nómina |
| `teacher` | Gestiona sus propios cursos y módulos |
| `student` | Accede a cursos inscritos y paga inscripciones |

## Multi-tenancy

Cada request se resuelve al tenant correcto por:
- **Producción:** subdomain del `Host` header (`ccl.neusco.com` → tenant `ccl`)
- **Desarrollo:** header `X-Tenant-Subdomain: ccl` (inyectado por Nginx y Angular)

El aislamiento se garantiza con **Postgres Row Level Security** en todas las tablas de dominio.
