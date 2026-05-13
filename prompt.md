Build a fully functional Obsidian plugin called "obsidian-supabase-sync" that 
automatically syncs an Obsidian vault to Supabase in real time — no manual 
push/pull. The user only needs to enter their Supabase URL and anon key in 
settings and the plugin handles everything else.

The plugin must work correctly on ALL platforms:
  - Linux / Windows / macOS (desktop)
  - iOS (iPhone + iPad) via Obsidian mobile
  - Android via Obsidian mobile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- TypeScript, compiled with esbuild
- Obsidian Plugin API (obsidian npm package)
- @supabase/supabase-js v2
- Node.js 18+ (build environment only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
obsidian-supabase-sync/
├── src/
│   ├── main.ts          — Plugin entry point
│   ├── sync-engine.ts   — All sync logic
│   ├── supabase.ts      — Client init + typed DB helpers
│   ├── settings.ts      — Settings tab UI
│   ├── queue.ts         — Offline queue (persisted to data.json)
│   ├── platform.ts      — Platform detection + capability helpers
│   └── utils.ts         — debounce(), md5Checksum(), isBinaryFile()
├── manifest.json
├── styles.css
├── package.json
├── tsconfig.json
└── esbuild.config.mjs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLATFORM LAYER (src/platform.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create a PlatformHelper class that wraps all platform-specific behaviour.
Import Platform from 'obsidian' and use it for every platform check —
never use navigator.userAgent, process.platform, or typeof window checks
as the primary branch.

  import { Platform } from 'obsidian';

  export const isDesktop  = Platform.isDesktop;   // Linux, Windows, macOS
  export const isMobile   = Platform.isMobile;    // iOS + Android
  export const isIosApp   = Platform.isIosApp;    // iOS + iPadOS specifically
  export const isMacApp   = Platform.isMacApp;    // macOS desktop app

Implement these helpers in platform.ts:

  getRealtimeConfig(): Partial<RealtimeClientOptions>
    — On mobile return { timeout: 30000, heartbeatIntervalMs: 20000 }
      (cellular links are slower; default 10s heartbeat causes spurious disconnects)
    — On desktop return { timeout: 15000, heartbeatIntervalMs: 10000 }

  shouldDeferHeavySync(): boolean
    — Return true on isMobile (batch reconciliation should be chunked smaller
      and deferred so it does not block the UI thread on app open)

  getDebounceMs(userSetting: number): number
    — On mobile return Math.max(userSetting, 4000)
      (typing on mobile is slower and battery is more precious)
    — On desktop return userSetting

  canUseBackgroundSync(): boolean
    — Always return false. Obsidian mobile does not expose background execution.
      All sync is foreground-only; queue items are flushed on next app open.

  getMaxBatchSize(): number
    — Return 20 on mobile, 50 on desktop.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
On first run the plugin must automatically run these SQL statements.
Also output these as schema.sql in the repo root for the user's reference.

  create table if not exists files (
    path        text primary key,
    content     text,
    updated_at  timestamptz not null default now(),
    device_id   text,
    checksum    text
  );

  create table if not exists tombstones (
    path        text primary key,
    deleted_at  timestamptz not null default now()
  );

  -- User must enable Realtime manually in Supabase dashboard.
  -- Print a warning in the plugin console if Realtime is not reachable.
  alter publication supabase_realtime add table files;
  alter publication supabase_realtime add table tombstones;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTINGS (src/settings.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  interface PluginSettings {
    supabaseUrl: string;
    supabaseAnonKey: string;
    deviceId: string;        // auto-generated UUID on first run
    syncEnabled: boolean;
    excludePatterns: string; // comma-separated globs e.g. ".obsidian/*,*.canvas"
    debounceMs: number;      // default 2500 desktop / enforced ≥4000 mobile
  }

Settings tab must include:
- Text field: Supabase URL
- Text field: Anon key (type="password")
- Toggle: sync enabled/disabled
- Text field: exclude patterns
- Number field: debounce delay
- "Test connection" button — pings Supabase, shows success/error Notice
- On mobile (Platform.isMobile): show an info banner:
  "On iOS/Android, sync runs while the app is open. Changes made on other 
   devices will appear next time you open this app."
- Security warning (all platforms):
  "data.json contains your API key. Do not commit it to version control."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYNC ENGINE (src/sync-engine.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. INITIAL RECONCILIATION
   Run inside app.workspace.onLayoutReady().
   On mobile, additionally delay 2000ms after onLayoutReady fires before 
   starting reconciliation so the UI is fully painted and responsive.

   - Fetch remote file index: path, updated_at, checksum
   - Walk local vault files via app.vault.getFiles()
   - Skip files matching excludePatterns
   - Use getMaxBatchSize() from platform.ts for batch size
   - Between batches on mobile, await a 100ms yield 
     (setTimeout 0 equivalent) to keep UI responsive:
       await new Promise(r => setTimeout(r, Platform.isMobile ? 100 : 0));
   - For each file:
     * Remote missing → push local to Supabase
     * Local missing  → pull from Supabase and create locally
     * Both exist     → compare updated_at; newer wins
     * Equal updated_at but different checksum → keep remote,
       rename local to filename.conflict.md
   - Fetch tombstones → delete matching local files

2. LIVE LISTENER — REMOTE → LOCAL
   - Create Supabase Realtime channel using getRealtimeConfig() options
   - Subscribe to INSERT/UPDATE on files table and INSERT on tombstones
   - On receiving event:
     * Skip if path is in pendingRemoteWrites Set
     * Add to pendingRemoteWrites
     * Write/delete via app.vault.adapter (never fs)
     * Remove from pendingRemoteWrites after completion
   
   MOBILE RECONNECTION — iOS and iPadOS aggressively suspend WebSocket 
   connections when the app goes to the background or the screen locks.
   Implement reconnection handling:
     * Listen to document 'visibilitychange' event
     * When document.visibilityState === 'visible':
       - Check if Realtime channel status is not 'SUBSCRIBED'
       - If not subscribed, call channel.subscribe() again
       - After resubscribing, run a lightweight incremental sync:
         fetch only remote rows where updated_at > lastSyncTimestamp
         (store lastSyncTimestamp in memory, updated after every 
         successful sync operation)
     * Register this listener via:
         this.plugin.registerDomEvent(document, 'visibilitychange', handler)
       so it is cleaned up automatically on plugin unload

3. LIVE LISTENER — LOCAL → REMOTE
   - Register vault events with this.plugin.registerEvent()
   - Use getDebounceMs() from platform.ts for modify debounce
   - On create/modify:
     * Skip if path in pendingRemoteWrites
     * Skip if path matches excludePatterns
     * Binary files → upload to Supabase Storage bucket "vault-attachments",
       store public URL as content with prefix "STORAGE:"
       On iOS: read binary files via app.vault.adapter.readBinary() 
       and convert ArrayBuffer to base64 using a pure-JS base64 encoder 
       (do NOT use Buffer — it is not available in the iOS WebKit context)
     * Text files → app.vault.adapter.read()
     * Compute checksum, upsert to Supabase
     * On error → push to offline queue
   - On delete → insert tombstone, delete from files, or queue if offline
   - On rename → tombstone old path, upsert new path

4. OFFLINE QUEUE (src/queue.ts)
   - Persisted in data.json under key "offlineQueue"
   - Flush on: plugin load, window 'online' event, visibilitychange to visible
   - On mobile, also attempt flush inside the visibilitychange handler
     immediately after resubscribing Realtime (the most reliable flush 
     opportunity on iOS since there is no background execution)
   - Queue item: { op: 'upsert'|'delete', path, content?, checksum?, 
                   updatedAt, retries }
   - Drop after 5 retries with a console warning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BASE64 HELPER (src/utils.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Implement arrayBufferToBase64(buffer: ArrayBuffer): string using only 
Uint8Array and String.fromCharCode — no Buffer, no btoa with large strings 
(btoa fails on binary data with high bytes on WebKit). Process in 8192-byte 
chunks to avoid call stack overflow on large files.

Also implement md5Checksum(content: string): string using a pure-JS MD5 
implementation (inline it or use the 'blueimp-md5' package — both are 
WebKit-safe). Do NOT use Node.js crypto module.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATUS BAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add this.addStatusBarItem() showing:
- "☁ Synced"     — idle, all good
- "↑↓ Syncing…"  — operation in progress
- "✗ Sync error" — last op failed (tap/click opens Notice with detail)
- "⏸ Sync off"   — syncEnabled is false
- "↻ Reconnecting" — Realtime channel dropped, attempting reconnect

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD CONSTRAINTS (violation = broken on some platform)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER use:
  - require('fs'), require('path'), require('crypto'), require('os')
    — not available in iOS WebKit
  - Buffer — not available in iOS WebKit; use Uint8Array instead
  - process.env or process.platform — use Platform from 'obsidian'
  - localStorage or sessionStorage — use this.loadData()/this.saveData()
  - XMLHttpRequest directly — use fetch() which works on all platforms
  - window.require — Electron-only; crashes on mobile
  - btoa() on arbitrary binary data — use the chunked arrayBufferToBase64 helper

ALWAYS use:
  - app.vault.adapter.read() / .write() / .readBinary() / .writeBinary()
    for all file I/O
  - this.plugin.registerEvent() for all vault listeners
  - this.plugin.registerDomEvent() for all DOM listeners
  - this.plugin.registerInterval() for all intervals
  - Platform from 'obsidian' for all platform detection
  - supabase.removeAllChannels() in onunload()

esbuild config:
  - Mark 'obsidian' as external
  - Bundle everything else including @supabase/supabase-js and blueimp-md5
  - target: ['es2018'] — required for iOS 15+ WebKit compatibility
    (do NOT use es2020+ features like optional chaining on index access,
     Array.at(), or Object.hasOwn() without a polyfill)
  - platform: 'browser' (not 'node')

tsconfig:
  - "target": "ES2018"
  - "moduleResolution": "bundler"
  - "lib": ["ES2018", "DOM"]   ← no "DOM.Iterable" — causes issues on some 
                                  mobile TypeScript targets

manifest.json:
  - minAppVersion: "1.4.0"
  - isDesktopOnly: false       ← must be false for mobile to load the plugin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELIVERABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. All source files fully implemented (not stubbed)
2. package.json with scripts: dev (watch), build (production), version
3. schema.sql with table definitions and setup instructions
4. README.md covering: installation, Supabase setup, settings reference,
   how to install on iOS (via iCloud vault or AnyFile), conflict resolution,
   mobile limitations (foreground-only sync), security warning for data.json
5. .gitignore excluding: main.js, node_modules, data.json

After writing all files, run:
  npm install
  npm run build

Fix all TypeScript and build errors until `npm run build` exits with code 0.
Then print a summary of every file created and the steps to install the 
plugin into an Obsidian vault for testing on both desktop and mobile.
