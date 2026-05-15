# Handoff: SupaSync Obsidian-Supabase Synchronization

**Generated**: 2026-05-14
**Branch**: master
**Status**: In Progress

## Goal

Automatically synchronize an Obsidian vault with a Supabase backend in real-time across all platforms, including support for binary files and secure multi-user access via Row Level Security (RLS).

## Completed

- [x] **Supabase Integration**: Full client wrapper in `src/supabase.ts` for database and storage operations.
- [x] **Authentication**: OAuth2 flow implemented with session persistence and refresh logic.
- [x] **Sync Engine**: 
  - Initial reconciliation of local and remote state.
  - Real-time sync using Supabase Postgres changes.
  - Local file system listeners for immediate uploads.
  - Incremental sync for mobile app resumes.
- [x] **Binary File Support**: Private storage bucket integration with signed URLs for secure access.
- [x] **Conflict Resolution**: "Newer wins" strategy with local conflict backups (`.conflict.md`).
- [x] **Mobile Optimizations**: Increased debounce delays and `visibilitychange` listeners for reconnection.
- [x] **Security**: Database schema with RLS policies ensuring users only access their own data.
- [x] **Exclusion Logic**: Glob-based patterns to ignore specific files (e.g., `.obsidian/*`).

## Not Yet Done

- [ ] **Full Test Suite Execution**: The comprehensive checklist in `test.md` needs to be fully verified across Desktop and Mobile.
- [ ] **Performance Tuning**: Fine-tune batch sizes in `PlatformHelper` for various device types.
- [ ] **Error Recovery**: Enhance the `OfflineQueue` implementation to handle complex network failure scenarios.

## Failed Approaches (Don't Repeat These)

None recorded in this session. The current architecture uses a "tombstone" system for deletions and `updated_at` timestamps for versioning, which is the validated approach for this implementation.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Tombstones Table** | Ensures deletions are propagated to all devices rather than just disappearing from the remote. |
| **Private Storage Bucket** | Keeps binary attachments secure; signed URLs provide temporary access without making the bucket public. |
| **Signed URLs (1hr)** | Balances security with performance, avoiding the need to re-generate URLs for every single read. |
| **RLS (Row Level Security)** | Pushes authorization to the database level, preventing unauthorized data access even if the API key is leaked. |
| **Incremental Sync** | Uses `updated_at > since` query to avoid full reconciliation on mobile app wake-up. |

## Current State

**Working**: 
- Plugin initialization and settings management.
- OAuth login and session refresh.
- Local $\rightarrow$ Remote sync (text and binary).
- Remote $\rightarrow$ Local sync via Realtime.
- Conflict detection and handling.

**Broken**: 
- No known critical bugs, but full verification against `test.md` is pending.

**Uncommitted Changes**: 
- Significant updates to `src/supabase.ts` (Auth and Storage).
- Updates to `src/settings.ts` (Auth settings and UI).
- `schema.sql` updated for RLS and Auth support.
- `test.md` expanded into a full testing guide.

## Files to Know

| File | Why It Matters |
|------|----------------|
| `src/sync-engine.ts` | Primary logic for reconciliation, listeners, and conflict resolution. |
| `src/supabase.ts` | Wrapper for `@supabase/supabase-js` including Auth and Storage. |
| `src/main.ts` | Plugin lifecycle and session management. |
| `src/settings.ts` | Configuration and Settings Tab UI. |
| `schema.sql` | The required database schema and RLS policies. |
| `test.md` | The definitive checklist for verifying the plugin. |

## Code Context

**Key Interfaces**

```typescript
// Plugin Settings
interface PluginSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  deviceId: string;
  syncEnabled: boolean;
  excludePatterns: string;
  debounceMs: number;
  session?: any;
}

// SyncEngine Core Flow
async start() {
  await this.initialReconciliation();
  await this.setupRealtimeListener();
  await this.setupLocalListener();
  await this.queue.flush();
}
```

**Binary Storage Format**
The `files` table stores binary references as:
`content = "STORAGE:filename_timestamp"`

## Resume Instructions

1. **Database Setup**:
   - Run `schema.sql` in the Supabase SQL Editor.
   - Create a **Private** storage bucket named `vault-attachments`.
   - Enable Realtime publications for `files` and `tombstones` tables.
2. **Plugin Configuration**:
   - Install plugin and enter `Supabase URL` and `Anon Key`.
   - Use "Login with OAuth" to authenticate.
3. **Verification**:
   - Follow the steps in `test.md` sequentially.
   - First, verify "Connectivity & Setup" $\rightarrow$ "Basic Sync" $\rightarrow$ "Remote Sync".
   - Then, test "Edge Cases" (Exclude patterns, Conflict resolution).
   - Finally, test "Mobile Performance" and "Reconnection Logic" using a mobile device or emulator.
4. **Expected Outcome**: 
   - Changes on one device appear on another within seconds (Desktop) or upon app resume (Mobile).
   - Deletions are propagated via tombstones.
   - Binary files upload and download correctly via signed URLs.

## Setup Required

- **Supabase Account**: Project with Auth and Storage enabled.
- **Obsidian App**: Installed on at least two devices for sync testing.
- **Network**: Access to `localhost:3000/callback` for OAuth redirection during development.

## Edge Cases & Error Handling

- **Network Interruption**: Handled by `OfflineQueue` (pending items are flushed on reconnection).
- **App Suspension (iOS)**: Handled by `visibilitychange` event triggering an incremental sync.
- **Checksum Mismatch**: If `updated_at` matches but checksums differ, the remote version wins and local is backed up to `.conflict.md`.
- **Invalid Session**: Caught during `onload` and `refreshSession`, resulting in `session = null` and a request to re-authenticate.

## Warnings

- **API Key Security**: The `data.json` file in the Obsidian plugin folder contains the `supabaseAnonKey` and session tokens. This file must never be committed to version control.
- **Storage Bucket**: The bucket `vault-attachments` MUST be set to Private. If set to Public, RLS on the bucket will be bypassed.
