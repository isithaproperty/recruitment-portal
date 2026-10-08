-- Private recruiter suggestions stay separate from approved client-facing comments.
-- Existing client review RPCs explicitly allowlist CV fields and exclude ai_comments.
alter table public.client_cvs
  add column if not exists ai_comments text not null default '';

comment on column public.client_cvs.ai_comments is
  'Private AI-generated comment suggestion; only approved recruiter_summary is client-facing.';
