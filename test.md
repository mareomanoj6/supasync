# SupaSync Testing Checklist

This guide provides a comprehensive set of test cases to verify the functionality and reliability of the SupaSync plugin across different environments.

## 📋 Prerequisites
- [ ] Supabase project created.
- [ ] `schema.sql` executed in Supabase SQL Editor.
- [ ] `vault-attachments` public storage bucket created.
- [ ] Realtime publications enabled for `files` and `tombstones` tables.
- [ ] Plugin installed and enabled in Obsidian.

---

## 💻 Desktop Testing (Windows/macOS/Linux)

### 1. Connectivity & Setup
- [ ] **Connection Test**: Click "Test Connection" in settings $\rightarrow$ Expect "Supabase connection successful!".
- [ ] **Invalid Key**: Enter a wrong key $\rightarrow$ Expect "Connection failed" notice.

### 2. Basic Sync (Local $\rightarrow$ Remote)
- [ ] **Create File**: Create a new `.md` note $\rightarrow$ Verify it appears in Supabase `files` table.
- [ ] **Modify File**: Edit a note $\rightarrow$ Verify the `content` and `updated_at` are updated in Supabase.
- [ ] **Delete File**: Delete a note $\rightarrow$ Verify a row is added to `tombstones` and removed from `files`.
- [ ] **Binary Upload**: Add an image/PDF $\rightarrow$ Verify it's uploaded to `vault-attachments` and the `files` table contains a `STORAGE:http...` link.

### 3. Remote Sync (Remote $\rightarrow$ Local)
- [ ] **Remote Create**: Manually insert a row into the `files` table in Supabase $\rightarrow$ Verify the file appears in Obsidian instantly.
- [ ] **Remote Edit**: Manually update `content` in Supabase $\rightarrow$ Verify the local note updates.
- [ ] **Remote Delete**: Manually insert a row into `tombstones` $\rightarrow$ Verify the local file is deleted.

### 4. Edge Cases & Robustness
- [ ] **Exclude Patterns**: Add `*.canvas` to exclude patterns $\rightarrow$ Create a canvas file $\rightarrow$ Verify it is NOT synced to Supabase.
- [ ] **Conflict Resolution**: 
    1. Edit a file on Laptop.
    2. Manually edit the same file in Supabase with a newer timestamp.
    3. Sync $\rightarrow$ Verify the remote version wins and the local version is saved as `filename.conflict.md`.
- [ ] **Offline Queue**: 
    1. Disable internet.
    2. Make 3-4 changes to notes.
    3. Re-enable internet $\rightarrow$ Verify all changes are flushed to Supabase.

---

## 📱 Mobile Testing (iOS/Android)

### 1. Mobile Performance
- [ ] **UI Responsiveness**: Create a large number of files (50+) $\rightarrow$ Verify the app doesn't freeze during the initial reconciliation (should be chunked).
- [ ] **Debounce**: Type rapidly in a note $\rightarrow$ Verify the sync only triggers after the 4000ms delay (to save battery).

### 2. Reconnection Logic (Crucial for iOS)
- [ ] **App Suspension**: 
    1. Open Obsidian.
    2. Switch to another app or lock the screen for 30 seconds.
    3. Return to Obsidian $\rightarrow$ Verify the status bar shows "Reconnecting" then "Synced".
- [ ] **Incremental Sync**: 
    1. While mobile app is closed, make a change to a file via the Supabase dashboard.
    2. Open the mobile app $\rightarrow$ Verify the change is pulled immediately upon resume.

### 3. Mobile File System
- [ ] **Binary Handling**: Add a photo $\rightarrow$ Verify the custom Base64 encoder works and the file is uploaded without crashing the WebKit context.

---

## 🛠️ Status Bar Verification
Verify the status bar updates correctly for these states:
- [ ] `☁ Synced` (Idle)
- [ ] `↑↓ Syncing...` (During a push/pull)
- [ ] `✗ Sync error` (Simulate a network failure)
- [ ] `⏸ Sync off` (Toggle "Sync Enabled" off in settings)
- [ ] `↻ Reconnecting` (During mobile app resume)
