alter table if exists public.jobs add column if not exists public_slug text;
create unique index if not exists jobs_public_slug_key on public.jobs(public_slug) where public_slug is not null;

create table if not exists public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_name text not null,
  email text not null,
  phone text,
  location text,
  cv_path text not null,
  status text not null default 'applied',
  match_score numeric,
  strengths text,
  weaknesses text,
  recruiter_notes text,
  created_at timestamptz not null default now()
);

alter table public.candidate_applications enable row level security;

drop policy if exists "public can submit applications" on public.candidate_applications;
create policy "public can submit applications" on public.candidate_applications for insert to anon with check (
  exists (select 1 from public.jobs j where j.id = job_id and j.status = 'open')
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('candidate-cvs','candidate-cvs',false,10485760,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public can upload candidate cvs" on storage.objects;
create policy "public can upload candidate cvs" on storage.objects for insert to anon with check (bucket_id='candidate-cvs');
