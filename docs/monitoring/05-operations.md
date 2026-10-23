# Operating the Monitoring Stack

This chapter covers the day-to-day lifecycle of the monitoring containers:
starting, stopping, restarting, inspecting, updating, backing up, and resetting.

Run all commands from the repository root. Every command needs the file flag,
because the monitoring stack is a separate Compose project:

```bash
docker compose -f compose.monitoring.yaml <command>
```

To shorten this, define a shell alias (optional, add it to `~/.zshrc`):

```bash
alias dcm='docker compose -f compose.monitoring.yaml'
```

The examples below spell out the full command.

## Quick reference

| Goal                                  | Command                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Start everything                      | `docker compose -f compose.monitoring.yaml up -d`                        |
| Stop everything (keep data)           | `docker compose -f compose.monitoring.yaml down`                         |
| Pause without removing containers     | `docker compose -f compose.monitoring.yaml stop`                         |
| Resume after `stop`                   | `docker compose -f compose.monitoring.yaml start`                        |
| Restart one service                   | `docker compose -f compose.monitoring.yaml restart prometheus`           |
| Apply configuration changes           | `docker compose -f compose.monitoring.yaml up -d --force-recreate <service>` |
| Show status                           | `docker compose -f compose.monitoring.yaml ps`                           |
| Follow logs                           | `docker compose -f compose.monitoring.yaml logs -f <service>`            |
| Stop and delete all metric history    | `docker compose -f compose.monitoring.yaml down -v` (**destructive**)    |

## Starting

### Prerequisites

1. The application stack has been started at least once (it owns the
   `hizmet_default` network): `docker compose up -d`.
2. `.env` contains `GRAFANA_ADMIN_PASSWORD`.

### Start all services

```bash
docker compose -f compose.monitoring.yaml up -d
```

- `-d` (detached) returns the terminal immediately.
- The command is **idempotent**: running it again changes nothing for services
  that are already up to date.
- Compose starts the services in dependency order: `telegraf` and
  `postgres-exporter` first, then `prometheus`, then `grafana`.

Expected output:

```text
 ✔ Container hizmet-monitoring-telegraf-1          Running
 ✔ Container hizmet-monitoring-postgres-exporter-1 Running
 ✔ Container hizmet-monitoring-prometheus-1        Running
 ✔ Container hizmet-monitoring-grafana-1           Running
```

(`Started` instead of `Running` on a fresh start.)

### Start a single service

```bash
docker compose -f compose.monitoring.yaml up -d grafana
```

Compose also starts the services that `grafana` depends on (`prometheus`).

### Verify after starting

```bash
docker compose -f compose.monitoring.yaml ps
curl -s localhost:9090/-/ready          # Prometheus: "Prometheus Server is Ready."
curl -s localhost:3002/api/health       # Grafana: JSON with "database": "ok"
curl -s localhost:9273/metrics | head -3
```

Allow about 20 seconds after a cold start for the first Telegraf collection and
Prometheus scrape; graphs fill up after a couple of minutes.

### Automatic start after a reboot

All services use `restart: unless-stopped`. When Docker Desktop starts, they
start automatically — **unless** they were stopped manually with
`docker compose ... stop` or `down`. The same applies to the application stack.

## Stopping and removing

There are three levels, from least to most destructive:

| Command                                                  | Containers     | Shared network `hizmet_default` | Volumes (metric history, Grafana DB) |
| -------------------------------------------------------- | -------------- | ------------------------------- | ------------------------------------ |
| `docker compose -f compose.monitoring.yaml stop`         | Kept (stopped) | Untouched                       | Kept                                 |
| `docker compose -f compose.monitoring.yaml down`         | Removed        | Untouched (owned by the application) | **Kept**                        |
| `docker compose -f compose.monitoring.yaml down -v`      | Removed        | Untouched                       | **Deleted**                          |

### Stop temporarily

```bash
docker compose -f compose.monitoring.yaml stop
```

Containers stay on disk and `start` brings them back in a second. Use this
when you want to free CPU and RAM for a while.

### Stop and remove containers (normal shutdown)

```bash
docker compose -f compose.monitoring.yaml down
```

Metric history survives, because it lives in the named volumes
`hizmet-monitoring_prometheus_data` and `hizmet-monitoring_grafana_data`. The
next `up -d` continues with the existing data.

Expected output:

```text
 ✔ Container hizmet-monitoring-grafana-1           Removed
 ✔ Container hizmet-monitoring-prometheus-1        Removed
 ✔ Container hizmet-monitoring-telegraf-1          Removed
 ✔ Container hizmet-monitoring-postgres-exporter-1 Removed
```

The shared network `hizmet_default` is **not** removed, because it is declared
`external` and owned by the application project. The application keeps running.

### Remove everything including data

```bash
docker compose -f compose.monitoring.yaml down -v
```

> [!CAUTION]
> This deletes the Prometheus time-series database and the Grafana database
> (including any dashboards created manually in the UI and any changed
> passwords). Provisioned dashboards and the data source come back from Git on
> the next start; the 15-day metric history does not.

### Stopping the application stack

```bash
docker compose down            # application only; monitoring keeps running
```

While the application is stopped, Prometheus reports the `keycloak` target as
`DOWN` and Telegraf no longer sees the application containers. This is
expected. Stopping the application with `docker compose down` removes the
`hizmet_default` network only when no other container uses it; with monitoring
running, Docker prints that the network is "in use" and leaves it in place. That
message is harmless.

## Restarting and applying configuration changes

What needs which action:

| Change                                              | Action                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `prometheus.yml` (jobs, intervals)                  | `up -d --force-recreate prometheus`                                     |
| `telegraf.conf`                                     | `up -d --force-recreate telegraf`                                       |
| Dashboard JSON in `grafana/dashboards/`             | Nothing — Grafana reloads the folder about every 10 seconds             |
| Grafana provisioning (`datasources/`, `dashboards/*.yml`) | `restart grafana`                                                 |
| `compose.monitoring.yaml` (ports, volumes, env, entrypoint) | `up -d` (Compose recreates only the changed services)           |
| `.env` values used by a service                     | `up -d --force-recreate <service>`                                      |
| New image version                                   | See [Updating images](#updating-images)                                 |

Example — change the scrape interval and apply it:

```bash
# 1. edit infra/monitoring/prometheus/prometheus.yml
# 2. validate the syntax
docker run --rm --entrypoint promtool \
  -v "$PWD/infra/monitoring/prometheus/prometheus.yml:/prometheus.yml:ro" \
  prom/prometheus:v3.5.0 check config /prometheus.yml
# 3. apply
docker compose -f compose.monitoring.yaml up -d --force-recreate prometheus
```

Expected output of step 2:

```text
Checking /prometheus.yml
 SUCCESS: /prometheus.yml is valid prometheus config file syntax
```

> [!NOTE]
> `restart` keeps the container and re-reads files that are mounted from the
> host, but does **not** re-read environment variables or `compose.monitoring.yaml`.
> Use `up -d --force-recreate` whenever the Compose file or `.env` changed.

## Inspecting

### Status and resource use

```bash
docker compose -f compose.monitoring.yaml ps
docker stats --no-stream $(docker compose -f compose.monitoring.yaml ps -q)
```

### Logs

```bash
docker compose -f compose.monitoring.yaml logs --tail 50 telegraf
docker compose -f compose.monitoring.yaml logs -f prometheus      # follow; Ctrl+C to leave
docker compose -f compose.monitoring.yaml logs --since 10m
```

Healthy log lines to expect:

| Service     | Healthy sign                                                                 |
| ----------- | ---------------------------------------------------------------------------- |
| `telegraf`  | `Listening on http://[::]:9273/metrics`, no `E!` lines                       |
| `prometheus`| `Server is ready to receive web requests.`                                   |
| `grafana`   | `HTTP Server Listen`, and provisioning lines for the data source and dashboards |

### Shell inside a container

```bash
docker compose -f compose.monitoring.yaml exec prometheus sh
docker compose -f compose.monitoring.yaml exec grafana sh
```

(The Telegraf and postgres-exporter images are minimal; use `logs` there.)

## Updating images

Images are pinned to explicit versions (`prom/prometheus:v3.5.0`,
`grafana/grafana:12.2.0`, `telegraf:1.35`, `postgres-exporter:v0.17.1`). Pinning
makes the stack reproducible; no update happens unexpectedly.

To upgrade one component:

1. Read its release notes for breaking changes.
2. Change the version tag in `compose.monitoring.yaml`.
3. Pull and recreate:

```bash
docker compose -f compose.monitoring.yaml pull grafana
docker compose -f compose.monitoring.yaml up -d grafana
```

4. Verify with `ps`, `logs`, and the dashboard.
5. Commit the change.

Volumes are reused, so data survives upgrades. Back up the volumes before
**major** Grafana or Prometheus upgrades.

## Backing up and restoring

Dashboards, the data source, and all configuration are in Git and need no
backup. Only the metric history (`prometheus_data`) and the Grafana database
(`grafana_data`) live outside Git.

### Backup a volume

```bash
mkdir -p .backups
docker run --rm \
  -v hizmet-monitoring_prometheus_data:/data:ro \
  -v "$PWD/.backups":/backup \
  alpine tar czf /backup/prometheus_data-$(date +%Y%m%d).tar.gz -C /data .
```

Use `hizmet-monitoring_grafana_data` for the Grafana database. `.backups/` is
git-ignored.

For a fully consistent Prometheus backup, stop it first
(`docker compose -f compose.monitoring.yaml stop prometheus`), run the command,
then `start` it again.

### Restore a volume

```bash
docker compose -f compose.monitoring.yaml stop prometheus
docker run --rm \
  -v hizmet-monitoring_prometheus_data:/data \
  -v "$PWD/.backups":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/prometheus_data-YYYYMMDD.tar.gz -C /data"
docker compose -f compose.monitoring.yaml start prometheus
```

Replace `YYYYMMDD` with the date of the backup. The `rm -rf /data/*` removes the
current data of that volume only.

## Resetting

### Reset only Grafana (keep metric history)

```bash
docker compose -f compose.monitoring.yaml stop grafana
docker compose -f compose.monitoring.yaml rm -f grafana
docker volume rm hizmet-monitoring_grafana_data
docker compose -f compose.monitoring.yaml up -d grafana
```

Grafana starts with a fresh database, the password from `.env`, and the
provisioned data source and dashboard.

### Reset only the metric history

```bash
docker compose -f compose.monitoring.yaml stop prometheus
docker compose -f compose.monitoring.yaml rm -f prometheus
docker volume rm hizmet-monitoring_prometheus_data
docker compose -f compose.monitoring.yaml up -d prometheus
```

### Check disk usage

```bash
docker system df -v | grep -E 'hizmet-monitoring|VOLUME NAME'
```

Prometheus disk usage is bounded by the 15-day retention. To shorten or extend
it, change `--storage.tsdb.retention.time` in `compose.monitoring.yaml` and
recreate Prometheus. A size limit can be added with
`--storage.tsdb.retention.size=2GB`.

## Operational checklist

Before a demo, exam, or deployment:

- [ ] `docker compose ps` — application containers are `healthy`
- [ ] `docker compose -f compose.monitoring.yaml ps` — four services are `Up`
- [ ] `http://localhost:9090/targets` — all targets are `UP`
- [ ] Grafana dashboard shows current values (not a flat line or "No data")

Before shutting down the machine for a long time (optional):

- [ ] `docker compose -f compose.monitoring.yaml down` — stops the monitoring stack, keeps data
- [ ] `docker compose down` — stops the application, keeps the database volume

Never run `down -v` on either stack unless the data is intentionally discarded
and a verified backup exists.

## Next phase: microservice metrics

The stack is prepared for application-level monitoring. The planned next step is
to expose a `/metrics` endpoint in `apps/api` (request count, latency
histograms, error rate) and enable the commented-out `hizmet-api` job in
[`prometheus.yml`](../../infra/monitoring/prometheus/prometheus.yml). Prometheus and
Grafana need no structural change for this; only a new scrape target and
dashboard panels are added.
