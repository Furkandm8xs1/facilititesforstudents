# Operating the Docker Stack

This chapter teaches the commands used to build, start, inspect, update, back
up, troubleshoot, and stop the four-container stack.

Run commands from the repository root, where `compose.yaml` is located.

## Command structure

Most commands begin with:

```text
docker compose
```

- `docker` is the Docker command-line client;
- `compose` loads the Compose project;
- the next word is an operation such as `up`, `ps`, `logs`, or `down`;
- optional service names limit the operation to those services.

For example:

```bash
docker compose logs -f api
```

means “follow logs for the `api` service in this Compose project.”

## Prepare configuration

Create the local environment file once:

```bash
cp .env.example .env
```

Generate a strong Auth.js secret:

```bash
openssl rand -base64 32
```

Paste the output into the `AUTH_SECRET` entry in `.env`.

The example PostgreSQL passwords and Keycloak client secrets are intended only
for local development. Replace all secrets for a real deployment. The
repository ignores `.env`, and `.dockerignore` prevents it from being copied
into image build contexts.

Validate the Compose syntax and required variables:

```bash
docker compose config --quiet
```

No containers are created by this validation command.

## First build and startup

```bash
docker compose up -d --build
```

The options mean:

- `up` creates or reconciles services;
- `-d` runs them in the background;
- `--build` builds local images before starting containers.

During the first run, Docker may:

1. pull the Node.js, PostgreSQL, and Keycloak base images;
2. install npm dependencies in image build stages;
3. compile the NestJS and Next.js applications;
4. create `hizmet_default`;
5. create or reuse `hizmet_postgres_data`;
6. initialize PostgreSQL when the volume is empty;
7. start Keycloak after PostgreSQL is healthy;
8. run API database migrations;
9. start NestJS and wait for its health check;
10. start Next.js and wait for its health check.

The first build is the slowest. Docker reuses unchanged layers on later builds.

## Check status

```bash
docker compose ps
```

Expected services:

```text
hizmet-postgres-1
hizmet-keycloak-1
hizmet-api-1
hizmet-web-1
```

The `postgres`, `api`, and `web` services have Docker health checks.
Keycloak should be in the `running` state and its OpenID Connect discovery
endpoint should respond:

```bash
curl http://keycloak.localhost:8080/realms/hizmet/.well-known/openid-configuration
```

Application checks:

```bash
curl -I http://localhost:3000/login
curl http://localhost:3001/api/v1/health
```

The login page should return HTTP 200. The API health endpoint returns JSON with
`"status":"ok"`.

## Read logs

```bash
# Recent logs from all services
docker compose logs --tail=100

# Follow all new log messages
docker compose logs -f

# Follow only application logs
docker compose logs -f web api

# Show logs generated during the last ten minutes
docker compose logs --since=10m postgres keycloak api web
```

Press Ctrl+C to stop following logs. This does not stop the containers.

Important startup messages include:

- PostgreSQL reporting that it is ready to accept connections;
- Keycloak reporting that it is listening on port 8080;
- the API migration runner reporting `Applied` or `Skipped` migration files;
- NestJS reporting that the application started;
- Next.js reporting that it is ready on port 3000.

## Start, stop, and restart

```bash
# Stop processes but keep their containers
docker compose stop

# Start previously created containers
docker compose start

# Restart all containers
docker compose restart

# Restart only one service
docker compose restart api
```

`restart` does not rebuild an image. Use a build command after source or
dependency changes.

## Rebuild after code changes

The application runs production images. Source directories are not mounted into
the containers, so editing a host file does not modify a running container.

```bash
# Rebuild and replace only the API when necessary
docker compose up -d --build api

# Rebuild and replace only the web portal
docker compose up -d --build web

# Reconcile the complete stack
docker compose up -d --build
```

Compose replaces a container when its image or service configuration changes.
The PostgreSQL named volume remains attached.

Useful build-only commands:

```bash
docker compose build api
docker compose build web
docker compose build --no-cache api web
```

`--no-cache` forces every Dockerfile build step to run again. It is useful for
diagnosis but is slower and should not be the normal workflow.

Running `npm run dev` on the host is not required. If npm is installed, these
repository scripts are wrappers:

| npm command           | Compose equivalent             |
| --------------------- | ------------------------------ |
| `npm run docker:up`   | `docker compose up -d --build` |
| `npm run docker:down` | `docker compose down`          |
| `npm run docker:logs` | `docker compose logs -f`       |

## Execute a diagnostic command inside a container

`docker compose exec` starts an additional process in an existing container:

```bash
# Print the Node.js version inside the API image
docker compose exec api node --version

# Open a PostgreSQL interactive terminal
docker compose exec postgres psql -U hizmet -d hizmet

# Resolve service names from the API container
docker compose exec api node -e "require('dns').lookup('postgres', console.log)"
```

Exit `psql` with `\q`.

`exec` is for diagnostics and maintenance. Changes made manually inside a
container's writable filesystem disappear when the container is replaced.
Persistent changes belong in source code, a Dockerfile, Compose configuration,
or a database migration.

## Inspect images

```bash
docker compose images
docker image inspect hizmet-api
docker image history hizmet-api
```

- `compose images` maps services to images;
- `image inspect` prints image metadata;
- `image history` shows build layers and their sizes.

Do not place secrets in Dockerfile `ARG`, `ENV`, `RUN`, or `COPY`
instructions. Image history and layers can retain them.

## Inspect the private network

```bash
docker network inspect hizmet_default
```

The output lists the four attached containers and network aliases.

Test internal routes:

```bash
docker compose exec web node -e "fetch('http://api:3001/api/v1/health').then(r => r.text()).then(console.log)"
docker compose exec api node -e "fetch('http://keycloak.localhost:8080/realms/hizmet/.well-known/openid-configuration').then(r => r.json()).then(x => console.log(x.issuer))"
```

The expected Keycloak issuer is:

```text
http://keycloak.localhost:8080/realms/hizmet
```

Never configure a container to reach another service through `localhost`.
Inside the web container, `localhost` means the web container itself.

## Inspect the PostgreSQL volume

```bash
docker volume inspect hizmet_postgres_data
```

Confirm that PostgreSQL mounts it:

```bash
docker inspect hizmet-postgres-1 --format '{{json .Mounts}}'
```

List databases without changing them:

```bash
docker compose exec postgres psql -U hizmet -d postgres -c '\l'
```

The cluster should contain at least `hizmet`, `keycloak`, and `postgres`.

## Database backups

A named volume provides persistence, not backup protection. Create logical
backups before upgrades, schema work, or destructive maintenance.

The following approach writes the dump inside the PostgreSQL container and then
copies it to the Git-ignored host directory `.backups`.

```bash
mkdir -p .backups

docker compose exec -T postgres \
  pg_dump -U hizmet -d hizmet --format=custom \
  --file=/tmp/hizmet.dump

docker compose exec -T postgres \
  pg_dump -U hizmet -d keycloak --format=custom \
  --file=/tmp/keycloak.dump

docker compose exec -T postgres \
  pg_dumpall -U hizmet --roles-only \
  --file=/tmp/roles.sql

docker compose cp postgres:/tmp/hizmet.dump .backups/hizmet.dump
docker compose cp postgres:/tmp/keycloak.dump .backups/keycloak.dump
docker compose cp postgres:/tmp/roles.sql .backups/roles.sql
```

Validate that custom-format archives can be read:

```bash
docker compose exec -T postgres pg_restore --list /tmp/hizmet.dump
docker compose exec -T postgres pg_restore --list /tmp/keycloak.dump
```

Record checksums after copying:

```bash
shasum -a 256 .backups/hizmet.dump
shasum -a 256 .backups/keycloak.dump
shasum -a 256 .backups/roles.sql
```

Backup files contain sensitive identity and application data. Keep them
encrypted, access-controlled, and outside Git. Copy important backups to storage
independent of the Docker host.

### Restore planning

A restore is destructive when it targets existing databases. Before restoring:

1. stop the web, API, and Keycloak services;
2. preserve the current volume or take another backup;
3. confirm the target database and backup timestamp;
4. test the restore into a disposable PostgreSQL instance first;
5. restore roles before databases when rebuilding a full cluster;
6. verify schema migrations, row counts, login, wallet balances, and orders;
7. start application services only after verification.

`pg_restore` options depend on whether the target database is empty and
whether ownership should be restored. Do not copy a generic destructive restore
command into a live environment without reviewing PostgreSQL's restore plan.

## Safe shutdown

```bash
docker compose down
```

This stops and removes:

- web, API, Keycloak, and PostgreSQL containers;
- the `hizmet_default` network.

It preserves:

- locally built and downloaded images;
- `hizmet_postgres_data`;
- source code and `.env`;
- host backup files.

Start the same environment again with:

```bash
docker compose up -d
```

## Destructive cleanup

These commands have different scopes:

```bash
# Removes containers and network; keeps the database volume
docker compose down

# Also removes named volumes declared by the project
docker compose down -v

# Removes locally built project images as well
docker compose down --rmi local
```

`docker compose down -v` deletes `hizmet_postgres_data`, including application
and Keycloak databases. Treat it as permanent data deletion.

Broad commands such as `docker system prune` affect Docker resources outside
this project. Do not use them as routine project cleanup.

## Upgrade procedure

For application code updates:

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api web
```

Before changing PostgreSQL or Keycloak image versions:

1. read the official release and upgrade notes;
2. create and verify logical backups;
3. record current image versions and database sizes;
4. update one major component at a time;
5. rebuild or pull images;
6. inspect startup and migration logs;
7. test authentication and existing data.

Do not perform an in-place PostgreSQL major-version change merely by editing
`postgres:18-alpine` to another major version. PostgreSQL major upgrades
require a supported `pg_upgrade` process or logical dump and restore.

## Troubleshooting

### Port is already allocated

Typical error:

```text
bind: address already in use
```

Find the host process:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
lsof -nP -iTCP:55432 -sTCP:LISTEN
```

Stop the conflicting process or change the relevant published host port. Do not
change internal container ports unless application configuration changes with
them.

### A container exits repeatedly

```bash
docker compose ps -a
docker compose logs --tail=200 api
```

Check the first error, not only the final restart message. Common causes are
missing environment variables, database authentication failures, migration
errors, and invalid service URLs.

### API is unhealthy

```bash
docker compose logs --tail=200 api postgres
docker inspect hizmet-api-1 --format '{{json .State.Health}}'
curl http://localhost:3001/api/v1/health
```

If migrations fail, the entrypoint intentionally refuses to start NestJS.
Resolve the migration or database problem instead of bypassing the entrypoint.

### Web is healthy but login fails

Check the shared issuer from the host:

```bash
curl http://keycloak.localhost:8080/realms/hizmet/.well-known/openid-configuration
```

Check it from the web container:

```bash
docker compose exec web node -e "fetch('http://keycloak.localhost:8080/realms/hizmet/.well-known/openid-configuration').then(r => r.json()).then(x => console.log(x.issuer))"
```

Both should print an issuer beginning with
`http://keycloak.localhost:8080/realms/hizmet`. An issuer hostname mismatch
causes OpenID Connect discovery or token verification errors.

### Keycloak starts but users appear missing

Do not re-import the realm or delete containers immediately. First verify:

```bash
docker volume inspect hizmet_postgres_data
docker compose logs --tail=200 postgres keycloak
docker compose exec postgres psql -U hizmet -d keycloak -c 'SELECT count(*) FROM user_entity;'
```

Keycloak users live in PostgreSQL, not in the Keycloak container filesystem.

### Database appears empty

Inspect the mounted volume and database list before changing anything:

```bash
docker inspect hizmet-postgres-1 --format '{{json .Mounts}}'
docker compose exec postgres psql -U hizmet -d postgres -c '\l'
```

An unexpected new volume or Compose project name can create a separate empty
cluster. The expected volume is `hizmet_postgres_data`.

### Source change is not visible

Production source is copied into images. Rebuild the affected service:

```bash
docker compose up -d --build web
docker compose up -d --build api
```

Restarting without rebuilding continues to use the old image.

## Final operational checklist

Before considering a deployment healthy:

- `docker compose ps` shows all four services running;
- PostgreSQL, API, and web health states are healthy;
- `http://localhost:3001/api/v1/health` returns HTTP 200;
- `http://localhost:3000/login` returns HTTP 200;
- Keycloak discovery returns the expected `keycloak.localhost` issuer;
- the login action redirects to Keycloak;
- existing application and Keycloak records remain present;
- a recent backup exists before risky maintenance.
