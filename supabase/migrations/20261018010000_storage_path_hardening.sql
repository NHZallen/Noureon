-- The rules of the people's buckets look only at the first folder of a name (the person's id). A name with a `.` or `..` part
-- (`<own id>/../<other id>/<file>`) has the right first folder too: Storage keeps names as they are, so it is not a way into another
-- person's folder today, but the rules should not depend on that. Names with such a part, an empty part or a leading `/` are refused.
-- Security audit of 2026-10-18, L-2. `alter policy` keeps each rule's command and roles and only changes its conditions.

set lock_timeout = '5s';

alter policy "Users read their own assets" on storage.objects
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users upload their own assets" on storage.objects
with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users update their own assets" on storage.objects
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)')
with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users delete their own assets" on storage.objects
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users read their own skill bundles" on storage.objects
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users upload their own skill bundles" on storage.objects
with check (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users update their own skill bundles" on storage.objects
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)')
with check (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');

alter policy "Users delete their own skill bundles" on storage.objects
using (bucket_id = 'user-skill-bundles' and (storage.foldername(name))[1] = (select auth.uid())::text and name !~ '(^|/)(\.{1,2})?(/|$)');
