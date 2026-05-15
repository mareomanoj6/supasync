# SupaSync Testing Checklist

This guide provides a comprehensive set of test cases to verify the functionality and reliability of the SupaSync plugin across different environments.

## 📋 Prerequisites
- [ ] Supabase project created.
- [ ] `schema.sql` executed in Supabase SQL Editor.
- [ ] `vault-attachments` **Private** storage bucket created.
- [ ] Realtime publications enabled for `files` and `tombstones` tables.
- [ ] Plugin installed and enabled in Obsidian.

---

## 🛠️ Supabase Setup (SQL Guide)

Run the following code in your **Supabase SQL Editor**:

```sql
-- 1. Create the Tables
create table if not exists files (
  path        text primary key,
  content     text,
  updated_at  timestamptz not null default now(),
  device_id   text,
  checksum    text,
  user_id     uuid references auth.users(id) default auth.uid()
);

create table if not exists tombstones (
  path        text primary key,
  deleted_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) default auth.uid()
);

-- 2. Enable Realtime for the tables
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table tombstones;

-- 3. Row Level Security (RLS)
alter table files enable row level security;
alter table tombstones enable row level security;

create policy "Users can access their own files"
on files for all
using (auth.uid() = user_id);

create policy "Users can access their own tombstones"
on tombstones for all
using (auth.uid() = user_id);
```

### Storage Bucket Setup
1. Go to **Storage** in the Supabase Dashboard.
2. Create a new bucket named `vault-attachments`.
3. Set the bucket to **Private**.

---

## 💻 Desktop Testing (Windows/macOS/Linux)

### 1. Connectivity & Setup
- [ ] **Connection Test**: Click "Test connection" in settings $\rightarrow$ Expect "Supabase connection successful!".
- [ ] **OAuth Login**: Click "Login with OAuth" $\rightarrow$ Login in browser $\rightarrow$ Paste code in "Verify login code" $\rightarrow$ Expect "Authentication successful!".

### 2. Basic Sync (Local $\rightarrow$ Remote)
- [ ] **Create File**: Create a new `.md` note $\rightarrow$ Verify it appears in Supabase `files` table.
- [ ] **Modify File**: Edit a note $\rightarrow$ Verify the `content` and `updated_at` are updated in Supabase.
- [ ] **Delete File**: Delete a note $\rightarrow$ Verify a row is added to `tombstones` and removed from `files`.
- [ ] **Binary Upload**: Add an image/PDF $\rightarrow$ Verify it's uploaded to `vault-attachments` and the `files` table contains a reference to the private file.

### 3. Remote Sync (Remote $\rightarrow$ Local)
- [ ] **Remote Create**: Manually insert a row into the `files` table in Supabase (with your `user_id`) $\rightarrow$ Verify the file appears in Obsidian instantly.
- [ ] **Remote Edit**: Manually update `content` in Supabase $\rightarrow$ Verify the local note updates.
- [ ] **Remote Delete**: Manually insert a row into `tombstones` (with your `user_id`) $\rightarrow$ Verify the local file is deleted.

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
- [ ] **UI Responsiveness**: Create a large number of files (50+) $\rightarrow$ Verify the app doesn't freeze during the initial reconciliation.
- [ ] **Debounce**: Type rapidly in a note $\rightarrow$ Verify the sync only triggers after the 4000ms delay.

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
- [ ] `↑↓ Syncing...` (Operation in progress)
- [ ] `✗ Sync error` (Simulate a network failure)
- [ ] `⏸ Sync off` (Toggle "Sync enabled" off in settings)
- [ ] `↻ Reconnecting` (During mobile app resume)
