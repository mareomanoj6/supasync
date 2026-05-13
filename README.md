# SupaSync

Automatically synchronize your Obsidian vault with a Supabase backend in real-time across all platforms.

## Installation

1. Install the `supasync` plugin in your Obsidian vault.
2. Open the plugin settings.
3. Enter your **Supabase URL** and **Anon Key**.
4. Enable the **Sync Enabled** toggle.

## Supabase Setup

To enable synchronization, you must prepare your Supabase project:

1. **Database Schema**: Run the provided `schema.sql` in the Supabase SQL Editor to create the `files` and `tombstones` tables.
2. **Realtime**: Ensure that the `files` and `tombstones` tables are added to the `supabase_realtime` publication (included in `schema.sql`).
3. **Storage**: Create a public storage bucket named `vault-attachments` to handle binary files (images, PDFs, etc.).

## Settings Reference

- **Supabase URL**: Your project's API URL.
- **Anon Key**: Your project's anonymous API key.
- **Sync Enabled**: Toggles the synchronization engine.
- **Exclude Patterns**: A comma-separated list of globs (e.g., `.obsidian/*,*.canvas`) to ignore.
- **Debounce Delay**: The amount of time (in ms) to wait after a local change before syncing to remote. Enforced $\ge 4000$ms on mobile.

## Platform Specifics

- **Desktop**: Full real-time sync.
- **Mobile (iOS/Android)**: 
  - Sync runs while the app is open.
  - Changes made on other devices are pulled when you open the app.
  - Increased debounce delay and smaller batch sizes to conserve battery and maintain UI responsiveness.
  - Uses `visibilitychange` for reconnection and incremental sync.

## Conflict Resolution

- **Newer wins**: The file with the most recent `updated_at` timestamp is kept.
- **Checksum mismatch**: If timestamps are identical but checksums differ, the remote version is kept, and the local version is renamed to `filename.conflict.md`.

## Security Warning

The `data.json` file in your plugin settings folder contains your Supabase API key in plain text. **Do not commit your `.obsidian` folder or `data.json` to public version control.**
