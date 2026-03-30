-- Run this in the Supabase SQL editor or via CLI migrations.

create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  snapshot_period text not null check (snapshot_period in ('daily', 'weekly')),
  overall_completion_pct numeric(9, 4) not null,
  cumulative_achieved_weightage numeric(9, 4) not null,
  label text,
  task_count int,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_progress_snapshots_created
  on public.progress_snapshots (created_at desc);

alter table public.progress_snapshots enable row level security;

-- Demo: allow anonymous read/write when using the anon key.
-- Replace with authenticated policies before production.
create policy "progress_snapshots_select_anon"
  on public.progress_snapshots for select
  using (true);

create policy "progress_snapshots_insert_anon"
  on public.progress_snapshots for insert
  with check (true);
