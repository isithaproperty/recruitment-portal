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
        'current_round', sc.current_round,
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

create or replace function public.submit_client_interview_feedback(p_token uuid, p_candidate_id uuid, p_interviewer text, p_interview_date timestamptz, p_technical_rating integer, p_experience_rating integer, p_communication_rating integer, p_team_fit_rating integer, p_overall_rating integer, p_strengths text, p_weaknesses text, p_salary_comments text, p_availability_comments text, p_general_comments text, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round integer;
begin
  if p_outcome not in ('next_round','hold','reject','offer') then raise exception 'invalid outcome'; end if;

  select sc.current_round into v_round
  from public.client_submission_candidates sc
  join public.client_submissions s on s.id=sc.submission_id
  where sc.id=p_candidate_id
    and sc.cv_decision='interview'
    and sc.interview_status='scheduled'
    and s.review_token=p_token
    and s.status not in ('revoked','closed')
    and (s.expires_at is null or s.expires_at > now());

  if v_round is null then return false; end if;

  insert into public.client_interview_feedback(
    submission_candidate_id,round_number,interviewer,interview_date,
    technical_rating,experience_rating,communication_rating,team_fit_rating,overall_rating,
    strengths,weaknesses,salary_comments,availability_comments,general_comments,outcome,submitted_at
  ) values(
    p_candidate_id,v_round,p_interviewer,p_interview_date,
    p_technical_rating,p_experience_rating,p_communication_rating,p_team_fit_rating,p_overall_rating,
    p_strengths,p_weaknesses,p_salary_comments,p_availability_comments,p_general_comments,p_outcome,now()
  )
  on conflict (submission_candidate_id, round_number) do update set
    interviewer=excluded.interviewer,
    interview_date=excluded.interview_date,
    technical_rating=excluded.technical_rating,
    experience_rating=excluded.experience_rating,
    communication_rating=excluded.communication_rating,
    team_fit_rating=excluded.team_fit_rating,
    overall_rating=excluded.overall_rating,
    strengths=excluded.strengths,
    weaknesses=excluded.weaknesses,
    salary_comments=excluded.salary_comments,
    availability_comments=excluded.availability_comments,
    general_comments=excluded.general_comments,
    outcome=excluded.outcome,
    submitted_at=now();

  if p_outcome='next_round' then
    update public.client_submission_candidates
    set current_round=v_round+1,
        interview_status='requested',
        interview_scheduled_at=null,
        interview_location=null,
        interview_meeting_link=null,
        interview_notes=null,
        interview_completed_at=null
    where id=p_candidate_id;
  else
    update public.client_submission_candidates
    set interview_status='completed', interview_completed_at=now()
    where id=p_candidate_id;
  end if;

  return true;
end;
$$;

grant execute on function public.get_client_review(uuid) to anon, authenticated;
grant execute on function public.submit_client_interview_feedback(uuid,uuid,text,timestamptz,integer,integer,integer,integer,integer,text,text,text,text,text,text) to anon, authenticated;
