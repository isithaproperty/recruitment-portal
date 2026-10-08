alter table public.client_submission_candidates
  add column if not exists interview_availability jsonb;

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
        'interview_availability', sc.interview_availability,
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


create or replace function public.submit_client_interview_availability(
  p_token uuid, p_candidate_id uuid, p_round integer, p_availability jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_candidate public.client_submission_candidates;
  v_slot jsonb;
  v_zone text;
  v_date date;
  v_local_today date;
begin
  -- The private review token is the client authorization boundary.
  select sc.* into v_candidate
  from public.client_submission_candidates sc
  join public.client_submissions s on s.id=sc.submission_id
  where sc.id=p_candidate_id and s.review_token=p_token
    and s.status not in ('revoked','closed')
    and (s.expires_at is null or s.expires_at>now())
  for update of sc;
  if not found then return false; end if;
  if v_candidate.current_round <> p_round
    or v_candidate.interview_status not in ('not_requested','requested')
    or v_candidate.cv_decision='do_not_interview' then return false; end if;
  if p_availability is null or jsonb_typeof(p_availability)<>'object'
    or (p_availability->>'round')::integer is distinct from p_round
    or jsonb_typeof(p_availability->'slots') is distinct from 'array'
  then raise exception 'Invalid availability'; end if;
  if jsonb_array_length(p_availability->'slots') not between 1 and 20
    then raise exception 'Choose between 1 and 20 options'; end if;
  v_zone=p_availability->>'timezone';
  if v_zone is null or not exists(select 1 from pg_timezone_names where name=v_zone)
    then raise exception 'Invalid timezone'; end if;
  v_local_today=(now() at time zone v_zone)::date;
  for v_slot in select value from jsonb_array_elements(p_availability->'slots') loop
    if jsonb_typeof(v_slot)<>'object'
      or coalesce(v_slot->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_slot->>'period','') not in ('AM','PM','time')
      then raise exception 'Invalid date or period'; end if;
    v_date=(v_slot->>'date')::date;
    if v_date<v_local_today then raise exception 'Choose current or future dates'; end if;
    if v_slot->>'period'='time' then
      if coalesce(v_slot->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then raise exception 'Invalid time'; end if;
      if (v_date+(v_slot->>'time')::time) at time zone v_zone <= now()
        then raise exception 'Choose a future time'; end if;
    end if;
  end loop;
  update public.client_submission_candidates
  set interview_availability=jsonb_build_object('round',p_round,'timezone',v_zone,'slots',p_availability->'slots'),
      cv_decision='interview',interview_status='requested',reviewed_at=now()
  where id=p_candidate_id;
  return true;
end;
$$;
revoke all on function public.submit_client_interview_availability(uuid,uuid,integer,jsonb) from public;
grant execute on function public.submit_client_interview_availability(uuid,uuid,integer,jsonb) to anon, authenticated;
