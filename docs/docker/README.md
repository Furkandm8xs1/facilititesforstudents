# Docker Learning Guide

This directory explains how and why the Dormitory Services Portal runs in
Docker. It is written for readers who have not used Docker before, but it also
documents the project-specific technical decisions needed for maintenance.

The canonical configuration files remain at the repository root:

- [`compose.yaml`](../../compose.yaml)
- [`Dockerfile.api`](../../Dockerfile.api)
- [`Dockerfile.web`](../../Dockerfile.web)
- [`.dockerignore`](../../.dockerignore)
- [API entrypoint](../../apps/api/docker-entrypoint.sh)

The examples in this guide assume commands are executed from the repository
root.

## What the stack contains

```text
Host browser
   |
   | http://localhost:3000
   v
web container (Next.js :3000)
   |
   | http://api:3001 over the private Compose network
   v
api container (NestJS :3001)
   |
   | postgresql://postgres:5432/hizmet
   v
postgres container (PostgreSQL :5432)
   ^
   | jdbc:postgresql://postgres:5432/keycloak
   |
keycloak container (Keycloak :8080)
   ^
   | http://keycloak.localhost:8080
   |
Host browser and application containers
```

There are four long-running containers:

| Compose service | Main responsibility                                    |
| --------------- | ------------------------------------------------------ |
| `web`           | Render the UI, maintain Auth.js sessions, call the API |
| `api`           | Enforce authorization and execute business rules       |
| `keycloak`      | Authenticate users and issue OpenID Connect tokens     |
| `postgres`      | Persist application and Keycloak data                  |

## Suggested reading order

1. [01 — Docker fundamentals](01-fundamentals.md) explains images, containers,
   layers, ports, networks, volumes, and build contexts.
2. [02 — Dockerfiles](02-dockerfiles.md) reproduces and explains both
   Dockerfiles, the API entrypoint, and `.dockerignore`.
3. [03 — Docker Compose](03-compose.md) reproduces and explains every service,
   dependency, health check, network decision, and volume declaration.
4. [04 — Operations](04-operations.md) teaches startup, rebuilds, logs,
   inspection, backups, upgrades, cleanup, and troubleshooting.

## Fast path

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Then open `http://localhost:3000`.

The stack is fully containerized. Running `npm run dev` on the host is not
required. The npm commands `docker:up`, `docker:down`, and `docker:logs` are
only convenience wrappers around Docker Compose.

## Safety rule

`docker compose down` removes containers and the Compose network but preserves
the PostgreSQL named volume. Adding `-v` also removes named volumes:

```bash
# Preserves database data
docker compose down

# Destructive: removes the database volume
docker compose down -v
```

Do not use the second command unless permanent data deletion is intentional and
a verified backup exists.
