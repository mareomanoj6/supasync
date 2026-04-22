# Supasync: Power Your Obsidian Sync with Supabase

**Own your data. Sync everywhere. Zero compromise.**

Supasync brings professional-grade synchronization to your Obsidian vault by leveraging the power of **Supabase**. Instead of relying on a third-party centralized service, Supasync lets you use your own Supabase project, ensuring that *you* are the only one who owns and controls your notes.

---

## Key Features

- **True Cross-Platform Sync**: Seamlessly synchronize your knowledge base across Windows, macOS, Linux, Android, and iOS.
- **Sovereign Data Ownership**: No middleman. Connect directly to your own Supabase project. Your data stays in your control.
- **Smart Conflict Resolution**: Uses high-precision SHA-256 hashing to detect changes. When conflicts occur, Supasync preserves both versions by saving the remote copy to a dedicated conflict folder—no data is ever overwritten without your knowledge.
- **Set-and-Forget Auto-Sync**: Customizable automatic push intervals keep your cloud backup perfectly in sync with your local thoughts.
- **Device-Aware Architecture**: Unique device identification ensures organized sync paths and prevents collision between different hardware.

---

## Quick Start

### 1. Installation
- Install **Supasync** via the Obsidian Community Plugins browser.
- Open the plugin settings.

### 2. Configuration
Enter your credentials from your Supabase dashboard:
- **Project URL**: Your unique Supabase project endpoint.
- **Anon Key**: Your project's public API key.
- **Bucket Name**: The name of your designated Storage bucket.

### 3. Go Live
- Toggle **Auto Sync** to keep your vault updated automatically.
- Use the ribbon icons to manually **Push** or **Pull** your vault on demand.

---

## Technical Setup (Supabase)

To enable synchronization, your Supabase project requires a Storage bucket and a metadata table to track file versions.

### Storage Bucket
Create a public or private bucket in Supabase Storage (e.g., `vault`). Ensure your RLS policies allow the `anon` key to upload and download files.

### Metadata Table
Run this snippet in your **Supabase SQL Editor** to create the tracking system:

```sql
-- Create the core metadata table
create table vault_files (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null,
  file_path     text not null,
  file_hash     text not null,
  last_modified bigint not null,
  storage_path  text not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(device_id, file_path)
);

-- Enable Row Level Security (RLS)
alter table vault_files enable row level security;

-- Simple policies for initial setup (adjust for production security)
create policy "Allow anon read" on vault_files for select using (true);
create policy "Allow anon insert own" on vault_files for insert with check (true);
create policy "Allow anon update own" on vault_files for update using (true);
create policy "Allow anon delete own" on vault_files for delete using (true);
```

---

## License
Distributed under the MIT License. See `LICENSE` for more information.
