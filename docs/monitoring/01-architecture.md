# Monitoring Architecture

This chapter explains how the monitoring stack is structured, how data flows
through it, and which design decisions were made — in particular why container
metrics come from **Telegraf** and not from **cAdvisor**.

## Metrics pipeline in one picture

```text
                       Docker Desktop VM
 +------------------------------------------------------------+
 |                                                            |
 |  hizmet-web   hizmet-api   hizmet-keycloak   hizmet-postgres
 |      |            |              |                 |       |
 |      +------------+--------------+-----------------+       |
 |                   Docker Engine API                        |
 |                   /var/run/docker.sock                     |
 |                          ^                                 |
 |                          | read-only mount                 |
 |                      telegraf :9273  --+                   |
 |                                        |                   |
 |  postgres-exporter :9187  -------------+--> prometheus     |
 |  keycloak :9000 (/metrics) ------------+       :9090       |
 |                                                  |         |
 |                                                  v         |
 |                                              grafana :3000 |
 +--------------------------------------------------|---------+
                                                    |
                              127.0.0.1:3002  <-----+
                              (your browser)
```

Reading the picture from left to right:

1. **Sources** produce metrics:
   - `telegraf` asks the Docker Engine API for the live statistics of every
     running container (the same data `docker stats` prints).
   - `postgres-exporter` connects to PostgreSQL and turns internal statistics
     into metrics.
   - `keycloak` serves its own metrics on its management port `9000`.
2. **Prometheus** pulls ("scrapes") each source over HTTP every 15 seconds and
   stores the values in a time-series database.
3. **Grafana** queries Prometheus and draws the dashboards.

Prometheus uses a **pull model**: the sources never push data. This is why the
configuration of "what is monitored" lives in exactly one place,
[`prometheus.yml`](../../infra/monitoring/prometheus/prometheus.yml).

## Two Compose projects, one network

The repository contains two independent Compose files:

| File                      | Project name        | Contains                                                 |
| ------------------------- | ------------------- | -------------------------------------------------------- |
| `compose.yaml`            | `hizmet`            | `web`, `api`, `keycloak`, `postgres`                     |
| `compose.monitoring.yaml` | `hizmet-monitoring` | `telegraf`, `postgres-exporter`, `prometheus`, `grafana` |

They have separate lifecycles, which means the monitoring stack can be started,
stopped, upgraded, or deleted without touching the application.

To let Prometheus resolve the application's service names (`keycloak`) and the
exporter's target (`postgres`) by DNS, both projects share one Docker network.
The application project creates it automatically (`<project>_default` →
`hizmet_default`), and the monitoring project attaches to it as an **external**
network:

```yaml
networks:
  hizmet:
    name: hizmet_default
    external: true
```

Consequence: **the application stack must have been started at least once
before the monitoring stack**, otherwise the network does not exist and Compose
fails with `network hizmet_default declared as external, but could not be found`.

## Component decisions

### Why Prometheus + Grafana?

They are the de-facto open-source standard for container and service metrics.
The same stack later monitors the microservices (HTTP request counts, latency,
error rates) without introducing new tools; only new scrape targets are added.

### Why Telegraf instead of cAdvisor?

cAdvisor was the first choice because it is the most common container-metrics
exporter. On this machine it could not be made to work:

- Docker Desktop uses the **containerd image store**
  (`docker info` reports the driver type `io.containerd.snapshotter.v1`).
- cAdvisor discovers a container's writable layer by reading Docker's legacy
  `layerdb` directory. With the containerd image store this directory does not
  exist, so cAdvisor skips every container and only reports the root cgroup.

Telegraf's `docker` input plugin does not read storage internals at all. It uses
the public Docker Engine API, so it is independent of the storage driver and of
Docker Desktop internals. The full investigation is documented in
[04 — Troubleshooting](04-troubleshooting.md#problem-2-cadvisor-registers-no-containers).

| Property                         | cAdvisor on Docker Desktop | Telegraf `docker` input |
| -------------------------------- | -------------------------- | ----------------------- |
| Per-container CPU / RAM          | Not available              | Available               |
| Depends on Docker storage driver | Yes                        | No                      |
| Needs `privileged` / host mounts | Yes                        | No (socket only)        |
| Metric semantics                 | cgroup counters            | Same as `docker stats`  |

### Why `postgres-exporter`?

CPU and RAM tell how loaded the PostgreSQL _container_ is. The exporter adds the
view _inside_ the database: active connections per database, transaction
rates, and database sizes. The dashboard currently shows the connection count.

### Why a dedicated Grafana port (3002)?

Port `3000` is already used by the `web` container, so Grafana is published on
`127.0.0.1:3002`.

## Data retention and storage

| Data                    | Volume            | Retention / lifetime                      |
| ----------------------- | ----------------- | ----------------------------------------- |
| Prometheus time series  | `prometheus_data` | 15 days (`--storage.tsdb.retention.time`) |
| Grafana database        | `grafana_data`    | Until the volume is deleted               |
| Dashboards, data source | Git repository    | Provisioned from files on every start     |

The dashboard and the Prometheus data source are **provisioned from files**, so
they are reproducible: deleting the Grafana volume does not lose them.

## Security notes

1. **Local-only ports.** All published ports use the `127.0.0.1:` prefix. Do not
   change them to `0.0.0.0` without adding authentication and TLS in front.
2. **Docker socket access.** Telegraf mounts `/var/run/docker.sock` and runs as
   `root`. The `:ro` flag only makes the _socket file_ read-only; it does **not**
   restrict which Docker API calls can be made. Anyone who can execute code in
   the Telegraf container can control Docker. This is acceptable for local
   development. For a shared or production host, put a filtered socket proxy
   (for example `tecnativa/docker-socket-proxy` allowing only `GET /containers`
   and `GET /info`) between Telegraf and the Docker socket.
3. **Grafana credentials.** The admin password is required (`GRAFANA_ADMIN_PASSWORD`
   has no default) and is read from the git-ignored `.env` file.
4. **Keycloak metrics.** Keycloak's management port `9000` is not published to the
   host; it is reachable only from inside the Docker network.
