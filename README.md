# Dormitory Services Portal

A self-hosted portal that provides centralized authentication, a shared wallet,
and canteen services for a dormitory network.

The complete application runs as four Docker containers. You do not need to run
`npm run dev` on the host machine to use the system.

## Architecture

| Service    | Technology              | Container           | Host address                          |
| ---------- | ----------------------- | ------------------- | ------------------------------------- |
| Web portal | Next.js 16 and React 19 | `hizmet-web-1`      | `http://localhost:3000`               |
| API        | NestJS 11               | `hizmet-api-1`      | `http://localhost:3001/api/v1/health` |
| Identity   | Keycloak 26             | `hizmet-keycloak-1` | `http://keycloak.localhost:8080`      |
| Database   | PostgreSQL 18           | `hizmet-postgres-1` | `127.0.0.1:55432`                     |

The browser talks to the Next.js web container and Keycloak. The Next.js server
calls the NestJS API over the private Docker network. The API and Keycloak both
store their data in PostgreSQL. Application and identity data survive container
replacement because PostgreSQL uses the named volume `hizmet_postgres_data`.

For architecture decisions, see [docs/architecture.md](docs/architecture.md).
For a detailed Docker tutorial, start with
[docs/docker/README.md](docs/docker/README.md).

## Requirements

- Docker Desktop, or Docker Engine with the Docker Compose plugin
- Git for cloning the repository

Node.js and npm are not required on the host when the application is run only
through Docker. The npm Docker commands in `package.json` are optional wrappers
around the equivalent `docker compose` commands.

## First startup

Create the local environment file:

```bash
cp .env.example .env
```

Open `.env` and replace `AUTH_SECRET` with a long random value. If OpenSSL is
available, one way to generate it is:

```bash
openssl rand -base64 32
```

The passwords and client secrets in `.env.example` are development defaults.
Do not reuse them in a production environment and never commit `.env`.

Build the web and API images, create the containers, and start all four
services:

```bash
docker compose up -d --build
```

The equivalent npm wrapper is:

```bash
npm run docker:up
```

The API container automatically runs all pending database migrations before it
starts NestJS. Migrations are recorded in `public.schema_migration`, so already
applied migrations are skipped on later container starts.

Check the result:

```bash
docker compose ps
docker compose logs --tail=100 web api keycloak postgres
```

Open `http://localhost:3000`. An unauthenticated request is redirected to the
portal login page, and the login action redirects to Keycloak at
`http://keycloak.localhost:8080`.

## Everyday commands

```bash
# Start existing containers. Add --build after source or dependency changes.
docker compose up -d
docker compose up -d --build

# Show service and health status.
docker compose ps

# Follow all logs, or only selected services.
docker compose logs -f
docker compose logs -f web api

# Restart one service.
docker compose restart api

# Stop and remove containers and the private network.
# The PostgreSQL named volume is preserved.
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the
PostgreSQL volume and all application and Keycloak data.

## Rebuilding after a code change

The web and API containers run optimized production builds. Source files are
copied into their images and are not bind-mounted into the running containers.
After changing application code, rebuild the affected service:

```bash
docker compose up -d --build web
docker compose up -d --build api
```

To rebuild and reconcile the entire stack:

```bash
docker compose up -d --build
```

Docker reuses unchanged image layers, so later builds are usually faster than
the first build.

## Data persistence

PostgreSQL stores both databases in `hizmet_postgres_data`:

- `hizmet` contains profiles, wallets, ledger entries, products, stock, and
  orders.
- `keycloak` contains users, credentials, roles, clients, and sessions managed
  by Keycloak.

Stopping, restarting, or replacing a container does not delete this named
volume. Back up PostgreSQL before database upgrades or destructive maintenance.
The [operations guide](docs/docker/04-operations.md) contains backup, inspection,
and troubleshooting commands.

## Product capabilities

- Keycloak owns authentication, password changes, and role claims.
- Platform administrators can create users and assign service roles.
- Each user receives a shared TRY wallet automatically.
- Wallet cashiers can deposit whole-TRY cash amounts and reverse an incorrect
  deposit once with an audit reason.
- Canteen managers can create, price, stock, list, and archive products.
- Users can place and cancel eligible orders using their shared wallet balance.
- Canteen staff can move orders through preparing, ready, and delivered states.
- Prices, stock changes, wallet movements, and order history are stored with
  transactional and audit-oriented rules.

## Further documentation

- [Docker learning guide](docs/docker/README.md)
- [System architecture](docs/architecture.md)
- [Application map](apps/README.md)
- [API guide](apps/api/README.md)
- [Web guide](apps/web/README.md)
