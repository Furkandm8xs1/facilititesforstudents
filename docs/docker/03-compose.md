# Docker Compose Explained

Docker Compose describes the complete four-service system in one YAML file. It
defines which images to build or download, runtime environment variables,
published ports, storage, startup dependencies, health checks, restart
policies, and network aliases.

The canonical file is [`compose.yaml`](../../compose.yaml).

## Complete compose.yaml

```yaml
name: hizmet

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-hizmet}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-hizmet_dev_password}
      POSTGRES_DB: ${POSTGRES_DB:-hizmet}
    ports:
      - '127.0.0.1:${POSTGRES_PORT:-55432}:5432'
    volumes:
      - postgres_data:/var/lib/postgresql
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'pg_isready -U ${POSTGRES_USER:-hizmet} -d ${POSTGRES_DB:-hizmet}',
        ]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  keycloak:
    image: quay.io/keycloak/keycloak:26.7.2
    command: start-dev --import-realm
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN:-admin}
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-change-me}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-hizmet}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD:-hizmet_dev_password}
      KC_HEALTH_ENABLED: 'true'
    ports:
      - '8080:8080'
    volumes:
      - ./infra/keycloak:/opt/keycloak/data/import:ro
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      default:
        aliases:
          - keycloak.localhost
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      API_PORT: '3001'
      CORS_ORIGIN: http://localhost:3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-hizmet}:${POSTGRES_PASSWORD:-hizmet_dev_password}@postgres:5432/${POSTGRES_DB:-hizmet}
      KEYCLOAK_ISSUER: http://keycloak.localhost:8080/realms/hizmet
      KEYCLOAK_AUDIENCE: ${KEYCLOAK_AUDIENCE:-portal-api}
      KEYCLOAK_ADMIN_CLIENT_ID: ${KEYCLOAK_ADMIN_CLIENT_ID:-portal-admin-service}
      KEYCLOAK_ADMIN_CLIENT_SECRET: ${KEYCLOAK_ADMIN_CLIENT_SECRET:-hizmet-local-admin-service-secret}
      KEYCLOAK_PORTAL_API_CLIENT_UUID: ${KEYCLOAK_PORTAL_API_CLIENT_UUID:-844594e4-a183-46a3-80a7-97fdb6236d20}
    ports:
      - '127.0.0.1:3001:3001'
    depends_on:
      postgres:
        condition: service_healthy
      keycloak:
        condition: service_started
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3001/api/v1/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))",
        ]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    environment:
      AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET must be set in .env}
      AUTH_TRUST_HOST: 'true'
      AUTH_URL: http://localhost:3000
      AUTH_KEYCLOAK_ID: ${AUTH_KEYCLOAK_ID:-portal-web}
      AUTH_KEYCLOAK_SECRET: ${KEYCLOAK_WEB_CLIENT_SECRET:-hizmet-local-web-secret}
      AUTH_KEYCLOAK_ISSUER: http://keycloak.localhost:8080/realms/hizmet
      API_BASE_URL: http://api:3001/api/v1
      HOSTNAME: 0.0.0.0
      PORT: '3000'
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      api:
        condition: service_healthy
      keycloak:
        condition: service_started
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/login').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))",
        ]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped

volumes:
  postgres_data:
```

## Project name

```yaml
name: hizmet
```

The explicit project name makes generated resource names predictable:

- containers are named like `hizmet-api-1`;
- the default network is `hizmet_default`;
- the named volume is `hizmet_postgres_data`;
- locally built images are named `hizmet-api` and `hizmet-web`.

Without an explicit name, Compose normally derives the project name from the
directory or a command-line option.

## Services

`services` is a map of logical service names. A service describes how to run
one or more equivalent containers. This local stack runs one container for each
service.

The service name also becomes a DNS hostname on the Compose network. For
example, the API can connect to `postgres:5432` because the database service is
named `postgres`.

## PostgreSQL service

### Image

```yaml
image: postgres:18-alpine
```

Compose pulls the official PostgreSQL 18 Alpine image when it is not already
available locally. Pinning `18-alpine` avoids silently moving to a different
major PostgreSQL version.

### Initialization environment

```yaml
environment:
  POSTGRES_USER: ${POSTGRES_USER:-hizmet}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-hizmet_dev_password}
  POSTGRES_DB: ${POSTGRES_DB:-hizmet}
```

The official image uses these variables when initializing an empty data
directory:

- `POSTGRES_USER` creates the initial database role;
- `POSTGRES_PASSWORD` sets its password;
- `POSTGRES_DB` creates the default application database.

Changing these values after a volume has already been initialized does not
rename existing roles or databases. Environment variables configure the
initialization process; the persisted cluster remains authoritative afterward.

### Port publication

```yaml
ports:
  - '127.0.0.1:${POSTGRES_PORT:-55432}:5432'
```

PostgreSQL listens on `5432` inside the container. The host publishes it on
`127.0.0.1:55432` by default. Binding to `127.0.0.1` prevents other machines
on the local network from connecting directly.

Keycloak and the API do not use host port `55432`. They connect through the
private network on `postgres:5432`.

### Persistent and initialization mounts

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
  - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
```

The first line is a named volume. It owns the PostgreSQL data files and survives
container replacement.

The second line is a read-only bind mount. The official image executes
initialization files from this directory only when the database cluster is
empty. The project uses it to create the separate `keycloak` database.

### PostgreSQL health check

```yaml
healthcheck:
  test:
    [
      'CMD-SHELL',
      'pg_isready -U ${POSTGRES_USER:-hizmet} -d ${POSTGRES_DB:-hizmet}',
    ]
  interval: 5s
  timeout: 5s
  retries: 10
```

`pg_isready` checks whether PostgreSQL accepts connections. Docker executes
the probe every five seconds, waits up to five seconds per probe, and marks the
container unhealthy after ten consecutive failures.

`CMD-SHELL` runs the probe through the container shell, allowing variable
substitution in the command.

## Keycloak service

### Image and command

```yaml
image: quay.io/keycloak/keycloak:26.7.2
command: start-dev --import-realm
```

The image version is pinned to Keycloak 26.7.2. `command` overrides the
image's default arguments:

- `start-dev` runs Keycloak's development mode, suitable for this local stack;
- `--import-realm` checks the mounted import directory during startup.

`start-dev` is not a production internet deployment configuration. A public
deployment should use Keycloak production mode, HTTPS, explicit hostname
settings, hardened secrets, and an appropriate reverse proxy.

### Database configuration

```yaml
environment:
  KC_DB: postgres
  KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
  KC_DB_USERNAME: ${POSTGRES_USER:-hizmet}
  KC_DB_PASSWORD: ${POSTGRES_PASSWORD:-hizmet_dev_password}
```

Keycloak stores its state in the `keycloak` database inside the PostgreSQL
service. The hostname is the Compose service name and the port is PostgreSQL's
internal port.

Keycloak is therefore stateless with respect to its own container filesystem.
Replacing the Keycloak container does not delete users or roles as long as the
PostgreSQL volume remains.

### Bootstrap administrator

```yaml
KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN:-admin}
KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-change-me}
```

These values bootstrap administrative access when required. Development
defaults must be replaced outside a disposable local environment.

### Realm import

```yaml
volumes:
  - ./infra/keycloak:/opt/keycloak/data/import:ro
```

The repository's realm JSON is visible to Keycloak as read-only input. On an
existing database, Keycloak reports that the realm already exists and skips the
import. Changing the JSON does not automatically update an already imported
realm; ongoing changes must be applied deliberately through Keycloak
administration or an explicit import strategy.

### Startup dependency

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

Compose starts Keycloak only after the PostgreSQL health check succeeds. This
prevents normal startup from racing the database initialization.

### Network alias

```yaml
networks:
  default:
    aliases:
      - keycloak.localhost
```

The alias makes `keycloak.localhost` resolve to the Keycloak container from
other containers. On the host, `keycloak.localhost` resolves to loopback and
uses published port 8080. This shared hostname gives browser and server-side
OpenID Connect clients the same issuer URL.

### Health support

```yaml
KC_HEALTH_ENABLED: 'true'
```

This enables Keycloak health endpoints on its management interface. The current
Compose file does not define a Docker health check for Keycloak; API and web
startup dependencies use `service_started`. Authentication discovery and
token requests still fail visibly if Keycloak has not become ready.

## API service

### Local image build

```yaml
build:
  context: .
  dockerfile: Dockerfile.api
```

Compose builds from the repository root using `Dockerfile.api`. The root is
needed for the npm workspace lockfile and manifests.

### Runtime environment

```yaml
API_PORT: '3001'
CORS_ORIGIN: http://localhost:3000
DATABASE_URL: postgresql://...@postgres:5432/hizmet
KEYCLOAK_ISSUER: http://keycloak.localhost:8080/realms/hizmet
```

- `API_PORT` selects the internal NestJS port;
- `CORS_ORIGIN` permits browser requests from the local portal origin;
- `DATABASE_URL` connects to PostgreSQL over the private network;
- `KEYCLOAK_ISSUER` is both the expected token issuer and the JWKS base URL.

The remaining Keycloak variables configure the access-token audience and the
service account used for user and role administration.

### API port

```yaml
ports:
  - '127.0.0.1:3001:3001'
```

Publishing the API locally makes its public health endpoint and debugging
requests available from the host. The web container uses `api:3001` instead
of this host mapping.

### API startup dependencies

```yaml
depends_on:
  postgres:
    condition: service_healthy
  keycloak:
    condition: service_started
```

The database must be healthy before the API entrypoint runs migrations.
Keycloak must at least be started. The API initializes its Keycloak network
clients lazily, so it can start before the identity server completes every
startup task.

### API health check

```yaml
healthcheck:
  test:
    [
      'CMD',
      'node',
      '-e',
      "fetch('http://127.0.0.1:3001/api/v1/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))",
    ]
  interval: 5s
  timeout: 5s
  retries: 12
  start_period: 10s
```

`CMD` is the exec-form health check. It launches Node directly without a
shell. Node.js 24 includes `fetch`, so the runtime image does not need curl.

The probe exits successfully only for an HTTP success response. `start_period`
allows ten seconds for migrations and NestJS startup before failures count
toward the retry limit.

## Web service

### Local image build

```yaml
build:
  context: .
  dockerfile: Dockerfile.web
```

Compose uses the Next.js standalone multi-stage build described in the
Dockerfile chapter.

### Auth.js configuration

```yaml
AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET must be set in .env}
AUTH_TRUST_HOST: 'true'
AUTH_URL: http://localhost:3000
AUTH_KEYCLOAK_ID: ${AUTH_KEYCLOAK_ID:-portal-web}
AUTH_KEYCLOAK_SECRET: ${KEYCLOAK_WEB_CLIENT_SECRET:-hizmet-local-web-secret}
AUTH_KEYCLOAK_ISSUER: http://keycloak.localhost:8080/realms/hizmet
```

- `AUTH_SECRET` encrypts and signs Auth.js session material and is mandatory;
- `AUTH_TRUST_HOST` allows the local host header in this deployment;
- `AUTH_URL` establishes the canonical public callback origin;
- the client ID and secret identify the confidential Keycloak web client;
- the issuer must match the issuer used in Keycloak tokens and discovery.

### Server-to-server API URL

```yaml
API_BASE_URL: http://api:3001/api/v1
```

Next.js server components and server actions call NestJS across the Compose
network. A browser cannot resolve the hostname `api`, but it does not need to:
these API calls are executed by the Next.js server.

### Listening address and port

```yaml
HOSTNAME: 0.0.0.0
PORT: '3000'
```

`0.0.0.0` tells Next.js to accept connections on the container interface.
Listening only on `127.0.0.1` inside the container would make the service
unreachable through Docker networking.

```yaml
ports:
  - '127.0.0.1:3000:3000'
```

The portal is published only on the host's loopback interface.

### Web dependency and health check

The web service waits until the API health check passes. Its own health check
requests `/login`, a public page that verifies the Next.js server is able to
serve the application without requiring a user session.

## Default network

No top-level custom `networks` declaration is required. Compose creates
`hizmet_default` automatically and connects all four services.

The internal request paths are:

| Caller   | Target     | Address used inside Docker                     |
| -------- | ---------- | ---------------------------------------------- |
| Web      | API        | `http://api:3001/api/v1`                       |
| API      | PostgreSQL | `postgresql://postgres:5432/hizmet`            |
| API      | Keycloak   | `http://keycloak.localhost:8080/realms/hizmet` |
| Keycloak | PostgreSQL | `jdbc:postgresql://postgres:5432/keycloak`     |

PostgreSQL is not reachable from the web container through an application
configuration path. Business data access is owned by the API.

## Named volume lifecycle

The top-level declaration:

```yaml
volumes:
  postgres_data:
```

tells Compose to create and manage a named volume. With project name `hizmet`,
the actual Docker object is `hizmet_postgres_data`.

Lifecycle examples:

| Command                        | Containers | Network | Named volume |
| ------------------------------ | ---------- | ------- | ------------ |
| `docker compose stop`          | Kept       | Kept    | Kept         |
| `docker compose restart`       | Kept       | Kept    | Kept         |
| `docker compose down`          | Removed    | Removed | Kept         |
| `docker compose down -v`       | Removed    | Removed | **Removed**  |
| `docker compose up -d --build` | Reconciled | Created | Reused       |

Removing an application image does not remove the database volume. Removing the
volume does remove the PostgreSQL cluster data.

## Startup graph

```text
postgres --healthy--> keycloak --started--+
    |                                    |
    +--healthy--> api --healthy----------+--> web
```

`depends_on` controls startup and Compose reconciliation. It does not mean a
service will permanently stop if a dependency later becomes unavailable. Each
application must still handle transient connection failures, and operators must
monitor runtime health.

## Validate the rendered configuration

Compose expands `.env` substitutions before creating containers. Validate the
file without starting anything:

```bash
docker compose config --quiet
```

To inspect the rendered configuration:

```bash
docker compose config
```

The second command prints resolved environment values and may expose secrets in
terminal history or logs. Use it carefully.
