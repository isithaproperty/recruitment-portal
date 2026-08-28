create table if not exists public.client_cvs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.candidate_applications(id) on delete cascade,
  candidate_name text not null,
  recruiter_summary text,
  professional_profile text,
  skills text,
  qualifications text,
  experience text,
  projects text,
  additional_information text,
  source_cv_path text not null,
  status text not null default 'draft',
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_cvs enable row level security;

drop policy if exists "recruiters can manage client cvs" on public.client_cvs;
create policy "recruiters can manage client cvs"
on public.client_cvs
for all
to authenticated
using (true)
with check (true);

create index if not exists candidate_applications_status_idx on public.candidate_applications(status);
create index if not exists client_cvs_status_idx on public.client_cvs(status);
