drop policy if exists "recruiters can delete candidate cvs" on storage.objects;
create policy "recruiters can delete candidate cvs"
on storage.objects
for delete
to authenticated
using (bucket_id = 'candidate-cvs');

drop policy if exists "recruiters can delete applications" on public.candidate_applications;
create policy "recruiters can delete applications"
on public.candidate_applications
for delete
to authenticated
using (true);
