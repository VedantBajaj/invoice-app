# Invoice App - Operations & Setup Guide

> **Last updated:** 2026-03-23
> **Domain:** https://vbinvoice.xyz
> **GitHub:** https://github.com/VedantBajaj/invoice-app.git

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Access Credentials & Logins](#2-access-credentials--logins)
3. [Server Access (SSH)](#3-server-access-ssh)
4. [Service Management](#4-service-management)
5. [Cloudflare Tunnel](#5-cloudflare-tunnel)
6. [DNS & Domain](#6-dns--domain)
7. [Oracle Cloud Console](#7-oracle-cloud-console)
8. [Local Development](#8-local-development)
9. [Deploying Changes](#9-deploying-changes)
10. [Troubleshooting](#10-troubleshooting)
11. [Backup & Recovery](#11-backup--recovery)
12. [Key File Locations](#12-key-file-locations)

---

## 1. Architecture Overview

```
User (India)
    |
    | HTTPS (port 443)
    v
Cloudflare CDN/Proxy
    |
    | Cloudflare Tunnel (encrypted, no open ports needed)
    v
Oracle Cloud VM (Ashburn, US)  -  129.213.124.239
    |
    | localhost:80
    v
PocketBase (Go binary + SQLite)
    |-- serves frontend (pb_public/)
    |-- REST API
    |-- SQLite database (pb_data/)
    '-- server hooks (pb_hooks/)
```

**Tech Stack:**
- **Backend:** PocketBase v0.36.4 (Go + SQLite, single binary)
- **Frontend:** Alpine.js + Tailwind CSS (no build step, served from `pb_public/`)
- **Server:** Oracle Cloud Free Tier - VM.Standard.E2.1.Micro (1 GB RAM, 30 GB disk)
- **OS:** Oracle Linux Server 9.7
- **HTTPS:** Cloudflare Tunnel (free, no certs to manage)
- **Domain registrar:** Porkbun (vbinvoice.xyz)
- **DNS:** Cloudflare

---

## 2. Access Credentials & Logins

### PocketBase Admin Dashboard
- **URL:** https://vbinvoice.xyz/_/
- **Local:** http://localhost:8090/_/
- **Email:** `admin@vbinvoice.xyz`
- **Password:** `Bajaj@123`
- **Use:** Manage collections, users, settings, view data

### Cloudflare Dashboard
- **URL:** https://dash.cloudflare.com
- **Use:** DNS records, tunnel management, analytics, SSL settings

### Oracle Cloud Console
- **URL:** https://cloud.oracle.com
- **Region:** us-ashburn-1
- **Use:** Instance management, networking, security lists

### Porkbun (Domain Registrar)
- **URL:** https://porkbun.com
- **Use:** Domain renewal, nameserver settings
- **Nameservers:** Set to Cloudflare (`iris.ns.cloudflare.com`, `ethan.ns.cloudflare.com`)

### GitHub
- **Repo:** https://github.com/VedantBajaj/invoice-app.git
- **Branch:** main

---

## 3. Server Access (SSH)

### Connect to the server
```bash
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239
```

### Key files
| File | Location |
|------|----------|
| SSH private key | `~/.ssh/oci_invoice` |
| SSH public key | `~/.ssh/oci_invoice.pub` |
| OCI CLI config | `~/.oci/config` |
| OCI API key | `~/.oci/oci_api_key.pem` |

### If SSH times out
The instance may be hung. Use OCI CLI to reboot:
```bash
# Check instance state
export SUPPRESS_LABEL_WARNING=True
INSTANCE_ID="ocid1.instance.oc1.iad.anuwcljt4c3zfbyc6hy6r2q6qubpvqvp5ez6hokmsxlp7dzzahs5xhtml2lq"

oci compute instance get --instance-id "$INSTANCE_ID" \
  --query 'data."lifecycle-state"'

# Reboot (soft reset)
oci compute instance action --instance-id "$INSTANCE_ID" --action SOFTRESET

# If soft reset gets stuck (>15 min), force stop + start:
oci compute instance action --instance-id "$INSTANCE_ID" --action STOP
# Wait until state is STOPPED, then:
oci compute instance action --instance-id "$INSTANCE_ID" --action START
```
> **Note:** Free tier micro instances can take 5-15 minutes to reboot. Be patient.

---

## 4. Service Management

Both services auto-start on boot via systemd.

### PocketBase
```bash
# Check status
sudo systemctl status pocketbase

# Restart
sudo systemctl restart pocketbase

# Stop
sudo systemctl stop pocketbase

# View logs
sudo journalctl -u pocketbase -f          # live tail
sudo journalctl -u pocketbase --since "1 hour ago"
```

**Service file:** `/etc/systemd/system/pocketbase.service`
```ini
[Unit]
Description=PocketBase Invoice App
After=network.target

[Service]
Type=simple
User=opc
Group=opc
WorkingDirectory=/home/opc/invoice
ExecStart=/home/opc/invoice/pocketbase serve --http=0.0.0.0:80
Restart=always
RestartSec=5
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

### Cloudflare Tunnel
```bash
# Check status
sudo systemctl status cloudflared

# Restart
sudo systemctl restart cloudflared

# View logs
sudo journalctl -u cloudflared -f

# List tunnel connections
cloudflared tunnel list
cloudflared tunnel info vbinvoice
```

**Service file:** `/etc/systemd/system/cloudflared.service`
```ini
[Unit]
Description=Cloudflare Tunnel for vbinvoice.xyz
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=opc
ExecStart=/usr/local/bin/cloudflared tunnel run vbinvoice
Restart=on-failure
RestartSec=5
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

### Firewall (firewalld)
```bash
# View open ports
sudo firewall-cmd --list-all

# Currently open: ssh(22), 80, 443, 8090 (legacy, PB now on 80)
```

---

## 5. Cloudflare Tunnel

### How it works
- Tunnel name: `vbinvoice`
- Tunnel ID: `a4e4bd94-2af2-4f57-862b-8d6e171edaf8`
- The tunnel creates an outbound connection FROM the server TO Cloudflare
- No inbound ports needed (80/443 on the server aren't actually required)
- Cloudflare handles SSL termination automatically

### Config file: `~/.cloudflared/config.yml`
```yaml
tunnel: a4e4bd94-2af2-4f57-862b-8d6e171edaf8
credentials-file: /home/opc/.cloudflared/a4e4bd94-2af2-4f57-862b-8d6e171edaf8.json

ingress:
  - hostname: vbinvoice.xyz
    service: http://localhost:8090
  - hostname: www.vbinvoice.xyz
    service: http://localhost:8090
  - service: http_status:404
```

> **⚠️ Remote config override:** The Cloudflare dashboard can push a remote config that overrides this local file. As of 2026-03-22, the remote config routes to `localhost:80`. PocketBase was moved to port 80 (with `cap_net_bind_service` capability) to match. If you change the port, update BOTH the local config AND the Cloudflare dashboard (Zero Trust → Tunnels → vbinvoice → Public Hostname).

### Credentials file
`~/.cloudflared/a4e4bd94-2af2-4f57-862b-8d6e171edaf8.json`
> This file authenticates the tunnel. If lost, you'd need to delete and recreate the tunnel.

### If tunnel stops working
```bash
# 1. Check the service
sudo systemctl status cloudflared

# 2. Restart it
sudo systemctl restart cloudflared

# 3. Verify connections
cloudflared tunnel info vbinvoice
# Should show 4 connections (iad08, iad09, iad10, iad11)

# 4. Check from your laptop
curl -sS https://vbinvoice.xyz | head -5
```

### Recreating the tunnel (nuclear option)
```bash
# Only if credentials are lost or tunnel is broken
cloudflared tunnel delete vbinvoice
cloudflared tunnel create vbinvoice
cloudflared tunnel route dns vbinvoice vbinvoice.xyz
cloudflared tunnel route dns vbinvoice www.vbinvoice.xyz
# Then update config.yml with the new tunnel ID and credentials path
sudo systemctl restart cloudflared
```

---

## 6. DNS & Domain

### Current DNS setup
| Record | Type | Value |
|--------|------|-------|
| vbinvoice.xyz | CNAME | a4e4bd94-2af2-4f57-862b-8d6e171edaf8.cfargotunnel.com (proxied) |
| www.vbinvoice.xyz | CNAME | a4e4bd94-2af2-4f57-862b-8d6e171edaf8.cfargotunnel.com (proxied) |

### Verify DNS
```bash
dig vbinvoice.xyz NS +short
# Should return: iris.ns.cloudflare.com and ethan.ns.cloudflare.com

dig vbinvoice.xyz A +short
# Should return Cloudflare IPs (104.21.x.x, 172.67.x.x)
```

### Domain renewal
- Registered at **Porkbun** (https://porkbun.com)
- Domain: `vbinvoice.xyz`
- Nameservers pointed to Cloudflare (DO NOT change these)

---

## 7. Oracle Cloud Console

### Key identifiers
| Resource | OCID / Value |
|----------|------|
| Tenancy | `ocid1.tenancy.oc1..aaaaaaaawzxtfs74du4lorfocjzuzqecdolf4lzwotr3fyclotk3tva5qs7q` |
| User | `ocid1.user.oc1..aaaaaaaawrgsu33vdox33emyk7h27jnqghkod4otypng6hnmhvcz4ezxc3tq` |
| Instance | `ocid1.instance.oc1.iad.anuwcljt4c3zfbyc6hy6r2q6qubpvqvp5ez6hokmsxlp7dzzahs5xhtml2lq` |
| Subnet | `ocid1.subnet.oc1.iad.aaaaaaaaxgwkxflnf6g3xtx3jioxnmrbklt3x2ccwu3s4qn6i5alnzle2nqa` |
| Security List | `ocid1.securitylist.oc1.iad.aaaaaaaapd2l6iufamcnj5mgogy37qm4wiyyjygsck4gjcbk7psszwsbfw3q` |

### Instance details
- **Name:** invoice-app
- **Shape:** VM.Standard.E2.1.Micro (Always Free)
- **Public IP:** 129.213.124.239
- **Private IP:** 10.0.0.248
- **Region:** us-ashburn-1

### Security list ingress rules (OCI firewall)
| Port | Protocol | Source |
|------|----------|--------|
| 22 | TCP | 0.0.0.0/0 |
| 80 | TCP | 0.0.0.0/0 |
| 443 | TCP | 0.0.0.0/0 |
| 8090 | TCP | 0.0.0.0/0 |

### OCI CLI quick commands
```bash
export SUPPRESS_LABEL_WARNING=True
INSTANCE_ID="ocid1.instance.oc1.iad.anuwcljt4c3zfbyc6hy6r2q6qubpvqvp5ez6hokmsxlp7dzzahs5xhtml2lq"

# Check instance state
oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"'

# List instances
oci compute instance list \
  --compartment-id "ocid1.tenancy.oc1..aaaaaaaawzxtfs74du4lorfocjzuzqecdolf4lzwotr3fyclotk3tva5qs7q" \
  --query 'data[*].{"name":"display-name","state":"lifecycle-state"}' --output table

# Reboot
oci compute instance action --instance-id "$INSTANCE_ID" --action SOFTRESET

# Get console output (useful when SSH is dead)
oci compute instance get-console-history --instance-id "$INSTANCE_ID"
```

---

## 8. Local Development

### Prerequisites
- macOS with PocketBase binary in `/Users/saketbajaj/invoice/pocketbase`
- No build tools needed (frontend is plain HTML/JS/CSS)

### Start locally
```bash
cd ~/invoice
./pocketbase serve
# App: http://localhost:8090
# Admin: http://localhost:8090/_/
```
> **Note:** Local dev runs on port 8090. Production runs on port 80 (PocketBase has `cap_net_bind_service` on the server).

### Project structure
```
invoice/
  pb_public/           # Frontend (HTML, JS, CSS) - served by PocketBase
    index.html         # Single-page app (all page templates)
    js/                # Alpine.js page modules
    css/               # Styles
    icons/             # PWA icons
    manifest.json      # PWA manifest
    sw.js              # Service worker
  pb_hooks/            # Server-side JavaScript hooks
    invoice_hooks.pb.js   # Auto-numbering, validation
  pb_migrations/       # Database schema migrations
  pb_data/             # SQLite database (gitignored)
  scripts/             # Data import tools
  tests/               # API and unit tests
  docs/                # Documentation
```

### Run tests
```bash
# Start PocketBase first, then:
node tests/run-tests.mjs
# Or individual:
node tests/api-tests.mjs
node tests/unit-tests.mjs
```

---

## 9. Deploying Changes

### Deploy frontend changes to server
```bash
# From your laptop:
scp -i ~/.ssh/oci_invoice -r ~/invoice/pb_public/* opc@129.213.124.239:/home/opc/invoice/pb_public/

# Restart PocketBase to pick up changes
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239 "sudo systemctl restart pocketbase"
```

### Deploy hook changes
```bash
# NOTE: pb_hooks/ is not currently deployed to the server.
# To deploy:
scp -i ~/.ssh/oci_invoice -r ~/invoice/pb_hooks opc@129.213.124.239:/home/opc/invoice/

# Restart
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239 "sudo systemctl restart pocketbase"
```

### Deploy migration changes
```bash
scp -i ~/.ssh/oci_invoice -r ~/invoice/pb_migrations/* opc@129.213.124.239:/home/opc/invoice/pb_migrations/
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239 "sudo systemctl restart pocketbase"
```

### Full deploy script (copy-paste)
```bash
SERVER="opc@129.213.124.239"
KEY="~/.ssh/oci_invoice"

scp -i $KEY -r ~/invoice/pb_public/* $SERVER:/home/opc/invoice/pb_public/
scp -i $KEY -r ~/invoice/pb_hooks $SERVER:/home/opc/invoice/
scp -i $KEY -r ~/invoice/pb_migrations/* $SERVER:/home/opc/invoice/pb_migrations/
ssh -i $KEY $SERVER "sudo systemctl restart pocketbase"
echo "Deployed! Check https://vbinvoice.xyz"
```

### ⚠️ Service Worker Version Sync (CRITICAL)

The SW version lives in **3 places** that MUST stay in sync. Mismatched versions cause an **infinite reload loop** on mobile.

| Location | What to update |
|----------|---------------|
| `pb_public/sw.js` line 2 | `const CACHE = 'invoice-vNN'` |
| `pb_public/index.html` bottom | `const APP_VERSION = NN;` |
| `pb_public/index.html` bottom | `navigator.serviceWorker.register("/sw.js?v=NN")` |

**Before deploying any frontend change:**
1. Bump `NN` in all 3 places to the same number
2. Deploy files to server
3. Verify on mobile: hard refresh, check items load

**Current version:** 75 (as of 2026-03-23)

### Git workflow
```bash
git add -A
git commit -m "Your message"
git push origin main
```

---

## 10. Troubleshooting

### Site is down (https://vbinvoice.xyz not loading)

**Step 1: Check from laptop**
```bash
curl -sS -o /dev/null -w "%{http_code}" https://vbinvoice.xyz
# Should return 200
```

**Step 2: SSH into server**
```bash
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239
```

**Step 3: If SSH times out - reboot via OCI CLI**
```bash
export SUPPRESS_LABEL_WARNING=True
oci compute instance action \
  --instance-id "ocid1.instance.oc1.iad.anuwcljt4c3zfbyc6hy6r2q6qubpvqvp5ez6hokmsxlp7dzzahs5xhtml2lq" \
  --action SOFTRESET
# Wait 5-15 minutes, then try SSH again
```

**Step 4: If SSH works, check services**
```bash
sudo systemctl status pocketbase
sudo systemctl status cloudflared
# Restart if needed:
sudo systemctl restart pocketbase
sudo systemctl restart cloudflared
```

**Step 5: Check if PocketBase responds locally on server**
```bash
curl http://localhost:80
# If this fails, PocketBase is down
```

**Step 6: Check disk space and memory**
```bash
df -h /
free -m
# If disk full: check /home/opc/invoice/pb_data/ size
# If memory full: reboot
```

### Tunnel has 0 connections
```bash
cloudflared tunnel info vbinvoice
# Should show 4 connections. If 0:
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared --since "5 minutes ago"
```

### PocketBase won't start
```bash
sudo journalctl -u pocketbase --since "5 minutes ago"
# Common issues:
# - Port 80 already in use: sudo lsof -i :80
# - Database locked: restart will fix
# - Disk full: df -h /
```

### Domain not resolving
```bash
dig vbinvoice.xyz NS +short
# Must show cloudflare nameservers
# If not: check Porkbun nameserver settings
```

### Oracle wants to reclaim the instance
- Oracle sends email warnings before reclaiming idle free-tier instances
- Keep the app in use (active traffic prevents reclamation)
- If reclaimed: create a new instance and redo server setup

---

## 11. Backup & Recovery

### Backup the database
```bash
# From laptop - download pb_data from server
scp -i ~/.ssh/oci_invoice -r opc@129.213.124.239:/home/opc/invoice/pb_data ~/invoice-backup-$(date +%Y%m%d)/
```

### Restore database
```bash
# Stop PocketBase first
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239 "sudo systemctl stop pocketbase"

# Upload backup
scp -i ~/.ssh/oci_invoice -r ~/invoice-backup-YYYYMMDD/pb_data/* opc@129.213.124.239:/home/opc/invoice/pb_data/

# Start PocketBase
ssh -i ~/.ssh/oci_invoice opc@129.213.124.239 "sudo systemctl start pocketbase"
```

### Full server rebuild (if instance is terminated)
1. Create new OCI free-tier instance (VM.Standard.E2.1.Micro, Oracle Linux 9)
2. Open ports 22, 80, 443, 8090 in security list
3. SSH in and set up:
```bash
# Download PocketBase
cd ~
mkdir invoice && cd invoice
curl -sSL 'https://github.com/pocketbase/pocketbase/releases/download/v0.36.4/pocketbase_0.36.4_linux_amd64.zip' -o pb.zip
unzip pb.zip && rm pb.zip

# Upload your files from laptop
# (from laptop):
scp -i ~/.ssh/oci_invoice -r ~/invoice/pb_public ~/invoice/pb_migrations ~/invoice/pb_hooks opc@NEW_IP:/home/opc/invoice/

# Restore database backup
scp -i ~/.ssh/oci_invoice -r ~/invoice-backup-LATEST/pb_data opc@NEW_IP:/home/opc/invoice/

# Create systemd services (copy the service files from Section 4)
# Install cloudflared and recreate tunnel (see Section 5)

# Update Cloudflare DNS if IP changed (tunnel handles this automatically)
```

---

## 12. Key File Locations

### On your laptop (`/Users/saketbajaj/`)
| File | Purpose |
|------|---------|
| `~/.ssh/oci_invoice` | SSH private key for Oracle server |
| `~/.ssh/oci_invoice.pub` | SSH public key |
| `~/.oci/config` | OCI CLI configuration |
| `~/.oci/oci_api_key.pem` | OCI API signing key |
| `~/invoice/` | Full project source code |
| `~/invoice/pocketbase` | PocketBase binary (macOS) |

### On the server (`/home/opc/`)
| File | Purpose |
|------|---------|
| `/home/opc/invoice/pocketbase` | PocketBase binary (Linux) |
| `/home/opc/invoice/pb_data/` | SQLite database + uploads |
| `/home/opc/invoice/pb_public/` | Frontend files |
| `/home/opc/invoice/pb_migrations/` | Database migrations |
| `/home/opc/.cloudflared/config.yml` | Tunnel configuration |
| `/home/opc/.cloudflared/*.json` | Tunnel credentials |
| `/home/opc/.cloudflared/cert.pem` | Cloudflare origin certificate |
| `/etc/systemd/system/pocketbase.service` | PocketBase systemd unit |
| `/etc/systemd/system/cloudflared.service` | Tunnel systemd unit |

---

## Quick Reference Card

```
SSH into server:     ssh -i ~/.ssh/oci_invoice opc@129.213.124.239
Check PocketBase:    sudo systemctl status pocketbase
Check tunnel:        sudo systemctl status cloudflared
Restart PocketBase:  sudo systemctl restart pocketbase
Restart tunnel:      sudo systemctl restart cloudflared
View PB logs:        sudo journalctl -u pocketbase -f
View tunnel logs:    sudo journalctl -u cloudflared -f
Backup database:     scp -i ~/.ssh/oci_invoice -r opc@129.213.124.239:/home/opc/invoice/pb_data ~/backup/
Test site:           curl -sS https://vbinvoice.xyz | head -5
PB Admin:            https://vbinvoice.xyz/_/
Cloudflare:          https://dash.cloudflare.com
Oracle Cloud:        https://cloud.oracle.com
```
