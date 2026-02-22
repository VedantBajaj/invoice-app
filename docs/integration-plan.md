# RainTek Full Integration — Implementation Plan

## Context

The shop runs **two systems in parallel**: PocketBase (our invoice app) and RainTek (legacy .NET POS on a separate Windows machine). Currently they're completely disconnected — products were imported once from Excel, and invoices inserted manually via SQL scripts. The goal is to **keep both systems in sync automatically** so either can be used without data diverging.

**Key constraints from user:**
- **Everything on the same Windows machine** — PocketBase, sync service, and SQL Server all on localhost
- **RainTek is master for products** (pricing, new items come from RainTek)
- **PocketBase is master for invoices** (billing happens on phone/tablet via LAN)
- **Real-time sync** preferred, with retry/backup for failures
- RainTek is still occasionally used for **OCR/scan bill imports** — need two-way invoice awareness
- **No tech-literate staff** — system must be fully self-healing, zero-touch after install
- **Clean start** — don't carry over test/junk data from Mac. Start fresh, sync products from RainTek, trial test, then go live
- **Daily machine restarts** — everything auto-recovers on boot

## Architecture

Everything runs on the **same Windows machine** as RainTek's SQL Server:

```
┌──────────────────────────────────────────────────┐
│                Windows Machine                    │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐│
│  │  PocketBase  │◄►│ raintek-sync │◄►│SQL Server││
│  │  :8090       │  │ (Node.js)    │  │localhost  ││
│  └─────────────┘  └──────────────┘  └──────────┘│
│        REST + SSE       mssql (localhost)         │
└──────────────────────────────────────────────────┘
```

**Benefits of co-hosting:**
- SQL Server connection via `localhost` — no firewall/network issues
- Windows Authentication works natively (no SQL auth credentials needed)
- PocketBase ↔ sync service communicate via `localhost:8090`
- Single machine to manage, deploy, and monitor

**Why a separate Node.js service?** PocketBase hooks run in a Go-embedded JS VM (JSVM) that cannot use npm packages like `mssql`. A standalone Node service can use `mssql` (TDS protocol) for SQL Server and PocketBase's REST API + SSE realtime for PocketBase.

## Sync Flows

### Flow 1: Products — RainTek → PocketBase (every 5 min poll)
- Pull from RainTek: `Product` + `Product_OpeningStock` (for barcode, current stock)
- Match on `product_code` (RainTek `ProductID`)
- Update PocketBase: name, retail_price, mrp, barcode, current_stock, hsn_code
- New products in RainTek → create in PocketBase
- **No delete sync** — soft-disable via `active = false`

### Flow 2: Invoices — PocketBase → RainTek (realtime via SSE)
- Subscribe to PocketBase `invoices` collection (status = "completed")
- On new completed invoice:
  1. Upsert customer in RainTek `Customer` table (match on phone)
  2. Insert `InvoiceInfo` row (with ALL columns filled — NULL-safe per docs)
  3. Insert `Invoice_Product` rows (with `IDENTITY_INSERT ON`)
  4. Insert `Invoice_Payment` row (with `IDENTITY_INSERT ON`)
  5. Insert `SaleGST` row (critical for RainTek invoice counter)
  6. Update PocketBase invoice with `raintek_inv_id` for traceability
- Uses the complete SQL template from `docs/raintek-sync-recipe.sql`

### Flow 2b: Modified/Revised Invoices — Update in Place
The app handles edits by marking the old invoice as **"revised"** and creating a **new record** with the same invoice number (see `invoice-new.js` line 320-326). For RainTek sync:

- **When old invoice is marked "revised"** → the sync service detects this
- **When new "completed" version is created** → sync service **updates the existing RainTek rows in place** using the same `Inv_ID`:
  1. `UPDATE InvoiceInfo` — update totals, tax amounts, payment
  2. `DELETE FROM Invoice_Product WHERE InvoiceID = @InvID` — remove old line items
  3. `INSERT Invoice_Product` — insert new line items
  4. `UPDATE Invoice_Payment` — update payment amount
  5. SaleGST stays unchanged (same invoice number)
- PocketBase keeps both records (old "revised" + new "completed") as the audit trail
- RainTek always has one clean copy per invoice

**Matching logic**: The new PB invoice has the same `invoice_number` → look up `raintek_inv_id` from the old (revised) PB record → update those RainTek rows

### Flow 3: Invoice Awareness — RainTek → PocketBase (every 5 min poll)
- Poll RainTek `InvoiceInfo` for invoices NOT in PocketBase (by invoice number)
- Create read-only invoice records in PocketBase with `source = "raintek"` flag
- These appear in reports/history but can't be edited in our app
- Handles the OCR/scan bills the user occasionally creates in RainTek

## Files to Create/Modify

### New: `sync/` directory (Node.js service)

#### `sync/package.json`
- Dependencies: `mssql`, `node-windows` (Windows Service registration)
- Built-in `fetch` (Node 18+) — no `node-fetch` needed
- Scripts: `start`, `dev`, `install-service`, `uninstall-service`

#### `sync/config.js`
- SQL Server connection: `localhost`, `Raintech_DB1`, Windows Authentication (trusted connection)
- PocketBase URL: `http://localhost:8090`, admin credentials
- Poll intervals, retry settings
- Load from environment variables with sensible defaults

#### `sync/db.js`
- `mssql` connection pool management
- Helper: `query(sql, params)` — parameterized queries
- Helper: `getNextId(table, idColumn)` — MAX+1 pattern from recipe
- Connection retry with exponential backoff

#### `sync/pb.js`
- PocketBase REST API client (authenticate as admin, CRUD, SSE subscribe)
- Auto-refresh auth token
- Helper: `subscribe(collection, callback)` — SSE realtime listener

#### `sync/sync-products.js`
- `pullProducts()` — query RainTek `Product` + `Product_OpeningStock`
- Map RainTek fields → PocketBase fields
- Upsert logic: match on `product_code`, create or update
- Track `last_synced_at` timestamp to only pull changes

#### `sync/sync-invoices.js`
- `pushInvoice(pbInvoice)` — the core push function
  - Fetches invoice items + customer from PocketBase
  - Builds complete SQL using the recipe template (ALL columns, no NULLs)
  - Wraps in SQL transaction (BEGIN TRAN / COMMIT / ROLLBACK)
  - On success: stamps `raintek_inv_id` back on PocketBase invoice
  - On failure: logs error, queues for retry
- `pullRaintekInvoices()` — poll for RainTek-created invoices
  - Query `InvoiceInfo` WHERE `Inv_ID > last_known_id`
  - Create read-only invoice records in PocketBase

#### `sync/sync-engine.js`
- Main orchestrator
- Starts SSE listener for invoice push (realtime), with auto-reconnect
- Starts polling timers for product pull + invoice awareness
- **Startup catch-up**: on boot, queries PocketBase for `sync_status = "pending"` invoices and syncs them (handles anything created while machine was off or restarts mid-sync)
- Retry queue: failed syncs stored in `sync/state.json` on disk (survives daily restarts), retried with backoff
- Health check endpoint (GET /health) for monitoring
- **Revised invoice handler**: when a new "completed" invoice has the same `invoice_number` as an existing "revised" one, looks up the `raintek_inv_id` from the revised record and updates RainTek in place instead of inserting

#### `sync/index.js`
- Entry point: loads config, connects to both databases, starts sync engine
- Graceful shutdown handling (close connections on SIGTERM/SIGINT)
- Sends Telegram "started" notification with catch-up status

#### `sync/backup.js`
- `backupSqlServer()` — runs `BACKUP DATABASE` via mssql, verifies file created
- `backupPocketBase()` — copies `pb_data/data.db` to backup dir
- `dumpSchema()` — weekly INFORMATION_SCHEMA dump for all RainTek tables
- `cleanOldBackups()` — delete backups >30 days, snapshots >90 days
- `snapshotInvoice(invId)` — save current RainTek rows to JSON before modification

#### `sync/telegram.js`
- Send alerts via Telegram bot API (reuse existing bot token)
- Rate limiting — no more than 1 alert per minute for recurring issues
- Alert batching — group multiple failures into one message

#### `sync/install.bat`
- Installs Node.js sync service as Windows Service (via `node-windows`)
- Installs PocketBase as Windows Service
- Creates backup directories (`D:\Backups\raintek\`, `D:\Backups\pocketbase\`)
- Sets up Windows Task Scheduler for weekly schema dumps
- One double-click install — no command-line knowledge needed

#### `sync/uninstall.bat`
- Removes both Windows Services
- Preserves data and backups (does NOT delete)

### Modify: PocketBase schema (new migration)

#### `pb_migrations/007_raintek_sync_fields.js`
Add sync metadata fields:
- `products`: add `raintek_product_id` (text), `last_synced_at` (date)
- `invoices`: add `raintek_inv_id` (number), `source` (select: "app", "raintek"), `sync_status` (select: "pending", "synced", "failed", "na")
- `customers`: add `raintek_customer_id` (number)

### Modify: `pb_hooks/invoice_hooks.js`
- On invoice create (status=completed): set `sync_status = "pending"` automatically
- Skip for invoices with `source = "raintek"` (already synced from RainTek)

### Modify: Frontend (minimal changes)

#### `pb_public/js/pages/invoice-new.js`
- After successful invoice creation, no change needed — the sync service picks it up via SSE

#### `pb_public/index.html` + invoice list page
- Show sync status badge on invoices: 🔄 pending, ✅ synced, ❌ failed
- Show "RainTek" source badge for invoices imported from RainTek
- Version bump (APP_VERSION, ?v=, CACHE_NAME)

#### `pb_public/css/app.css`
- Sync status badge styles

## Implementation Phases

### Phase 0: Get PocketBase Running on Windows
**Must complete first** — our entire app currently runs on Mac. We need to migrate it to the Windows machine.

1. **Install PocketBase for Windows**
   - Download `pocketbase_windows_amd64.zip` from pocketbase.io
   - Extract to `D:\InvoiceApp\` (or similar)
   - Copy `pb_public/`, `pb_hooks/`, `pb_migrations/` from our repo
   - Test: `pocketbase.exe serve --http 0.0.0.0:8090`

2. **Install Node.js on Windows**
   - Download Node.js LTS (v20+) installer for Windows
   - Verify: `node --version`, `npm --version`

3. **Copy app files to Windows**
   - Clone repo or copy files: `pb_public/`, `pb_hooks/`, `pb_migrations/`, `docs/`, `scripts/`
   - Directory structure on Windows:
     ```
     D:\InvoiceApp\
     ├── pocketbase.exe
     ├── pb_public\        (our frontend)
     ├── pb_hooks\         (server hooks)
     ├── pb_migrations\    (schema)
     ├── pb_data\          (will be created on first run)
     ├── docs\
     ├── scripts\
     └── sync\             (will create in Phase 1)
     ```

4. **Start fresh PocketBase (NO old data)**
   - Do NOT copy `pb_data/` from Mac — start with a clean database
   - Run PocketBase → migrations auto-create the schema
   - Create admin user and app users manually
   - **Products will come from RainTek** via sync (Phase 2) — no need to import

5. **Test the app from phone**
   - Find the Windows machine's LAN IP (e.g., `192.168.1.X`)
   - Windows Firewall: allow inbound on port 8090
   - Access from phone: `http://192.168.1.X:8090`
   - Verify: login, UI loads, barcode scanner works

6. **Register PocketBase as a Windows Service**
   - Use `nssm` (Non-Sucking Service Manager) or `node-windows`
   - Command: `nssm install InvoiceApp "D:\InvoiceApp\pocketbase.exe" "serve --http 0.0.0.0:8090"`
   - Set startup type: Automatic
   - Test: restart machine, verify PocketBase auto-starts

### Phase 0b: Trial Period (Test Before Going Live)
After sync is built (Phases 1-5), run a trial period:

1. **Products sync from RainTek** → verify all products appear in PocketBase with correct prices
2. **Create test invoices** in our app → verify they appear in RainTek correctly
3. **Test revised invoices** → verify RainTek updates in place
4. **Test edge cases**: camera scanner, quick-add products, different payment methods
5. **Verify backups are running** → check backup files exist
6. **Verify daily restart** → machine restarts, everything comes back up

Once confident:

7. **Delete all test data**:
   - Delete test invoices from RainTek (or mark them)
   - Wipe PocketBase: delete `pb_data/` and restart fresh
   - Reset invoice counter to match RainTek's current counter
   - Products re-sync from RainTek automatically
8. **Go live** — start billing through our app from this point forward
9. **Invoice numbering**: align with RainTek's current sequence so numbers don't conflict

### Phase 1: Schema + Sync Service Scaffold + Backups
1. Create migration `007_raintek_sync_fields.js`
2. Scaffold `sync/` directory with config, db, pb, telegram, backup modules
3. Test SQL Server connectivity via localhost (Windows Auth)
4. Implement daily backup (SQL Server + PocketBase) — this runs first before any sync logic
5. Implement weekly schema dump

### Phase 2: Product Pull (RainTek → PB)
1. Implement `sync-products.js`
2. Test with live RainTek data
3. Verify product_code matching works

### Phase 3: Invoice Push (PB → RainTek)
1. Implement `sync-invoices.js` push function
2. Port the complete SQL recipe into parameterized queries
3. Test with a real invoice — verify it appears in RainTek
4. Add retry queue for failures

### Phase 4: Invoice Awareness (RainTek → PB)
1. Implement RainTek invoice polling
2. Create read-only invoice records in PocketBase
3. Test with an OCR-imported invoice in RainTek

### Phase 5: Frontend Status UI + Monitoring
1. Add sync status badges to invoice list
2. Add RainTek source indicator
3. Version bump all caches
4. Implement Telegram alerts (sync failures, backup status, weekly integrity)
5. Data integrity verification (post-push read-back, weekly full scan)

### Phase 6: Production Hardening (Daily Restart Resilience)

**The machine restarts every day** (shop is closed during restart, so no invoices are missed). Everything must auto-start on boot without human intervention.

**Implementation:**
1. **Windows Services** via `node-windows` (npm package) — registers both PocketBase and sync service as Windows Services that auto-start on boot
2. **Persistent sync state** — write `last_synced_product_id` and retry queue to `sync/state.json` on disk (survives restarts)
3. **Startup catch-up** — on boot, sync service queries PocketBase for `sync_status = "pending"` invoices and pushes them (handles any that failed before restart)
4. **SSE reconnection** — auto-reconnect with exponential backoff after PocketBase comes up
5. **Logging** — structured JSON logs with daily rotation
6. **Health check endpoint** (GET /health) for monitoring
7. **Telegram notification** on sync failure

## Key References (existing files to reuse)

| File | What to reuse |
|------|--------------|
| `docs/raintek-sync-recipe.sql` | Complete SQL template for all 5 INSERT steps |
| `docs/raintek-null-fix-report.md` | Every column that must be non-NULL |
| `pb_hooks/invoice_hooks.js` | Pattern for hooks, invoice numbering format |
| `pb_public/js/api.js` | PocketBase API patterns (auth, CRUD) |
| `scripts/import-data.mjs` | Import patterns, field mapping reference |
| `pb_migrations/001_collections.js` | Full PocketBase schema reference |

## Robustness & Self-Healing (Zero Tech Knowledge Required)

**Guiding principle**: Nobody in the shop can debug code. If something goes wrong, the system must either fix itself or alert remotely (via Telegram) with enough context to diagnose from afar.

### Backup Strategy

#### 1. Full RainTek SQL Server Backup (Daily)
- **Before sync service starts each day** (on boot), run a full backup:
  ```sql
  BACKUP DATABASE [Raintech_DB1] TO DISK = 'D:\Backups\Raintech_DB1_YYYYMMDD.bak'
  ```
- Keep last **30 days** of backups, auto-delete older ones
- This is insurance — if our sync ever corrupts RainTek data, we can restore from the previous day

#### 2. RainTek Table Snapshots (Per-Sync)
- Before every invoice push, snapshot the affected rows:
  ```sql
  SELECT * FROM InvoiceInfo WHERE Inv_ID = @id  -- save to JSON
  SELECT * FROM Invoice_Product WHERE InvoiceID = @id
  ```
- Store snapshots in `sync/snapshots/YYYY-MM-DD/inv_XXXX.json`
- If an update-in-place goes wrong, we can restore the exact previous state
- Auto-cleanup: delete snapshots older than 90 days

#### 3. PocketBase Backup (Daily)
- PocketBase stores data in SQLite — copy `pb_data/data.db` to `D:\Backups\pocketbase_YYYYMMDD.db`
- Run daily on boot alongside SQL Server backup

#### 4. Full RainTek Schema Dump (Weekly)
- Dump complete table structures + sample data for reference
- Helps if we discover tomorrow that we need a column we didn't know about today:
  ```sql
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'InvoiceInfo'
  ```
- Store in `sync/schema-dumps/YYYY-MM-DD.json`

### Self-Healing

#### Connection Recovery
- **SQL Server down**: Retry with exponential backoff (1s, 2s, 4s, 8s... up to 5 min). Queue pending syncs. Resume when connection restored.
- **PocketBase down**: Same backoff pattern. SSE auto-reconnect.
- **Both down** (machine just booted): Wait for services to start, retry. Windows Service dependency ordering ensures PocketBase starts before sync service.

#### Sync Failure Recovery
- Every failed sync goes into `sync/state.json` retry queue with:
  - PocketBase invoice ID
  - Failure reason
  - Attempt count
  - Next retry timestamp
- Retry schedule: 1 min, 5 min, 15 min, 1 hour, then every hour
- After **24 hours of failures**: send Telegram alert with error details
- **Never silently drop** a sync — it stays in the queue forever until resolved

#### Data Integrity Checks
- After every invoice push: read-back from RainTek and verify key fields match (grand_total, item count, customer)
- If mismatch detected: log error, alert via Telegram, mark as "sync_failed" in PocketBase
- **Weekly integrity scan**: compare all PocketBase "synced" invoices against RainTek, flag any discrepancies

#### Crash Recovery
- Sync service writes a heartbeat timestamp to `sync/state.json` every 60 seconds
- On startup: check if last heartbeat was recent (crash mid-sync). If so, re-scan all "pending" invoices
- SQL transactions ensure atomicity: if crash happens mid-INSERT, the transaction rolls back automatically

### Monitoring & Alerts (via Telegram)

All alerts go to Telegram so you can monitor remotely:

| Event | Alert Level | Message |
|-------|-------------|---------|
| Sync service started/stopped | ℹ️ Info | "Sync service started. Caught up X pending invoices." |
| Invoice synced successfully | None (logged only) | — |
| Sync failed (first attempt) | None (will retry) | — |
| Sync failed after 24h | 🔴 Critical | "Invoice GST-XXXX failed to sync for 24h. Error: ..." |
| SQL Server unreachable | ⚠️ Warning | "SQL Server connection lost. Retrying..." |
| SQL Server recovered | ℹ️ Info | "SQL Server reconnected. Syncing X queued invoices." |
| Daily backup completed | ℹ️ Info | "Daily backup: RainTek 42MB, PocketBase 8MB" |
| Daily backup failed | 🔴 Critical | "Backup failed! Error: ..." |
| Data integrity mismatch | 🔴 Critical | "Invoice GST-XXXX: PocketBase total ₹2900 ≠ RainTek total ₹2800" |
| Weekly integrity scan | ℹ️ Info | "Weekly scan: 147 invoices checked, 0 mismatches" |

### Zero-Touch Operation

- **No config files to edit** — all settings baked in at install time, with sensible defaults
- **No manual restarts needed** — Windows Services auto-start, auto-recover
- **No log rotation needed** — auto-rotated daily, old logs auto-deleted after 30 days
- **No disk space concerns** — backups auto-cleaned after 30 days, snapshots after 90 days
- **Install script** (`sync/install.bat`): one double-click to register Windows Services, set up scheduled tasks, create backup directories
- **Uninstall script** (`sync/uninstall.bat`): cleanly removes everything

## Verification

1. **Windows setup**: PocketBase accessible from phone at `http://LAN_IP:8090`, survives machine restart
2. **Product sync**: Add a new product in RainTek → appears in PocketBase within 5 min
3. **Price update**: Change retail price in RainTek → PocketBase product updated
4. **Invoice push**: Create invoice in our app → appears in RainTek immediately
5. **NULL safety**: Verify the pushed invoice opens in RainTek without DBNull crash
6. **SaleGST counter**: After push, next RainTek invoice gets the correct next number
7. **Invoice revision**: Edit invoice in our app → RainTek updated in place
8. **Invoice awareness**: Create an OCR invoice in RainTek → appears in PocketBase as read-only
9. **Retry**: Stop SQL Server, create invoice, restart SQL Server → invoice eventually syncs
10. **Health check**: `curl http://localhost:3030/health` returns status of both connections
11. **Concurrent use**: Create invoices in both systems simultaneously → no ID collisions
12. **Windows deployment**: PocketBase + sync service start on boot, survive machine restarts
13. **Phone access**: Billing via phone/tablet connects to PocketBase on Windows machine's LAN IP
14. **Backups**: Daily SQL + PocketBase backups exist, old ones auto-cleaned
15. **Trial → Go live**: Test data wiped cleanly, invoice counter aligned with RainTek
