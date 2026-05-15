# SupaSync

Automatically synchronize your Obsidian vault with a Supabase backend in real-time across all platforms.

## Installation

1. Install the `supasync` plugin in your Obsidian vault.
2. Open the plugin settings.
3. Enter your **Supabase URL** and **Anon Key**.
4. Follow the **Authentication** section below to secure your data.
5. Enable the **Sync Enabled** toggle.

## Supabase Setup

To enable synchronization, you must prepare your Supabase project:

1. **Database Schema**: Run the provided `schema.sql` in the Supabase SQL Editor. This sets up the `files` and `tombstones` tables and enables Row Level Security (RLS).
2. **Realtime**: Ensure that the `files` and `tombstones` tables are added to the `supabase_realtime` publication.
3. **Storage**: Create a **Private** storage bucket named `vault-attachments` for binary files.

## Authentication & Security

SupaSync uses Supabase Auth to ensure that your data is private and secure. 

1. In the plugin settings, click **Login with OAuth**.
2. Complete the login process in your browser.
3. Copy the authentication code provided on the redirect page.
4. Paste the code into the **Verify login code** field in the settings tab.

By authenticating, you activate **Row Level Security (RLS)**, meaning only you can access your vault's data on the Supabase backend.

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

The `data.json` file in your plugin settings folder contains your Supabase API key and session tokens. **Do not commit your `.obsidian` folder or `data.json` to public version control.**
