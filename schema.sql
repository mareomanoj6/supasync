-- Supabase Sync Schema (Secure Version)
-- Run this in the Supabase SQL Editor

-- 1. Files Table
create table if not exists files (
  path        text primary key,
  content     text,
  updated_at  timestamptz not null default now(),
  device_id   text,
  checksum    text,
  user_id     uuid references auth.users(id) default auth.uid()
);

-- 2. Tombstones Table
create table if not exists tombstones (
  path        text primary key,
  deleted_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) default auth.uid()
);

-- 3. Enable Realtime
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table tombstones;

-- 4. Row Level Security (RLS)
-- Enable RLS on both tables
alter table files enable row level security;
alter table tombstones enable row level security;

-- Create policies: Users can only see and edit their own data
create policy "Users can access their own files"
on files for all
using (auth.uid() = user_id);

create policy "Users can access their own tombstones"
on tombstones for all
using (auth.uid() = user_id);

-- 5. Storage Bucket
-- The "vault-attachments" bucket must be created manually in the Supabase Dashboard.
-- IMPORTANT: Set the bucket to PRIVATE.
