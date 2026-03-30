-- Daily/weekly snapshots for S-curve (create if not already present in your project)
create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  snapshot_period text not null check (snapshot_period in ('daily', 'weekly')),
  overall_completion_pct double precision,
  cumulative_achieved_weightage double precision,
  label text,
  task_count integer
);

alter table public.progress_snapshots enable row level security;

create policy "Allow all progress_snapshots for anon"
  on public.progress_snapshots
  for all
  using (true)
  with check (true);
