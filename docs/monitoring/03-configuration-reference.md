# Configuration Reference

This chapter explains every configuration file of the monitoring stack and the
reasoning behind individual settings.

| File                                                                                                                                         | Read by        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| [`compose.monitoring.yaml`](../../compose.monitoring.yaml)                                                                                   | Docker Compose |
| [`infra/monitoring/telegraf/telegraf.conf`](../../infra/monitoring/telegraf/telegraf.conf)                                                   | Telegraf       |
| [`infra/monitoring/prometheus/prometheus.yml`](../../infra/monitoring/prometheus/prometheus.yml)                                             | Prometheus     |
| [`infra/monitoring/grafana/provisioning/datasources/prometheus.yml`](../../infra/monitoring/grafana/provisioning/datasources/prometheus.yml) | Grafana        |
| [`infra/monitoring/grafana/provisioning/dashboards/dashboards.yml`](../../infra/monitoring/grafana/provisioning/dashboards/dashboards.yml)   | Grafana        |
| [`infra/monitoring/grafana/dashboards/hizmet-containers.json`](../../infra/monitoring/grafana/dashboards/hizmet-containers.json)             | Grafana        |

## `compose.monitoring.yaml`

### Project name and network

```yaml
name: hizmet-monitoring

networks:
  hizmet:
    name: hizmet_default
    external: true
```

- `name: hizmet-monitoring` makes this a separate Compose project, so container
  names become `hizmet-monitoring-<service>-1` and `docker compose down` on one
  project never removes containers of the other.
- The `hizmet` network is declared `external` because it is owned by the
  application project. Services are attached with `networks: [hizmet]`, which
  allows them to reach `keycloak:9000` and `postgres:5432` by service name.

### `telegraf`

```yaml
telegraf:
  image: telegraf:1.35
  user: root
  entrypoint: ['telegraf']
  volumes:
    - ./infra/monitoring/telegraf/telegraf.conf:/etc/telegraf/telegraf.conf:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
  ports:
    - '127.0.0.1:9273:9273'
  networks: [hizmet]
  restart: unless-stopped
```

| Setting                       | Reason                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user: root`                  | The Docker socket inside Docker Desktop is only accessible to `root`.                                                                                                                                                                                        |
| `entrypoint: ['telegraf']`    | The image's default entrypoint script drops privileges to the `telegraf` user, which then loses socket access. Overriding it keeps the process running as `root`. See [Problem 4](04-troubleshooting.md#problem-4-telegraf-permission-denied-on-dockersock). |
| `telegraf.conf` mount (`:ro`) | The configuration is versioned in Git and must not be modified by the container.                                                                                                                                                                             |
| `docker.sock` mount           | The data source: the Docker Engine API.                                                                                                                                                                                                                      |
| `127.0.0.1:9273:9273`         | Publishes the raw metrics for debugging, on this machine only. Prometheus does not need it (it uses `telegraf:9273` on the Docker network).                                                                                                                  |
| `restart: unless-stopped`     | Starts again after a Docker or machine restart, unless it was stopped manually.                                                                                                                                                                              |

### `postgres-exporter`

```yaml
postgres-exporter:
  image: quay.io/prometheuscommunity/postgres-exporter:v0.17.1
  environment:
    DATA_SOURCE_NAME: postgresql://${POSTGRES_USER:-hizmet}:${POSTGRES_PASSWORD:-hizmet_dev_password}@postgres:5432/${POSTGRES_DB:-hizmet}?sslmode=disable
```

It reuses the application's PostgreSQL credentials from `.env` (same defaults as
[`compose.yaml`](../../compose.yaml)). `sslmode=disable` is acceptable because the
connection never leaves the private Docker network. The exporter publishes no
host port; only Prometheus reads it.

> [!NOTE]
> The exporter uses the application's database user for simplicity. In a
> production setup, create a dedicated user with the built-in `pg_monitor` role
> instead.

### `prometheus`

```yaml
prometheus:
  image: prom/prometheus:v3.5.0
  command:
    - --config.file=/etc/prometheus/prometheus.yml
    - --storage.tsdb.path=/prometheus
    - --storage.tsdb.retention.time=15d
  volumes:
    - ./infra/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  ports:
    - '127.0.0.1:9090:9090'
  depends_on:
    - telegraf
    - postgres-exporter
```

- `retention.time=15d` bounds disk usage. Increase it if longer history is
  required; the storage cost grows linearly.
- `prometheus_data` is a named volume so history survives container
  re-creation.
- `depends_on` only controls start order; it does not wait for readiness.
  Prometheus simply marks a target `DOWN` until it responds.

### `grafana`

```yaml
grafana:
  image: grafana/grafana:12.2.0
  environment:
    GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set in .env}
    GF_USERS_ALLOW_SIGN_UP: 'false'
  volumes:
    - grafana_data:/var/lib/grafana
    - ./infra/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    - ./infra/monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
  ports:
    - '127.0.0.1:3002:3000'
```

- The `:?` syntax makes `docker compose` abort when the password is missing,
  so Grafana is never started with a default `admin/admin` login.
- `GF_USERS_ALLOW_SIGN_UP=false` disables self-registration.
- The provisioning and dashboards directories are mounted read-only; everything
  that must be reproducible lives in Git.
- Only the first start applies `GF_SECURITY_ADMIN_PASSWORD`. If the password is
  changed later in `.env`, change it in Grafana as well (or reset it with
  `docker compose -f compose.monitoring.yaml exec grafana grafana cli admin reset-admin-password <new>`).

## `telegraf.conf`

```toml
[agent]
  interval = "15s"
  round_interval = true
  flush_interval = "15s"
  omit_hostname = true

[[inputs.docker]]
  endpoint = "unix:///var/run/docker.sock"
  gather_services = false
  timeout = "10s"
  perdevice_include = []
  total_include = ["cpu", "network", "blkio"]
  docker_label_include = ["com.docker.compose.service"]

[[outputs.prometheus_client]]
  listen = ":9273"
  metric_version = 2
  expiration_interval = "60s"
  collectors_exclude = ["gocollector", "process"]
```

| Setting                       | Meaning                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `interval = "15s"`            | Collect once per Prometheus scrape interval; no value is lost or duplicated.                     |
| `omit_hostname = true`        | Do not add a `host` label; there is only one Docker host.                                        |
| `gather_services = false`     | Swarm services are not used.                                                                     |
| `perdevice_include = []`      | Do not emit one CPU series per core. This keeps cardinality low.                                 |
| `total_include = [...]`       | Emit one aggregated series per container for CPU, network, and block I/O.                        |
| `docker_label_include`        | Adds the label `com_docker_compose_service` (for example `api`, `web`) next to `container_name`. |
| `expiration_interval = "60s"` | Metrics of removed containers disappear after one minute instead of lingering.                   |
| `collectors_exclude`          | Hides Telegraf's own Go-runtime and process metrics to reduce noise.                             |

### Metric names produced

| Metric                                                              | Unit            | Notes                                                   |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| `docker_container_cpu_usage_percent`                                | percent         | `100` = one full core (same as `docker stats`)          |
| `docker_container_mem_usage`                                        | bytes           | Memory without page cache, comparable to `docker stats` |
| `docker_container_mem_limit`                                        | bytes           | Container memory limit (the VM size if none is set)     |
| `docker_container_net_rx_bytes` / `_tx_`                            | bytes (counter) | Use `rate(...[1m])` to get bytes per second             |
| `docker_container_blkio_io_service_bytes_recursive_read` / `_write` | bytes (counter) | Disk I/O                                                |

Inspect everything that is available at any time:

```bash
curl -s localhost:9273/metrics | grep '^# TYPE docker_container' | sort
```

> [!NOTE]
> Telegraf publishes all of these metrics with the type `untyped`, so Prometheus
> does not know which ones are counters. A query such as
> `rate(docker_container_net_rx_bytes[1m])` still returns correct values but the
> API adds an informational message: `metric might not be a counter, name does
not end in _total/_sum/_count/_bucket`. It is harmless and can be ignored.

## `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: telegraf
    static_configs:
      - targets: ['telegraf:9273']

  - job_name: postgres
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: keycloak
    metrics_path: /metrics
    static_configs:
      - targets: ['keycloak:9000']
```

| Job          | Target                   | Notes                                                                                                        |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `prometheus` | `localhost:9090`         | Prometheus monitors itself.                                                                                  |
| `telegraf`   | `telegraf:9273`          | Container CPU/RAM/network/disk.                                                                              |
| `postgres`   | `postgres-exporter:9187` | PostgreSQL internals.                                                                                        |
| `keycloak`   | `keycloak:9000`          | Keycloak 26 serves metrics on the **management port 9000**, not on 8080. Requires `KC_METRICS_ENABLED=true`. |

A commented-out `hizmet-api` job is kept in the file as a placeholder for the
next phase (application metrics from the NestJS API).

### Applying changes

Prometheus reads the file at startup. After editing it, recreate or restart the
container:

```bash
docker compose -f compose.monitoring.yaml up -d --force-recreate prometheus
```

Validate the syntax first, without starting anything:

```bash
docker run --rm --entrypoint promtool \
  -v "$PWD/infra/monitoring/prometheus/prometheus.yml:/prometheus.yml:ro" \
  prom/prometheus:v3.5.0 check config /prometheus.yml
```

## Grafana provisioning

### Data source

[`datasources/prometheus.yml`](../../infra/monitoring/grafana/provisioning/datasources/prometheus.yml)
registers Prometheus automatically:

```yaml
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

The fixed `uid: prometheus` matters: the dashboard JSON references the data
source by this UID, so the dashboard works on any fresh Grafana instance.
`access: proxy` means the Grafana server (not your browser) calls Prometheus,
which is why the internal hostname `prometheus` resolves.

### Dashboard provider

[`dashboards/dashboards.yml`](../../infra/monitoring/grafana/provisioning/dashboards/dashboards.yml)
tells Grafana to load every JSON file from `/var/lib/grafana/dashboards` into the
folder **Hizmet**. Grafana re-scans the directory periodically (about every 10
seconds), so editing the JSON file updates the dashboard without a restart.
`allowUiUpdates: true` lets you experiment in the UI; changes made there are
**not** written back to the file. Export the JSON and commit it to keep them.

## Dashboard queries

The dashboard [`hizmet-containers.json`](../../infra/monitoring/grafana/dashboards/hizmet-containers.json)
selects the project's containers with the regular expression
`container_name=~"hizmet-.+"`, which matches both the application and the
monitoring containers.

| Panel                     | PromQL                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| CPU (current and history) | `sum by (container_name) (docker_container_cpu_usage_percent{container_name=~"hizmet-.+"})`      |
| RAM (current and history) | `sum by (container_name) (docker_container_mem_usage{container_name=~"hizmet-.+"})`              |
| Network receive           | `sum by (container_name) (rate(docker_container_net_rx_bytes{container_name=~"hizmet-.+"}[1m]))` |
| Network transmit          | `sum by (container_name) (rate(docker_container_net_tx_bytes{container_name=~"hizmet-.+"}[1m]))` |
| PostgreSQL connections    | `pg_stat_database_numbackends{datname!~"template.*"}`                                            |
| Target health             | `up`                                                                                             |

`sum by (container_name)` guarantees exactly one series per container even if
extra labels (such as an image version) change after a rebuild.

## Environment variables

| Variable                 | Default (in Compose)  | Required | Purpose                     |
| ------------------------ | --------------------- | -------- | --------------------------- |
| `GRAFANA_ADMIN_USER`     | `admin`               | No       | Grafana admin login         |
| `GRAFANA_ADMIN_PASSWORD` | —                     | **Yes**  | Grafana admin password      |
| `POSTGRES_USER`          | `hizmet`              | No       | Shared with the application |
| `POSTGRES_PASSWORD`      | `hizmet_dev_password` | No       | Shared with the application |
| `POSTGRES_DB`            | `hizmet`              | No       | Shared with the application |
