# OmniRoute Coolify Deployment & Production Runbook

> **Authoritative Technical Runbook and Deployment Reference**  
> **Target**: Coolify PaaS Application 21 (`qmusbfbjcz0ohip348rv8fgc`) on VPS `62.164.214.145`  
> **Service**: Sovereign OmniRoute Free Intelligence Gateway & Reverse Proxy  
> **Public Domain**: `https://omniroute.workspacegroupefloteuil.eu`  
> **Internal Port**: `20128` | **Docker Network**: `coolify` | **Volume**: `qmusbfbjcz0ohip348rv8fgc_data:/app/data`  

---

## 1. Overview & Architecture

OmniRoute is deployed as an isolated, containerized sovereign AI proxy on Coolify PaaS (Ubuntu 22.04 LTS VPS `62.164.214.145`, Traefik v3.6 reverse proxy with automated Let's Encrypt TLS).

### Key Architectural Characteristics
- **Multi-Stage Container Build**: Dockerfile target `runner-base` from `floteuil/OmniRoute` pinned to commit `38e2616464fac4681c1f7a4e05dc9974e99e1dde` (`release/v3.8.51`).
- **Unprivileged Runtime**: Runs as non-root user `node` (UID `1000`, GID `1000`).
- **Internal Service Port**: Port `20128` (serves both management Web UI and `/v1/*` proxy routes via internal Next.js rewrites).
- **Public Domain**: `https://omniroute.workspacegroupefloteuil.eu` routed via Traefik v3 with Let's Encrypt HTTP-01 automated certificates.
- **Persistent Volume**: Named Docker volume `qmusbfbjcz0ohip348rv8fgc_data` mounted to `/app/data` (persists `storage.sqlite` and `server.env`).
- **3-Tier Decoupling & Dynamic Routing**: Receives capability contract routes (`combo/rakazo-coding`, `combo/rakazo-reasoning`, `combo/rakazo-fast`, `combo/rakazo-writing`, `combo/rakazo-analysis`) and resolves them dynamically per turn to live healthy upstream models (Mistral, DeepSeek, Groq, Qwen).
- **Header Propagation Contract**: Returns real execution headers (`x-omniroute-provider`, `x-omniroute-model`, `x-omniroute-latency-ms`, `x-omniroute-session-id`, `x-omniroute-version`, and canonical `x-omniroute-response-cost: 0.000000`).
- **Zero-Provider Invariant**: OmniRoute is deployed in initial unconfigured state (`PENDING PROVIDER CREDENTIALS`). Free requests trigger a clean fail-closed error (*« Capacité gratuite temporairement indisponible »*) with strictly $0.0000 cost.
- **Strict Non-Interference**: OmniRoute runs on the isolated `coolify` Docker network and dedicated storage volumes without impacting any of the 15 co-located VPS workloads.

---

## 2. Infrastructure & Application Specification

| Parameter | Specification | Purpose |
|---|---|---|
| **Coolify Host** | VPS `62.164.214.145` | Contabo VPS running Coolify v4.1+ |
| **Coolify Project / Environment** | `rakazo` (ID: 54) / `production` | Production environment namespace |
| **Coolify App ID / UUID** | App ID `21` / `qmusbfbjcz0ohip348rv8fgc` | Dedicated Coolify resource |
| **Git Repository** | `https://github.com/floteuil/OmniRoute` | Fork tracking stable release |
| **Git Branch / Commit** | `release/v3.8.51` / `38e2616464fac4681c1f7a4e05dc9974e99e1dde` | Pinned commit for byte-level stability |
| **Build Pack** | `dockerfile` | Multi-stage Dockerfile build |
| **Build Target** | `runner-base` | Minimal production image (~500MB, no heavy browser sidecars) |
| **Internal Port** | `20128` | Standard OmniRoute listening port |
| **Docker Network** | `coolify` | Internal Coolify Docker bridge network |
| **Public FQDN** | `https://omniroute.workspacegroupefloteuil.eu` | Public HTTPS domain routed via Traefik |
| **Persistent Volume** | `/app/data` (`qmusbfbjcz0ohip348rv8fgc_data:/app/data`) | SQLite database (`storage.sqlite`) and encryption keys |

---

## 3. Environment Variables & Secret Configuration

The following environment variables are configured on Coolify Application 21:

| Variable Name | Example / Format | Required | Purpose |
|---|---|---|---|
| `NODE_ENV` | `production` | Yes | Production runtime mode |
| `PORT` | `20128` | Yes | Internal listening port |
| `HOSTNAME` | `0.0.0.0` | Yes | Network bind interface |
| `DATA_DIR` | `/app/data` | Yes | Storage directory for SQLite and secrets |
| `STORAGE_ENCRYPTION_KEY` | `<32-byte-hex-string>` | Yes | AES-256-GCM local storage encryption |
| `JWT_SECRET` | `<64-byte-hex-string>` | Yes | Admin JWT session token signing |
| `INITIAL_PASSWORD` | `<high-entropy-password>` | Yes | Headless admin dashboard protection (bcrypt hashed on boot) |
| `OMNIROUTE_BUILD_WORKERS` | `1` | Optional | Limits memory usage during container build on VPS |
| `NEXT_TELEMETRY_DISABLED` | `1` | Optional | Disables Next.js telemetry reporting |

> **Security Note**: Never commit plaintext production secrets to version control. Passwords and encryption keys must be generated with high entropy (`openssl rand -hex 32` / `openssl rand -hex 64`) and injected securely via Coolify environment settings.

---

## 4. Deployment Procedure on Coolify

### Step 1: Resource Inspection
Verify the Application 21 record in Coolify:
```bash
# Query Coolify database
docker exec coolify-db psql -U coolify -d coolify -c "SELECT id, uuid, name, git_repository, git_branch, status FROM applications WHERE id = 21;"
```

### Step 2: Configure Application Settings
Ensure Application 21 settings are applied in Coolify:
- `build_pack = 'dockerfile'`
- `dockerfile_target = 'runner-base'`
- `git_commit_sha = '38e2616464fac4681c1f7a4e05dc9974e99e1dde'`
- `ports_exposes = '20128'`
- `fqdn = 'https://omniroute.workspacegroupefloteuil.eu'`
- Persistent volume mount: `/app/data` (`qmusbfbjcz0ohip348rv8fgc_data`)

### Step 3: Trigger Deployment
Trigger deployment via Coolify API or UI dashboard:
```bash
# Coolify API deployment trigger
curl -s -X POST "http://localhost:8000/api/v1/deploy?uuid=qmusbfbjcz0ohip348rv8fgc&force=false" \
  -H "Authorization: Bearer <COOLIFY_API_TOKEN>"
```

### Step 4: Monitor Build & Startup
Monitor build logs and container state:
```bash
# Inspect container health
docker inspect --format '{{.State.Status}} (healthy: {{.State.Health.Status}})' qmusbfbjcz0ohip348rv8fgc-0
```

---

## 5. Verification & Health Probes

### 1. HTTP Liveness & Health Check
```bash
# Local container check
curl -f http://localhost:20128/health

# Public HTTPS domain check
curl -f https://omniroute.workspacegroupefloteuil.eu/health
```
Expected response:
```json
{
  "status": "healthy",
  "service": "omniroute",
  "version": "3.8.51",
  "uptimeSeconds": 120
}
```

### 2. TLS Certificate Status
```bash
curl -Iv https://omniroute.workspacegroupefloteuil.eu 2>&1 | grep -E "SSL certificate|HTTP/"
```
Expected: `SSL certificate verify ok`, HTTP `200 OK` or `307 Temporary Redirect` to `/login`.

### 3. Models Catalog Endpoint (`GET /v1/models`)
```bash
curl -s -H "Authorization: Bearer <OMNIROUTE_API_KEY>" \
  https://omniroute.workspacegroupefloteuil.eu/v1/models
```

### 4. Zero-Provider Fail-Closed Invariant
```bash
curl -s -X POST https://omniroute.workspacegroupefloteuil.eu/v1/chat/completions \
  -H "Authorization: Bearer <OMNIROUTE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"combo/rakazo-coding","messages":[{"role":"user","content":"Ping"}]}'
```
Expected: HTTP 401 / Error response (*« Capacité gratuite temporairement indisponible »*) indicating zero active provider credentials with $0.00 cost.

### 5. Volume Persistence & Permissions Check
```bash
# Inspect volume ownership and SQLite file
docker exec qmusbfbjcz0ohip348rv8fgc-0 ls -la /app/data
```
Expected: `storage.sqlite` and `server.env` owned by `node:node` (`UID 1000`).

---

## 6. Zero-Interference & Tenant Isolation

OmniRoute adheres strictly to the **Zero-Interference VPS Invariant**:
1. **Network Isolation**: Attached exclusively to the `coolify` Docker network and internal bridge; no host port conflicts.
2. **Volume Isolation**: Uses dedicated named volume `qmusbfbjcz0ohip348rv8fgc_data`; no host mount collisions.
3. **Process Isolation**: Unprivileged non-root execution (`node`, UID 1000); no Docker socket access.
4. **Co-Located Workloads**: Zero modification, restart, or resource contention with other services on the VPS (HubtoWrite, Veinart, Open-Design, Postiz, DocuSeal, n8n, Flowise, Odoo, SearXNG, Minio, Beszel, Scraperr, Rakazo Stack).

---

## 7. Secret Management & Rotation Procedures

### 1. Generating High-Entropy Keys
Always generate cryptographic keys on secure endpoints without writing them to git:
```bash
# Generate 32-byte hex key for STORAGE_ENCRYPTION_KEY or OMNIROUTE_API_KEY
openssl rand -hex 32

# Generate 64-byte hex key for JWT_SECRET
openssl rand -hex 64
```

### 2. Rotating OMNIROUTE_API_KEY (Bearer Token)
To rotate the endpoint Bearer token between Rakazo and OmniRoute:
1. Generate a new key: `NEW_KEY=$(openssl rand -hex 32)`
2. Update the environment variables in Coolify for Application 21 (OmniRoute) and Application 20 (Rakazo).
3. Redeploy or restart both applications sequentially to maintain synchronized authentication.

---

## 8. Backup, Restore & Disaster Recovery

### 1. SQLite Database Backup (`/app/data/storage.sqlite`)
The persistent SQLite database contains configuration settings and hashed credentials:
```bash
# Create timestamped backup from running container
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
docker exec qmusbfbjcz0ohip348rv8fgc-0 sqlite3 /app/data/storage.sqlite ".backup '/app/data/backup_${BACKUP_DATE}.sqlite'"

# Copy backup to secure host backup directory
docker cp qmusbfbjcz0ohip348rv8fgc-0:/app/data/backup_${BACKUP_DATE}.sqlite /var/backups/omniroute/
```

### 2. Restore Procedure
```bash
# 1. Stop the application container
docker stop qmusbfbjcz0ohip348rv8fgc-0

# 2. Restore SQLite file to the named volume
docker cp /var/backups/omniroute/backup_${BACKUP_DATE}.sqlite qmusbfbjcz0ohip348rv8fgc-0:/app/data/storage.sqlite

# 3. Ensure proper ownership
docker run --rm -v qmusbfbjcz0ohip348rv8fgc_data:/app/data alpine chown -R 1000:1000 /app/data

# 4. Start the application container
docker start qmusbfbjcz0ohip348rv8fgc-0
```

---

## 9. Container Restart & Resilience Verification

To verify that persistent volumes retain state across container restarts and updates:
```bash
# 1. Inspect container uptime before restart
docker inspect --format '{{.State.StartedAt}}' qmusbfbjcz0ohip348rv8fgc-0

# 2. Restart container gracefully
docker restart qmusbfbjcz0ohip348rv8fgc-0

# 3. Verify SQLite database integrity
docker exec qmusbfbjcz0ohip348rv8fgc-0 sqlite3 /app/data/storage.sqlite "PRAGMA integrity_check;"
# Expected output: ok

# 4. Verify API key authentication remains active
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <OMNIROUTE_API_KEY>" https://omniroute.workspacegroupefloteuil.eu/v1/models
# Expected output: 200
```

---

## 10. Troubleshooting & Operational Failure Modes

| Symptom | Root Cause | Remediation |
|---|---|---|
| **HTTP 502 / Bad Gateway on domain** | Traefik cannot reach port 20128 | Check container status (`docker ps`), verify `PORT=20128` and `HOSTNAME=0.0.0.0` in environment. |
| **HTTP 401 on `/v1/chat/completions`** | Expected when zero providers configured (`PENDING PROVIDER CREDENTIALS`) or token mismatch | For normal operation without providers, this is the expected fail-closed state. For auth errors, verify `OMNIROUTE_API_KEY`. |
| **Database Disk I/O Error** | Corrupted permissions on `/app/data` volume | Run `chown -R 1000:1000 /app/data` inside container or via volume utility container. |
| **SSL Certificate Error / Expired** | Traefik Let's Encrypt HTTP-01 challenge failure | Verify DNS `omniroute.workspacegroupefloteuil.eu` resolves to `62.164.214.145` and ports 80/443 are open. |

---

## 11. Live Combos & Related Architectural References

OmniRoute supports specialized high-availability combo routes for Rakazo autonomous agents:
- `combo/rakazo-coding` (Qwen 2.5 Coder 32B / Codestral Free)
- `combo/rakazo-reasoning` (DeepSeek R1 Free)
- `combo/rakazo-fast` (LLaMA 3.2 3B Free)
- `combo/rakazo-writing` (Mistral Small 24B Free)
- `combo/rakazo-analysis` (Qwen 2.5 72B Free)

Requests carry the `x-session-id` header (32-bit FNV-1a session hash) to maximize upstream KV prefix cache hits across multi-turn agent turns.

### Related Documentation
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md`](../RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md): Authoritative Master Architecture, Forensic Audit & Platform Runtime Truth Certification Artifact.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md`](../RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md): Master Passation & Production Excellence Certification Artifact.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md`](../RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md): Baseline architectural passation & certification artifact.
- [`RAKAZO_MASTER_BLUEPRINT_CURRENT.md`](../RAKAZO_MASTER_BLUEPRINT_CURRENT.md): Master platform architectural specification.
- [`AGENTS.md`](../AGENTS.md): Authoritative autonomous operating guide & 6 core pillars.
- [`docs/ENVIRONMENT_SETUP.md`](ENVIRONMENT_SETUP.md): Comprehensive developer setup and environment taxonomy.
- [`TEST_INFRA.md`](../TEST_INFRA.md): 4-Tier test infrastructure & methodology.
- [`TEST_READY.md`](../TEST_READY.md): Master test certification report.
