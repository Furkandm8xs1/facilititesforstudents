# Docker Fundamentals

This chapter introduces the Docker concepts used by this repository. The
terminology matters because an image, a container, and a volume solve different
problems and have different lifecycles.

## Why Docker is used here

Without containers, a developer must install compatible versions of Node.js,
npm, PostgreSQL, and Keycloak directly on the host, configure their ports, and
keep their settings synchronized. Docker packages each runtime with its
dependencies and Docker Compose describes how all runtimes connect.

The benefits for this project are:

- the web and API always run on Node.js 24 inside Linux images;
- PostgreSQL and Keycloak versions are pinned;
- service names and internal ports are consistent;
- startup order and health checks are declared as code;
- the same four-service model can be reproduced on another machine;
- application processes do not need to be started with `npm run dev` on the
  host.

Docker does not remove the need to understand configuration, networking,
secrets, backups, or upgrades. It makes those concerns explicit.

## Image

An image is an immutable filesystem template plus metadata describing how a
process should start. `Dockerfile.api` produces the `hizmet-api` image and
`Dockerfile.web` produces the `hizmet-web` image.

An image is built in layers. A Dockerfile instruction such as `COPY` or `RUN`
usually creates a new layer. Docker can reuse an unchanged layer from its build
cache. That is why the Dockerfiles copy package manifests and run `npm ci`
before copying source code: changing one TypeScript file should not force every
dependency to be downloaded again.

Images do not run by themselves. They are used to create containers.

## Container

A container is a running instance of an image. It has:

- its own process namespace;
- its own filesystem layer;
- its own network interfaces;
- environment variables;
- optional port publications and mounted storage.

The writable filesystem layer of a container is disposable. Recreating the
`api` or `web` container is safe because neither service stores business data
in that layer. Recreating the PostgreSQL container is safe only because its data
directory is mounted from a named volume.

Useful commands:

```bash
# Show running containers in this Compose project
docker compose ps

# Show all containers, including stopped containers
docker compose ps -a

# Show low-level details for one container
docker inspect hizmet-api-1
```

## Dockerfile

A Dockerfile is a recipe for building one image. Important instruction types
used here include:

- `FROM`: choose a base image or begin a new build stage;
- `WORKDIR`: select the directory for later instructions and runtime commands;
- `COPY`: copy files from the build context or another stage;
- `RUN`: execute a command while building the image;
- `ENV`: define image-level environment defaults;
- `USER`: select the non-root runtime user;
- `EXPOSE`: document the port expected inside the container;
- `ENTRYPOINT` and `CMD`: define the runtime process.

This project uses multi-stage Dockerfiles. Build tools and development
dependencies stay in earlier stages, while the final runtime stages contain
only what the service needs to execute.

## Build context

The build context is the directory Docker may read during a build. Both Compose
services use the repository root as their context:

```yaml
build:
  context: .
  dockerfile: Dockerfile.api
```

The root context is required because npm workspaces use the root
`package-lock.json` and both workspace manifests. Sending every repository file
to Docker would be slow and could leak local secrets, so `.dockerignore`
excludes `.env`, backups, dependency directories, Git metadata, and build
outputs.

## Registry image versus locally built image

PostgreSQL and Keycloak use images downloaded from registries:

```yaml
image: postgres:18-alpine
image: quay.io/keycloak/keycloak:26.7.2
```

The API and web images are built locally from source:

```yaml
build:
  context: .
  dockerfile: Dockerfile.web
```

`docker compose up -d --build` downloads missing base images, builds local
images, and starts or reconciles containers.

## Port inside a container versus port on the host

A service listens on a container port. A `ports` mapping optionally publishes
that port on the host:

```yaml
ports:
  - '127.0.0.1:3001:3001'
```

Read this mapping from right to left:

- the API listens on port `3001` inside its container;
- Docker publishes it as port `3001` on host address `127.0.0.1`;
- only the local host can use that publication.

Container-to-container traffic does not use published host ports. The web
container reaches the API at `http://api:3001`, using the Compose service name
and the API's container port.

The current mappings are:

| Service    | Internal address             | Published host address         |
| ---------- | ---------------------------- | ------------------------------ |
| Web        | `http://web:3000`            | `http://127.0.0.1:3000`        |
| API        | `http://api:3001`            | `http://127.0.0.1:3001`        |
| Keycloak   | `http://keycloak:8080`       | `http://localhost:8080`        |
| PostgreSQL | `postgresql://postgres:5432` | `postgresql://127.0.0.1:55432` |

`EXPOSE 3000` in a Dockerfile does not publish a port. It is image metadata.
Compose's `ports` entry performs the publication.

## Docker network

Compose automatically creates a bridge network named `hizmet_default`. Every
service joins it unless configured otherwise. Docker provides DNS on that
network, so service names resolve to container addresses:

- `postgres` resolves to the PostgreSQL container;
- `keycloak` resolves to the Keycloak container;
- `api` resolves to the NestJS container;
- `web` resolves to the Next.js container.

Container addresses can change when containers are recreated. Service names are
stable, so configuration must use `postgres:5432` and `api:3001`, not a
container IP address.

### Why localhost is different inside a container

`localhost` always means the current network namespace. In the API container,
`localhost:5432` would mean “port 5432 inside the API container,” not
PostgreSQL. The correct database hostname is `postgres`.

This distinction explains the container-specific values:

```text
DATABASE_URL=postgresql://...@postgres:5432/hizmet
API_BASE_URL=http://api:3001/api/v1
```

### Why Keycloak uses keycloak.localhost

OpenID Connect tokens contain an issuer URL. The browser and the web/API
containers must agree on exactly the same issuer string. The project uses:

```text
http://keycloak.localhost:8080/realms/hizmet
```

On the host, the special `.localhost` domain resolves to the loopback address,
which reaches Keycloak through the published port. Inside the Compose network,
`keycloak.localhost` is configured as a network alias for the `keycloak`
service. The same URL therefore works from both locations and token issuer
validation remains consistent.

## Volume

A volume is storage managed separately from a container's writable layer. The
named volume declaration is:

```yaml
volumes:
  postgres_data:
```

The PostgreSQL service mounts it as:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

Compose prefixes the project name and creates the Docker volume
`hizmet_postgres_data`. PostgreSQL 18 writes its cluster under
`/var/lib/postgresql`, so database files remain in the volume when the
container is stopped, removed, or replaced.

The same PostgreSQL cluster contains two project databases:

- `hizmet` for application data;
- `keycloak` for identity data.

A volume is not a backup. Accidental SQL changes, application bugs, corruption,
or `docker compose down -v` can still destroy data. Maintain logical backups
outside the volume.

## Bind mount

A bind mount maps a host path directly into a container. Two read-only bind
mounts are used:

```yaml
- ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
- ./infra/keycloak:/opt/keycloak/data/import:ro
```

`:ro` means the container can read but cannot modify the host files.

PostgreSQL executes files from `docker-entrypoint-initdb.d` only when creating
a new, empty database cluster. Keycloak starts with `--import-realm`, but its
`IGNORE_EXISTING` behavior skips the imported realm when that realm already
exists in the database. These mounts initialize new environments; they do not
replace ongoing database migrations or backups.

## Environment variable interpolation

Compose reads the root `.env` file for substitutions such as:

```yaml
POSTGRES_USER: ${POSTGRES_USER:-hizmet}
```

The syntax means “use `POSTGRES_USER` if it exists; otherwise use `hizmet`.”

This declaration is stricter:

```yaml
AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET must be set in .env}
```

Compose stops with an error if `AUTH_SECRET` is missing or empty.

The `.env` file is excluded from both Git and Docker build contexts. It may
contain secrets and must not be committed.

## Health check and dependency

A running process is not necessarily ready to serve requests. A health check
runs a probe inside the container. PostgreSQL uses `pg_isready`; the API and
web services use Node's built-in `fetch`.

`depends_on` expresses startup ordering:

- Keycloak waits for PostgreSQL to be healthy;
- the API waits for PostgreSQL to be healthy and Keycloak to start;
- the web service waits for the API to become healthy and Keycloak to start.

Health checks improve startup behavior, but they are not a complete monitoring
system. Runtime monitoring and alerting are separate operational concerns.

## Restart policy

Every service uses:

```yaml
restart: unless-stopped
```

Docker restarts the service after a crash or Docker daemon restart, except when
an operator explicitly stopped it. The policy does not repair invalid
configuration or a permanently failing application; logs must still be
inspected.
