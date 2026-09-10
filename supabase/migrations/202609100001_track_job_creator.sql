alter table public.jobs
  add column if not exists created_by uuid;

alter table public.jobs
  alter column created_by set default auth.uid();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_created_by_fkey'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end
$$;

create index if not exists jobs_created_by_idx on public.jobs(created_by);
