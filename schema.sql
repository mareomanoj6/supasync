-- Supabase Sync Schema
-- Run this in the Supabase SQL Editor

-- 1. Files Table
create table if not exists files (
  path        text primary key,
  content     text,
  updated_at  timestamptz not null default now(),
  device_id   text,
  checksum    text
);

-- 2. Tombstones Table (for deletions)
create table if not exists tombstones (
  path        text primary key,
  deleted_at  timestamptz not null default now()
);

-- 3. Enable Realtime
-- These must be executed separately if not already enabled
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table tombstones;

-- 4. Storage Bucket for Binaries
-- The "vault-attachments" bucket must be created manually in the Supabase Dashboard.
-- Set it to 'Public' if you want easy access to the public URLs.
