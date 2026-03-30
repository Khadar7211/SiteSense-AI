-- Reva / Construction MIS schema

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  unique (name)
);

-- Replace legacy task_settings (full_path) with project-scoped task_id weights
drop table if exists public.task_settings cascade;

create table public.task_settings (
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id text not null,
  target_weight_pct double precision not null
    check (target_weight_pct >= 0 and target_weight_pct <= 100),
  updated_at timestamptz not null default now(),
  primary key (project_id, task_id)
);

-- Snapshot per upload for S-curve
create table if not exists public.progress_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  total_completion_pct double precision not null,
  leaf_count integer,
  source text not null default 'upload'
);

alter table public.projects enable row level security;
alter table public.task_settings enable row level security;
alter table public.progress_logs enable row level security;

create policy "projects all" on public.projects for all using (true) with check (true);
create policy "task_settings all" on public.task_settings for all using (true) with check (true);
create policy "progress_logs all" on public.progress_logs for all using (true) with check (true);
