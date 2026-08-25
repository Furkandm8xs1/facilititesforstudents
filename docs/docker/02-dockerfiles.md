# Dockerfiles Explained

This chapter reproduces the project's Docker build files and explains what each
section does. The repository copies shown here are intended for education. The
files at the repository root are the canonical versions used by Docker.

## Multi-stage build pattern

Both application images use multiple `FROM` instructions. Each `FROM` starts a
stage with its own filesystem.

The stages have distinct jobs:

1. **dependencies** installs packages needed to build the application;
2. **builder** copies source code and creates compiled output;
3. **runner** contains only the production runtime.

The final image is based only on the `runner` stage. Build tools and source files
that are not explicitly copied into that stage do not become part of the final
image.

This pattern provides:

- smaller production images;
- fewer unnecessary packages in the attack surface;
- deterministic builds through `npm ci`;
- better Docker layer caching;
- separation between compilation and execution.

## Complete Dockerfile.api

Canonical file: [`Dockerfile.api`](../../Dockerfile.api)

```dockerfile
FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS builder

COPY apps/api apps/api
RUN npm run build --workspace @hizmet/api

FROM node:24-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @hizmet/api --include-workspace-root=false \
  && npm cache clean --force

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh

RUN chmod +x apps/api/docker-entrypoint.sh \
  && chown -R node:node apps/api

USER node
WORKDIR /app/apps/api

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
```

### API dependencies stage

```dockerfile
FROM node:24-alpine AS dependencies
```

`node:24-alpine` provides Node.js 24 on Alpine Linux. Pinning the major Node.js
version matches the repository's `engines` declaration. Alpine produces a
compact base image.

`AS dependencies` names the stage so a later stage can inherit from or copy
from it.

```dockerfile
WORKDIR /app
```

This creates or selects `/app`. Relative paths in later `COPY`, `RUN`, and
runtime instructions are interpreted from this directory.

```dockerfile
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
```

This repository is an npm workspace monorepo. npm needs the root manifest, the
lockfile, and workspace manifests to reproduce the dependency graph. Both
workspace manifests are copied even though this image builds only the API,
because the root `workspaces` field declares `apps/*`.

Only dependency metadata is copied before `npm ci`. If application source code
changes while the manifests remain unchanged, Docker can reuse the dependency
layer.

```dockerfile
RUN npm ci
```

`npm ci` installs exactly the versions recorded in `package-lock.json`. It
fails when the manifest and lockfile disagree, making it more suitable for
repeatable image builds than an unconstrained install.

This stage includes development dependencies because the NestJS compiler and
TypeScript are needed during the build.

### API builder stage

```dockerfile
FROM dependencies AS builder
```

The builder starts from the completed dependency stage. It already has
`node_modules`, the workspace manifests, and the lockfile.

```dockerfile
COPY apps/api apps/api
```

The API source, migration SQL files, Nest configuration, and TypeScript
configuration are copied into the build stage. Files excluded by
`.dockerignore`, such as host `dist` directories, are not copied.

```dockerfile
RUN npm run build --workspace @hizmet/api
```

This runs the API workspace's `nest build` script. TypeScript output is written
under `apps/api/dist`. The current TypeScript build includes:

- `dist/src/main.js`, the compiled NestJS application;
- `dist/scripts/migrate.js`, the compiled migration runner.

Compilation happens while building the image, not every time the container
starts.

### API runner stage

```dockerfile
FROM node:24-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
```

The runtime begins from a fresh Node.js image. It does not inherit the builder's
filesystem. `NODE_ENV=production` tells Node libraries that this is a
production runtime.

```dockerfile
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
```

The manifests are copied again because the runtime stage performs its own
production-only dependency installation.

```dockerfile
RUN npm ci --omit=dev --workspace @hizmet/api --include-workspace-root=false \
  && npm cache clean --force
```

The flags have specific purposes:

- `--omit=dev` excludes development-only packages such as Vitest and the Nest
  CLI;
- `--workspace @hizmet/api` selects the API workspace;
- `--include-workspace-root=false` avoids installing root development tools
  that are not needed by the API;
- `npm cache clean --force` removes npm's download cache from the image layer
  after installation.

The resulting runtime still contains required packages such as NestJS,
PostgreSQL drivers, RxJS, and JOSE.

```dockerfile
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
```

Only compiled JavaScript is copied from the builder. Migration SQL files and the
entrypoint script are copied directly from the source context because the
container needs them at startup.

```dockerfile
RUN chmod +x apps/api/docker-entrypoint.sh \
  && chown -R node:node apps/api
```

`chmod +x` makes the shell script executable in the Linux image. `chown`
gives the built-in non-root `node` user ownership of the application
directory.

```dockerfile
USER node
WORKDIR /app/apps/api
```

The API does not run as root. This limits the effect of a compromised process.
The working directory is important because the migration runner resolves the
`migrations` directory relative to `process.cwd()`.

```dockerfile
EXPOSE 3001
```

This documents the expected container port. It does not publish the port on the
host; Compose performs that mapping.

```dockerfile
ENTRYPOINT ["./docker-entrypoint.sh"]
```

The JSON or “exec” form avoids an extra shell created by Docker. The script
becomes the initial container command.

## Complete API entrypoint

Canonical file:
[`apps/api/docker-entrypoint.sh`](../../apps/api/docker-entrypoint.sh)

```sh
#!/bin/sh
set -eu

node dist/scripts/migrate.js
exec node dist/src/main.js
```

Line by line:

- `#!/bin/sh` selects the portable POSIX shell included in Alpine Linux;
- `set -e` stops immediately if the migration command fails;
- `set -u` treats an unset shell variable as an error;
- `node dist/scripts/migrate.js` applies pending SQL migrations;
- `exec node dist/src/main.js` replaces the shell with the NestJS process.

`exec` is important. The Node.js process becomes PID 1 in the container and
receives Docker stop signals directly. NestJS can then run its shutdown hooks
instead of leaving a shell process between Docker and the application.

The migration runner uses a PostgreSQL advisory lock. If multiple API
containers start at the same time, only one migration runner can execute the
critical section at once. Applied filenames are recorded, so restarts skip
completed migrations.

If a migration fails, `set -e` prevents the API from starting against an
unexpected schema. Docker's restart policy will retry, but operators should
inspect the logs and fix the migration or configuration rather than relying on
infinite retries.

## Complete Dockerfile.web

Canonical file: [`Dockerfile.web`](../../Dockerfile.web)

```dockerfile
FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY apps/web apps/web
RUN npm run build --workspace @hizmet/web

FROM node:24-alpine AS runner

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
```

### Web dependencies stage

The first stage has the same caching strategy as the API:

1. start from Node.js 24 on Alpine;
2. select `/app`;
3. copy the root and workspace manifests;
4. install the locked dependency graph with `npm ci`.

The full dependency graph is present because Next.js, TypeScript, and the
workspace tooling are required to build the production output.

### Web builder stage

```dockerfile
FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
```

The build stage inherits installed dependencies. Telemetry is disabled for
non-interactive image builds.

```dockerfile
COPY apps/web apps/web
RUN npm run build --workspace @hizmet/web
```

This copies the Next.js application and runs `next build`. The build performs
TypeScript checking, route compilation, static generation where possible, and
output file tracing.

### Next.js standalone output

The web configuration contains:

```ts
import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  poweredByHeader: false,
};

export default nextConfig;
```

`output: 'standalone'` asks Next.js to trace the runtime files needed by each
route and create a minimal server under `.next/standalone`. The final image
does not need a complete `npm install`.

This is a monorepo, so `outputFileTracingRoot` points two levels above
`apps/web` to the repository root. That allows tracing to include dependencies
resolved from the root workspace.

The generated server is located at:

```text
apps/web/.next/standalone/apps/web/server.js
```

Static assets are generated separately under `.next/static`.

### Web runner stage

```dockerfile
FROM node:24-alpine AS runner
```

The runtime uses a clean Node.js image. It does not run `npm ci` because the
standalone output already contains its traced runtime dependencies.

```dockerfile
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000
```

- `NODE_ENV=production` enables production behavior;
- `NEXT_TELEMETRY_DISABLED=1` keeps telemetry disabled at runtime;
- `HOSTNAME=0.0.0.0` makes Next.js listen on the container network interface
  instead of only loopback;
- `PORT=3000` selects the internal service port.

```dockerfile
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
```

The final image creates a dedicated non-root account. Fixed IDs make file
ownership deterministic within the image.

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
```

The first copy brings in the minimal Next.js server and traced dependencies.
The second copy adds browser-facing JavaScript and CSS assets. The
`--chown` flag assigns ownership while copying and avoids an extra ownership
layer.

```dockerfile
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Next.js runs as the non-root user on internal port 3000. The JSON form of
`CMD` launches Node directly, so it receives container signals.

## Runtime environment versus build environment

The web image does not copy `.env` into the image. Compose injects Auth.js,
Keycloak, API, hostname, and port values when the container starts.

Server-only variables such as `API_BASE_URL` are read by Next.js on the server.
Variables prefixed with `NEXT_PUBLIC_` would be embedded into browser bundles
at build time, but this project does not use public runtime configuration for
these service URLs.

Keeping secrets out of image layers has two advantages:

- one image can be configured differently at runtime;
- image history does not contain local secrets.

## Complete .dockerignore

Canonical file: [`.dockerignore`](../../.dockerignore)

```dockerignore
.git
.gitignore
.backups
.data
.DS_Store
.env
.env.*
**/.next
**/dist
**/node_modules
coverage
node_modules
*.log
*.tsbuildinfo
```

The ignore file controls what Docker sends as build context:

| Pattern           | Reason                                                    |
| ----------------- | --------------------------------------------------------- |
| `.git`            | Git history is not required to build the images           |
| `.backups`        | Database backups may be large and contain sensitive data  |
| `.env`, `.env.*`  | Local secrets must not enter image layers                 |
| `.data`           | Local runtime data is not source code                     |
| `**/node_modules` | Linux dependencies must be installed inside the image     |
| `**/.next`        | Web output must be rebuilt for the image platform         |
| `**/dist`         | API output must be compiled inside the image              |
| `coverage`        | Test reports are not runtime dependencies                 |
| `*.log`           | Local logs are not image content                          |
| `*.tsbuildinfo`   | Host compiler caches are platform- and workspace-specific |

Ignoring host `node_modules` is especially important on macOS. Packages may
contain platform-specific binaries that cannot run in the Linux container.

## Cache behavior when files change

Docker invalidates a layer when the instruction or one of its input files
changes. All later layers in that stage are rebuilt.

Examples:

- changing only an API `.ts` file reuses `npm ci` and reruns the API build;
- changing `package-lock.json` invalidates dependency installation for both
  application images;
- changing only README documentation does not affect source copied by the
  application stages, although the build context metadata may still be checked;
- building with `--no-cache` intentionally disables layer reuse.

Normal rebuild:

```bash
docker compose build api web
```

Diagnostic clean rebuild:

```bash
docker compose build --no-cache api web
```

Use `--no-cache` only when investigating cache behavior or forcing dependency
reinstallation; it makes builds slower.
