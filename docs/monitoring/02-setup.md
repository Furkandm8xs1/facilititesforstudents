# Setup, Step by Step

This chapter reproduces the complete setup of the monitoring stack. Each step
lists the **command**, the **expected output**, and what the step does and why.

Run all commands from the repository root.

## Requirements

| Requirement                | Why                                                              | How to check                  |
| -------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Docker Desktop (or Engine) | Runs all containers                                              | `docker version`              |
| Docker Compose v2          | The `docker compose` subcommand and the `name:` top-level key     | `docker compose version`      |
| Application stack started  | Creates the shared `hizmet_default` network                      | `docker network ls`           |
| Free local ports           | `3002` (Grafana), `9090` (Prometheus), `9273` (Telegraf)          | `lsof -i :3002 -i :9090 -i :9273` |
| Internet access (first run) | Pulls four images (Telegraf alone is ≈ 170 MB)                  | —                             |
| `.env` file                | Holds the Grafana admin password                                 | `ls -la .env`                 |

Measured resource cost of the monitoring stack at idle on the development
machine (`docker stats`): below 1 % CPU and about 265 MB RAM in total — Grafana
≈ 146 MB, Prometheus ≈ 53 MB, Telegraf ≈ 54 MB, postgres-exporter ≈ 13 MB.
Prometheus memory grows slowly with the number of series and the retention
period.

## Step 1 — Make sure the application stack is running

```bash
docker compose ps
```

Expected: the four application services (`api`, `keycloak`, `postgres`, `web`)
are listed as `running`, and `api`, `postgres`, `web` are `healthy`.

Then verify that the shared network exists:

```bash
docker network ls --filter name=hizmet_default
```

Expected output:

```text
NETWORK ID     NAME              DRIVER    SCOPE
xxxxxxxxxxxx   hizmet_default    bridge    local
```

If the network is missing, start the application first:

```bash
docker compose up -d
```

## Step 2 — Enable Keycloak metrics

Keycloak exposes Prometheus metrics only when `KC_METRICS_ENABLED` is set. This
is the single change to the application's [`compose.yaml`](../../compose.yaml):

```yaml
  keycloak:
    environment:
      KC_HEALTH_ENABLED: 'true'
      KC_METRICS_ENABLED: 'true'   # added for monitoring
```

Environment variables are read at container creation, so the container must be
**recreated** (a plain restart is not enough):

```bash
docker compose up -d keycloak
```

Expected output (abridged):

```text
 ✔ Container hizmet-postgres-1 Healthy
 ✔ Container hizmet-keycloak-1 Recreated
 ✔ Container hizmet-keycloak-1 Started
```

> [!WARNING]
> Recreating Keycloak restarts it for roughly 30–60 seconds. Active login
> sessions may be interrupted. Do this outside of a demo or an exam window.

Keycloak needs about a minute to become ready. Until then Prometheus reports
the `keycloak` target as `DOWN`.

## Step 3 — Configure Grafana credentials

The monitoring Compose file refuses to start without an admin password:

```yaml
GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set in .env}
```

Append the credentials to your **local** `.env` (this file is git-ignored):

```bash
echo 'GRAFANA_ADMIN_USER=admin' >> .env
echo 'GRAFANA_ADMIN_PASSWORD=choose-a-strong-password' >> .env
```

[`.env.example`](../../.env.example) contains placeholder entries for both
variables so that new developers know they exist.

Without the variable, Compose stops with:

```text
error while interpolating services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD:
required variable GRAFANA_ADMIN_PASSWORD is missing a value:
GRAFANA_ADMIN_PASSWORD must be set in .env
```

## Step 4 — Validate the Compose file

```bash
docker compose -f compose.monitoring.yaml config --quiet && echo OK
```

Expected output:

```text
OK
```

This parses the file, interpolates variables, and reports syntax or missing
variable errors. No container is created.

## Step 5 — Start the monitoring stack

```bash
docker compose -f compose.monitoring.yaml up -d
```

The first run pulls the images (Telegraf ≈ 170 MB, Grafana, Prometheus,
postgres-exporter). Expected final lines:

```text
 ✔ Container hizmet-monitoring-postgres-exporter-1 Started
 ✔ Container hizmet-monitoring-telegraf-1          Started
 ✔ Container hizmet-monitoring-prometheus-1        Started
 ✔ Container hizmet-monitoring-grafana-1           Started
```

Check the state:

```bash
docker compose -f compose.monitoring.yaml ps
```

Expected: four services with status `Up`.

```text
NAME                                    IMAGE                                                   COMMAND                  SERVICE             CREATED         STATUS         PORTS
hizmet-monitoring-grafana-1             grafana/grafana:12.2.0                                  "/run.sh"                grafana             1 minute ago    Up 1 minute    127.0.0.1:3002->3000/tcp
hizmet-monitoring-postgres-exporter-1   quay.io/prometheuscommunity/postgres-exporter:v0.17.1   "/bin/postgres_expor…"   postgres-exporter   1 minute ago    Up 1 minute    9187/tcp
hizmet-monitoring-prometheus-1          prom/prometheus:v3.5.0                                  "/bin/prometheus --c…"   prometheus          1 minute ago    Up 1 minute    127.0.0.1:9090->9090/tcp
hizmet-monitoring-telegraf-1            telegraf:1.35                                           "telegraf"               telegraf            1 minute ago    Up 1 minute    127.0.0.1:9273->9273/tcp
```

The monitoring services intentionally have no health checks, so `Up` (without
`(healthy)`) is the expected status.

## Step 6 — Verify that Telegraf sees the containers

Telegraf needs one collection interval (15 s) before data appears. Wait about
20 seconds, then run:

```bash
curl -s localhost:9273/metrics | grep -E '^docker_container_mem_usage\{' | cut -c1-200
```

Expected: one line per running container, each containing a `container_name`
label such as `hizmet-api-1`, `hizmet-web-1`, `hizmet-keycloak-1`, or
`hizmet-postgres-1`, and ending with a byte value:

```text
docker_container_mem_usage{com_docker_compose_service="api",container_id="48fb...",container_name="hizmet-api-1",...} 6.1e+07
docker_container_mem_usage{com_docker_compose_service="keycloak",...,container_name="hizmet-keycloak-1",...} 7.03000576e+08
```

An empty result means Telegraf cannot read the Docker socket; check
`docker logs hizmet-monitoring-telegraf-1` and see
[Problem 4](04-troubleshooting.md#problem-4-telegraf-permission-denied-on-dockersock).

## Step 7 — Verify the Prometheus targets

Open `http://localhost:9090/targets`, or query the API:

```bash
curl -s localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'
```

Expected output (four targets, all up):

```text
"health":"up"
"health":"up"
"health":"up"
"health":"up"
```

In the web UI the targets are: `keycloak`, `postgres`, `prometheus`, `telegraf`,
each with state **UP**.

Test the same query the dashboard uses:

```bash
curl -s -G localhost:9090/api/v1/query \
  --data-urlencode 'query=sum by (container_name) (docker_container_cpu_usage_percent{container_name=~"hizmet-.+"})'
```

Expected: a JSON document with `"status":"success"` and one result per
container (eight in total when both stacks are running).

## Step 8 — Open Grafana

1. Open `http://localhost:3002`.
2. Log in with `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` from `.env`.
3. Go to **Dashboards → Hizmet → Hizmet - Container Kaynak Kullanımı**.

Expected panels:

| Panel                             | What it shows                                              |
| --------------------------------- | ---------------------------------------------------------- |
| Anlık CPU (çekirdek %)            | Current CPU per container (100 = one full core)            |
| Anlık RAM                         | Current memory per container                               |
| CPU kullanımı (zaman içinde)      | CPU history with mean/max/last in the legend               |
| RAM kullanımı (zaman içinde)      | Memory history with mean/max/last in the legend            |
| Network (alınan / gönderilen)     | Receive and transmit rate per container                    |
| PostgreSQL aktif bağlantılar      | Active connections per database                            |
| Scrape hedefleri (1 = ayakta)     | UP/DOWN state of every Prometheus target                   |

The graphs fill up over the first few minutes. The dashboard refreshes every
10 seconds.

> [!NOTE]
> CPU values follow the `docker stats` convention: `100` equals one fully used
> CPU core. A container using four cores reports `400`. The bar gauge is capped
> at 100, so a multi-core container appears as a full bar.

## Step 9 — Verify the shutdown path (optional)

Confirm that the monitoring stack can be stopped without affecting the
application:

```bash
docker compose -f compose.monitoring.yaml down
docker compose ps          # application stack is still running
docker compose -f compose.monitoring.yaml up -d
```

Metric history is preserved because `down` does not delete volumes.

## Checklist

- [ ] `docker network ls` shows `hizmet_default`
- [ ] Keycloak was recreated after adding `KC_METRICS_ENABLED`
- [ ] `.env` contains `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`
- [ ] `docker compose -f compose.monitoring.yaml ps` lists four services as `Up`
- [ ] All four Prometheus targets are `UP`
- [ ] The Grafana dashboard shows CPU and RAM for all containers
