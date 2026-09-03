create extension if not exists pgcrypto;

create table if not exists public.recruitment_clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.recruitment_clients(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text,
  message text,
  review_token uuid not null default gen_random_uuid() unique,
  status text not null default 'draft' check (status in ('draft','sent','reviewing','interviewing','completed','revoked')),
  sent_at timestamptz,
  expires_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_submission_candidates (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.client_submissions(id) on delete cascade,
  application_id uuid not null references public.candidate_applications(id) on delete cascade,
  client_cv_id uuid references public.client_cvs(id) on delete set null,
  cv_decision text not null default 'pending' check (cv_decision in ('pending','interview','hold','do_not_interview')),
  cv_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(submission_id, application_id)
);

create table if not exists public.client_interview_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_candidate_id uuid not null references public.client_submission_candidates(id) on delete cascade,
  round_number integer not null default 1 check (round_number > 0),
  interview_date timestamptz,
  interviewer text,
  technical_rating integer check (technical_rating between 1 and 5),
  experience_rating integer check (experience_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  team_fit_rating integer check (team_fit_rating between 1 and 5),
  overall_rating integer check (overall_rating between 1 and 5),
  strengths text,
  weaknesses text,
  salary_comments text,
  availability_comments text,
  general_comments text,
  outcome text check (outcome in ('next_round','hold','reject','offer')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_candidate_id, round_number)
);

alter table public.recruitment_clients enable row level security;
alter table public.client_submissions enable row level security;
alter table public.client_submission_candidates enable row level security;
alter table public.client_interview_feedback enable row level security;

revoke all on public.recruitment_clients from anon;
revoke all on public.client_submissions from anon;
revoke all on public.client_submission_candidates from anon;
revoke all on public.client_interview_feedback from anon;

grant select, insert, update, delete on public.recruitment_clients to authenticated;
grant select, insert, update, delete on public.client_submissions to authenticated;
grant select, insert, update, delete on public.client_submission_candidates to authenticated;
grant select, insert, update, delete on public.client_interview_feedback to authenticated;

create policy "staff manage recruitment clients" on public.recruitment_clients for all to authenticated using (true) with check (true);
create policy "staff manage client submissions" on public.client_submissions for all to authenticated using (true) with check (true);
create policy "staff manage submission candidates" on public.client_submission_candidates for all to authenticated using (true) with check (true);
create policy "staff manage interview feedback" on public.client_interview_feedback for all to authenticated using (true) with check (true);

create index if not exists client_submissions_client_idx on public.client_submissions(client_id);
create index if not exists client_submissions_job_idx on public.client_submissions(job_id);
create index if not exists client_submission_candidates_submission_idx on public.client_submission_candidates(submission_id);
create index if not exists client_interview_feedback_candidate_idx on public.client_interview_feedback(submission_candidate_id);
