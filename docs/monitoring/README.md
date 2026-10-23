# Container Monitoring Guide

This directory documents the container monitoring stack of the Dormitory
Services Portal: what it contains, why it was built this way, how it was set up
step by step, which problems were hit along the way (and how they were solved),
and how to operate it day to day.

The monitoring stack answers one question first: **how much CPU and RAM does
each container consume?** It is also the foundation for monitoring the
microservices themselves (request rate, latency, error rate) in a later phase.

The canonical configuration files are:

- [`compose.monitoring.yaml`](../../compose.monitoring.yaml)
- [`infra/monitoring/prometheus/prometheus.yml`](../../infra/monitoring/prometheus/prometheus.yml)
- [`infra/monitoring/telegraf/telegraf.conf`](../../infra/monitoring/telegraf/telegraf.conf)
- [`infra/monitoring/grafana/`](../../infra/monitoring/grafana) (provisioning and dashboards)
- [`compose.yaml`](../../compose.yaml) (only one line changed: `KC_METRICS_ENABLED`)

All commands in this guide are executed from the **repository root**.

## What the stack contains

| Compose service     | Image                                           | Responsibility                                                         |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `telegraf`          | `telegraf:1.35`                                 | Reads per-container CPU, RAM, network and disk I/O from the Docker API |
| `postgres-exporter` | `quay.io/prometheuscommunity/postgres-exporter` | Exposes PostgreSQL internals (connections, transactions, sizes)        |
| `prometheus`        | `prom/prometheus:v3.5.0`                        | Scrapes all metric sources every 15 s and stores them for 15 days      |
| `grafana`           | `grafana/grafana:12.2.0`                        | Visualizes the metrics; the dashboard is provisioned automatically     |

Keycloak is also scraped. It exposes its own Prometheus endpoint once
`KC_METRICS_ENABLED=true` is set.

## Endpoints

| URL                             | Purpose                          | Reachable from    |
| ------------------------------- | -------------------------------- | ----------------- |
| `http://localhost:3002`         | Grafana UI (dashboards)          | This machine only |
| `http://localhost:9090`         | Prometheus UI (queries, targets) | This machine only |
| `http://localhost:9273/metrics` | Raw Telegraf metrics (debugging) | This machine only |

Every published port is bound to `127.0.0.1`. Nothing from the monitoring stack
is exposed to the local network.

## Suggested reading order

1. [01 — Architecture](01-architecture.md) explains how the pieces fit together
   and why Telegraf is used instead of cAdvisor.
2. [02 — Setup](02-setup.md) walks through the installation step by step, with
   every command and its expected output.
3. [03 — Configuration reference](03-configuration-reference.md) explains each
   configuration file line by line, including the dashboard queries.
4. [04 — Troubleshooting](04-troubleshooting.md) records every problem
   encountered during the initial setup — including the cAdvisor and
   `docker.sock` failures — with root cause and resolution.
5. [05 — Operations](05-operations.md) covers starting, stopping, updating,
   backing up, and resetting the monitoring containers.

## Fast path

```bash
# 1. The application stack must already be running (it creates the network)
docker compose up -d

# 2. Add Grafana credentials to .env (see 02-setup.md)
echo 'GRAFANA_ADMIN_USER=admin' >> .env
echo 'GRAFANA_ADMIN_PASSWORD=choose-a-strong-password' >> .env

# 3. Start monitoring
docker compose -f compose.monitoring.yaml up -d
```

Then open `http://localhost:3002` and navigate to
**Dashboards → Hizmet → Hizmet - Container Kaynak Kullanımı**.

## Safety rules

- The monitoring stack is a **separate Compose project** (`hizmet-monitoring`).
  `docker compose down` in the repository root does **not** stop it, and
  `docker compose -f compose.monitoring.yaml down` does **not** stop the
  application.
- `docker compose -f compose.monitoring.yaml down -v` deletes the Prometheus and
  Grafana volumes, i.e. all stored metric history. See
  [05 — Operations](05-operations.md#stopping-and-removing).
- Telegraf mounts `/var/run/docker.sock`. Anything with access to this socket
  can control Docker. See
  [Security notes](01-architecture.md#security-notes) before changing this setup.
