-- Target weightages keyed by full WBS path from PowerPlay exports
create table if not exists public.task_settings (
  full_path text primary key,
  target_weight_pct double precision not null check (target_weight_pct >= 0 and target_weight_pct <= 100),
  updated_at timestamptz not null default now()
);

alter table public.task_settings enable row level security;

-- Allow anon read/write when using anon key (tighten for production)
create policy "Allow all task_settings for anon"
  on public.task_settings
  for all
  using (true)
  with check (true);
