alter table public.client_submission_candidates
  add column if not exists interview_status text not null default 'not_requested',
  add column if not exists interview_scheduled_at timestamptz,
  add column if not exists interview_location text,
  add column if not exists interview_meeting_link text,
  add column if not exists interview_notes text,
  add column if not exists interview_completed_at timestamptz;

do $$ begin
  alter table public.client_submission_candidates
    add constraint client_submission_candidates_interview_status_check
    check (interview_status in ('not_requested','requested','scheduled','completed'));
exception when duplicate_object then null; end $$;

update public.client_submission_candidates
set interview_status = case
  when cv_decision = 'interview' and interview_completed_at is not null then 'completed'
  when cv_decision = 'interview' and interview_scheduled_at is not null then 'scheduled'
  when cv_decision = 'interview' then 'requested'
  else 'not_requested'
end;

create or replace function public.get_client_review(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'message', s.message,
    'expires_at', s.expires_at,
    'recruitment_clients', jsonb_build_object('company_name', rc.company_name),
    'jobs', jsonb_build_object('title', j.title, 'location', j.location),
    'client_submission_candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sc.id,
        'cv_decision', sc.cv_decision,
        'cv_comment', sc.cv_comment,
        'interview_status', sc.interview_status,
        'interview_scheduled_at', sc.interview_scheduled_at,
        'interview_location', sc.interview_location,
        'interview_meeting_link', sc.interview_meeting_link,
        'interview_notes', sc.interview_notes,
        'candidate_applications', jsonb_build_object('candidate_name', ca.candidate_name),
        'client_cvs', case when cv.id is null then null else jsonb_build_object(
          'candidate_name', cv.candidate_name,
          'recruiter_summary', cv.recruiter_summary,
          'professional_profile', cv.professional_profile,
          'skills', cv.skills,
          'qualifications', cv.qualifications,
          'experience', cv.experience,
          'projects', cv.projects,
          'additional_information', cv.additional_information
        ) end,
        'client_interview_feedback', coalesce((
          select jsonb_agg(to_jsonb(f) order by f.round_number)
          from public.client_interview_feedback f
          where f.submission_candidate_id = sc.id
        ), '[]'::jsonb)
      ) order by sc.created_at)
      from public.client_submission_candidates sc
      left join public.candidate_applications ca on ca.id = sc.application_id
      left join public.client_cvs cv on cv.id = sc.client_cv_id
      where sc.submission_id = s.id
    ), '[]'::jsonb)
  )
  from public.client_submissions s
  join public.recruitment_clients rc on rc.id = s.client_id
  join public.jobs j on j.id = s.job_id
  where s.review_token = p_token
    and s.status not in ('revoked','closed')
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

create or replace function public.submit_client_cv_review(p_token uuid, p_candidate_id uuid, p_decision text, p_comment text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_decision not in ('interview','hold','do_not_interview') then raise exception 'invalid decision'; end if;
  update public.client_submission_candidates sc
  set cv_decision=p_decision,
      cv_comment=p_comment,
      reviewed_at=now(),
      interview_status=case when p_decision='interview' then 'requested' else 'not_requested' end,
      interview_scheduled_at=case when p_decision='interview' then interview_scheduled_at else null end,
      interview_completed_at=case when p_decision='interview' then interview_completed_at else null end
  from public.client_submissions s
  where sc.id=p_candidate_id and sc.submission_id=s.id and s.review_token=p_token
    and s.status not in ('revoked','closed') and (s.expires_at is null or s.expires_at > now());
  return found;
end;
$$;

create or replace function public.submit_client_interview_feedback(p_token uuid, p_candidate_id uuid, p_interviewer text, p_interview_date timestamptz, p_technical_rating integer, p_experience_rating integer, p_communication_rating integer, p_team_fit_rating integer, p_overall_rating integer, p_strengths text, p_weaknesses text, p_salary_comments text, p_availability_comments text, p_general_comments text, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_round integer;
begin
  if p_outcome not in ('next_round','hold','reject','offer') then raise exception 'invalid outcome'; end if;
  if not exists(select 1 from public.client_submission_candidates sc join public.client_submissions s on s.id=sc.submission_id where sc.id=p_candidate_id and sc.cv_decision='interview' and sc.interview_status='completed' and s.review_token=p_token and s.status not in ('revoked','closed') and (s.expires_at is null or s.expires_at > now())) then return false; end if;
  select coalesce(max(round_number),0)+1 into v_round from public.client_interview_feedback where submission_candidate_id=p_candidate_id;
  insert into public.client_interview_feedback(submission_candidate_id,round_number,interviewer,interview_date,technical_rating,experience_rating,communication_rating,team_fit_rating,overall_rating,strengths,weaknesses,salary_comments,availability_comments,general_comments,outcome,submitted_at)
  values(p_candidate_id,v_round,p_interviewer,p_interview_date,p_technical_rating,p_experience_rating,p_communication_rating,p_team_fit_rating,p_overall_rating,p_strengths,p_weaknesses,p_salary_comments,p_availability_comments,p_general_comments,p_outcome,now());
  return true;
end;
$$;