# Troubleshooting and Lessons Learned

This chapter documents every problem encountered while building the monitoring
stack, in the order in which it occurred. For each problem it records the
**symptom**, the **diagnosis**, the **root cause**, and the **resolution**. The
most important one is the cAdvisor failure on Docker Desktop (Problems 2 and 3),
because it explains why the stack uses Telegraf.

| #   | Problem                                                  | Root cause (short)                                             |
| --- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Dashboard panels show "No data" for CPU/RAM/network      | cAdvisor exported no per-container series                      |
| 2   | cAdvisor registers no containers                         | Docker Desktop's containerd image store is unsupported by cAdvisor |
| 3   | cAdvisor cannot reach `docker.sock`                      | Socket was not available through the `/var/run` directory mount |
| 4   | Telegraf: `permission denied` on `docker.sock`           | The image entrypoint drops root privileges                     |
| 5   | Keycloak target is `DOWN` with HTTP 404                  | Metrics were not enabled in the running container              |
| 6   | `telegraf.conf` existed as a directory                   | Docker creates a directory for a missing bind-mount source     |
| 7   | Other errors to expect                                   | Missing network, missing password, busy ports                  |

---

## Problem 1: Dashboard panels show "No data"

### Symptom

After the first startup Grafana worked, the Postgres panel showed lines, and the
"scrape targets" panel showed `cadvisor UP`, `postgres UP`, `prometheus UP`,
`keycloak DOWN`. But all CPU, RAM, and network panels said **No data**.

### Diagnosis

The target being `UP` only proves that Prometheus could download the metrics
page; it says nothing about the _content_. The dashboard queried
`container_memory_working_set_bytes{name=~"hizmet-.+"}`, so the next step was to
look at what cAdvisor actually exported:

```bash
curl -s localhost:8081/metrics | grep -E '^container_memory_working_set_bytes'
```

Actual output:

```text
container_memory_working_set_bytes{id="/"} 1.804341248e+09 1792765623482
```

Only **one** series existed: the root cgroup `id="/"` (the whole Docker Desktop
VM). There was no per-container series and therefore no `name` label to match.

### Root cause

cAdvisor was running but did not register any container. See Problem 2.

> [!TIP]
> A green `UP` is not proof that the data you need is present. Always check the
> raw metrics endpoint (or run the PromQL query in the Prometheus UI under
> **Graph**) before debugging a dashboard.

---

## Problem 2: cAdvisor registers no containers

This is the central problem of the setup. It is documented as the investigation
that was actually carried out.

### Step 1 — Hypothesis: cgroup namespace

On cgroup v2 (`docker info` reports `Cgroup Version: 2`), a container gets a
private cgroup namespace by default and only sees its own cgroup subtree. That
would explain a single `id="/"` series, so `cgroup: host` was added to the
cAdvisor service:

```yaml
cadvisor:
  privileged: true
  cgroup: host
```

**Result:** no change; still only `id="/"`.

### Step 2 — Read the logs

The decisive information was in the container logs:

```bash
docker logs hizmet-monitoring-cadvisor-1 --tail 40
```

```text
factory.go:221] Registration of the docker container factory failed:
  failed to validate Docker info: failed to detect Docker info:
  Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
  Is the docker daemon running?
factory.go:221] Registration of the containerd container factory failed:
  unable to create containerd client: ... /run/containerd/containerd.sock: no such file or directory
factory.go:103] Registering Raw factory
```

cAdvisor has several "factories", one per container runtime. Without a working
**docker factory** it only sees the raw cgroup tree, which explains the single
root series. This led to Problem 3 (the socket) — which was fixed — and exposed
the real error:

### Step 3 — The real error

After mounting the Docker socket correctly (Problem 3), the docker factory
registered, and the log changed:

```text
manager.go:1116] Failed to create existing container:
  /docker/bd5bcf6c4b4c...: failed to identify the read-write layer ID for
  container "bd5bcf6c4b4c...". -
  open /rootfs/var/lib/docker/image/overlayfs/layerdb/mounts/bd5bcf6c4b4c.../mount-id:
  no such file or directory
```

cAdvisor now found every container (`/docker/<id>` for all eight of them), but
failed to create each one, so the metrics output was still only `id="/"`.

### Root cause

For every container cAdvisor wants to attach filesystem statistics, so it
resolves the container's **writable layer ID**. It does this by reading a file
in Docker's _classic_ image store:

```text
/var/lib/docker/image/overlayfs/layerdb/mounts/<container-id>/mount-id
```

Docker Desktop (recent versions) uses the **containerd image store** instead of
the classic one. You can see this in:

```bash
docker info --format '{{.DriverStatus}}'
```

```text
[[driver-type io.containerd.snapshotter.v1]]
```

With the containerd snapshotter, the classic `layerdb/mounts/...` files are not
written, so cAdvisor's lookup fails with `no such file or directory` for every
container — and a container that fails to be created is not exported at all.
Version `v0.52.1` of cAdvisor was used; this is an incompatibility between
cAdvisor's Docker integration and the containerd image store, not a
misconfiguration of the stack.

### Options that were considered

| Option                                                                 | Decision                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Disable "Use containerd for pulling and storing images" in Docker Desktop | **Rejected.** Switching image stores changes which images are visible; locally built images (`hizmet-web`, `hizmet-api`) could disappear and need rebuilding. Too risky for a monitoring tool. |
| Try other cAdvisor versions or flags (`--docker_only=false`, etc.)     | **Rejected.** Not a reliable fix; it would rely on behaviour that may change with each Docker Desktop release. |
| Read statistics from the **Docker Engine API** instead                 | **Chosen.** The API is the supported public interface and is independent of the storage driver. |

### Resolution

cAdvisor was removed and replaced with **Telegraf**, whose `docker` input plugin
uses the Docker Engine API (`/containers/json`, `/containers/<id>/stats`) — the
same source as `docker stats`:

- [`compose.monitoring.yaml`](../../compose.monitoring.yaml): `cadvisor` service replaced by `telegraf`
- [`telegraf.conf`](../../infra/monitoring/telegraf/telegraf.conf): `docker` input and `prometheus_client` output
- [`prometheus.yml`](../../infra/monitoring/prometheus/prometheus.yml): job `cadvisor` replaced by job `telegraf`
- Dashboard queries: `container_*{name=...}` replaced by `docker_container_*{container_name=...}`

Cleanup of the old container (also done by the `--remove-orphans` flag):

```bash
docker compose -f compose.monitoring.yaml up -d --remove-orphans
```

Verification:

```bash
curl -s localhost:9273/metrics | grep -E '^docker_container_mem_usage\{' | cut -c1-120
```

One line per container, for example
`docker_container_mem_usage{com_docker_compose_service="api",...container_name="hizmet-api-1"...}`.

> [!NOTE]
> On a Linux host with the classic Docker storage driver, cAdvisor works fine and
> is a valid choice. The Telegraf-based setup is used here because it works on
> Docker Desktop **and** on Linux without special mounts.

---

## Problem 3: cAdvisor cannot reach `docker.sock`

This problem is a part of the cAdvisor investigation and is described
separately because it is a common stumbling block.

### Symptom

In the cAdvisor log:

```text
Registration of the docker container factory failed: failed to validate Docker info:
failed to detect Docker info: Cannot connect to the Docker daemon at
unix:///var/run/docker.sock. Is the docker daemon running?
```

The Docker daemon _was_ running — the error comes from **inside the cAdvisor
container**, which could not find a usable socket at that path.

### Cause

The Compose file shared the whole directory:

```yaml
volumes:
  - /var/run:/var/run:ro
```

On Docker Desktop, the Docker Engine runs inside a Linux VM, and the path
`/var/run` that Compose resolves for a bind mount refers to the VM's file
system. The directory mount did not result in a working
`/var/run/docker.sock` inside the cAdvisor container. (The exact internal reason
was not investigated, because mounting the socket file explicitly solved the
problem.)

### Resolution

Mount the **socket file** itself, not its parent directory:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

After recreating the container the log line about the docker factory
disappeared and the real error of Problem 2 became visible.

### Rules of thumb for the Docker socket

- Mount the socket **file** directly (`/var/run/docker.sock`), never `/var/run`.
- `:ro` protects the socket file from being replaced, but **does not restrict the
  API calls** that can be made through it. Treat the socket as root access.
- Test socket access from inside a container before blaming the application:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock:ro \
  curlimages/curl --unix-socket /var/run/docker.sock http://localhost/version
```

A JSON document with the Docker version means the socket works.

---

## Problem 4: Telegraf `permission denied` on `docker.sock`

### Symptom

Telegraf started, but `localhost:9273/metrics` was empty, and the log said:

```text
E! [inputs.docker] Error in plugin: permission denied while trying to connect to
the Docker daemon socket at unix:///var/run/docker.sock: Get
"http://%2Fvar%2Frun%2Fdocker.sock/v1.51/info": dial unix /var/run/docker.sock:
connect: permission denied
```

### Cause

Inside Docker Desktop the socket is only accessible to `root`. The service
already had `user: root`, yet the error persisted. The reason is the official
image's **entrypoint**: when the container starts as `root`, the entrypoint
script drops privileges and runs Telegraf as the unprivileged `telegraf` user,
which cannot open the socket. Observed behaviour: `user: root` alone did not
help; bypassing the entrypoint did.

### Resolution

Skip the entrypoint script and start the binary directly, so the process keeps
running as `root`:

```yaml
telegraf:
  user: root
  entrypoint: ['telegraf']
```

The default configuration path `/etc/telegraf/telegraf.conf` is used
automatically, which is where the configuration file is mounted. Recreate the
container, because `entrypoint` is a creation-time setting:

```bash
docker compose -f compose.monitoring.yaml up -d --force-recreate telegraf
docker logs hizmet-monitoring-telegraf-1 --tail 5
```

Expected: no `permission denied` lines and a line like
`Listening on http://[::]:9273/metrics`.

> [!NOTE]
> A less privileged alternative on Linux hosts is `user: telegraf` plus
> `group_add: ["<docker-gid>"]`. On Docker Desktop the group of the socket inside
> the VM is not stable, so `root` was chosen here. See the
> [security notes](01-architecture.md#security-notes).

---

## Problem 5: Keycloak target `DOWN` with HTTP 404

### Symptom

In the Prometheus UI (`/targets`):

```text
keycloak   http://keycloak:9000/metrics   DOWN
Error scraping target: server returned HTTP status 404 Not Found
```

### Diagnosis

A **404** (not "connection refused") is informative: something _was_ listening
on port `9000` and answered, but it had no `/metrics` page. Keycloak 26 serves
`/health` and `/metrics` on a separate **management port** (`9000`). The port
was already open because `KC_HEALTH_ENABLED=true`, but metrics were not enabled.

### Cause

`KC_METRICS_ENABLED: 'true'` had been added to [`compose.yaml`](../../compose.yaml),
but the running container had not been **recreated**. Environment variables are
read only when a container is created; editing the file does not change a
running container.

### Resolution

```bash
docker compose up -d keycloak
```

Compose detects the changed configuration and recreates only that service.
After Keycloak became ready (≈ 30–60 s) the target turned `UP`.

---

## Problem 6: `telegraf.conf` existed as a directory

### Symptom

`infra/monitoring/telegraf/telegraf.conf` showed up as an **empty directory**
(`ls -la` printed `drwxr-xr-x`), which breaks a bind mount of the form
`./telegraf.conf:/etc/telegraf/telegraf.conf` (a directory cannot be mounted
over a file path, and Telegraf would find no configuration).

### Cause

When the source path of a bind mount does not exist, Docker **creates it as a
directory**. The most likely explanation is that a container referencing the
file was started before the file existed (the exact earlier command was not
recorded), so Docker created a directory with that name.

### Resolution

Remove the empty directory and create the real file:

```bash
rmdir infra/monitoring/telegraf/telegraf.conf   # only works on an EMPTY directory
```

then create the file (the current
[`telegraf.conf`](../../infra/monitoring/telegraf/telegraf.conf) is in Git).

### Prevention

Create every file that is bind-mounted **before** running `docker compose up`.
`rmdir` is the safe tool here: unlike `rm -rf`, it refuses to delete a directory
that has content.

---

## Problem 7: Other errors to expect

These were not hit during the original setup but are the most likely failures
when the stack is set up on another machine.

### `network hizmet_default declared as external, but could not be found`

The application stack has never been started on this machine, so the shared
network does not exist.

```bash
docker compose up -d                                        # creates hizmet_default
docker compose -f compose.monitoring.yaml up -d
```

### `required variable GRAFANA_ADMIN_PASSWORD is missing a value`

`.env` does not define the password. Add it as described in
[02 — Setup, Step 3](02-setup.md#step-3--configure-grafana-credentials).

### `Bind for 127.0.0.1:3002 failed: port is already allocated`

Another process uses the port. Find it and stop it, or change the left side of
the port mapping in `compose.monitoring.yaml`:

```bash
lsof -i :3002
```

### Grafana login fails after changing the password in `.env`

`GF_SECURITY_ADMIN_PASSWORD` is only applied when the Grafana database is first
created. Reset it explicitly:

```bash
docker compose -f compose.monitoring.yaml exec grafana \
  grafana cli admin reset-admin-password 'new-password'
```

### Container names are missing or graphs are empty after a rebuild

The dashboard filters on `container_name=~"hizmet-.+"`. If the Compose project
name changes (`name:` in `compose.yaml`), container names change as well. Adjust
the regular expression in the dashboard queries.

---

## Diagnostic cheat sheet

| Question                                              | Command                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Are the monitoring containers running?                | `docker compose -f compose.monitoring.yaml ps`                                          |
| Why did a container fail or restart?                  | `docker compose -f compose.monitoring.yaml logs --tail 50 <service>`                    |
| Does the source produce data?                         | `curl -s localhost:9273/metrics \| head`                                                |
| Which targets does Prometheus consider healthy?       | `curl -s localhost:9090/api/v1/targets`, or `http://localhost:9090/targets`             |
| Does a dashboard query return data?                   | Paste the PromQL into `http://localhost:9090/graph`                                     |
| Which Docker storage driver is used?                  | `docker info --format '{{.DriverStatus}}'`                                              |
| Can a container reach another one by name?            | `docker compose -f compose.monitoring.yaml exec prometheus wget -qO- http://telegraf:9273/metrics \| head -3` |

### Debugging order that worked

1. **Source:** is the raw `/metrics` page correct? (`curl`)
2. **Collector:** does Prometheus list the target as `UP`, and is the label
   correct? (`/targets`, then a query in `/graph`)
3. **Visualization:** only if both are correct, debug the dashboard query.

Following this order from the left (data source) to the right (dashboard)
avoids the most common mistake: editing dashboards when the data does not exist.
