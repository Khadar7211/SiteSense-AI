create table if not exists public.project_latest_state (
  project_id uuid primary key references public.projects (id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  source_filename text,
  leaves_json jsonb not null default '[]'::jsonb
);

alter table public.project_latest_state enable row level security;

create policy "project_latest_state all"
  on public.project_latest_state
  for all
  using (true)
  with check (true);
