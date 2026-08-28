alter table public.candidate_applications
  add column if not exists ai_rationale text,
  add column if not exists ai_model text,
  add column if not exists ai_scored_at timestamptz;

create index if not exists candidate_applications_job_score_idx
  on public.candidate_applications(job_id, match_score desc nulls last);
