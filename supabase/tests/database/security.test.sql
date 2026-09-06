begin;
select plan(22);

select has_table('public', 'challenges', 'challenges table exists');
select has_table('public', 'participants', 'participants table exists');
select has_table('public', 'submissions', 'submissions table exists');
select has_table('public', 'audit_logs', 'audit log table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.challenges'::regclass), 'challenges has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.participants'::regclass), 'participants has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.submissions'::regclass), 'submissions has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.exemptions'::regclass), 'exemptions has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.excluded_dates'::regclass), 'excluded dates has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.penalty_rates'::regclass), 'penalty rates has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.notices'::regclass), 'notices has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit logs has RLS');

select ok(not has_table_privilege('anon', 'public.challenges', 'SELECT'), 'anon cannot read challenges');
select ok(not has_table_privilege('anon', 'public.participants', 'SELECT'), 'anon cannot read participants');
select ok(not has_table_privilege('anon', 'public.submissions', 'INSERT'), 'anon cannot insert submissions');
select ok(not has_table_privilege('authenticated', 'public.submissions', 'SELECT'), 'authenticated cannot read submissions');
select ok(not has_table_privilege('authenticated', 'public.submissions', 'UPDATE'), 'authenticated cannot update submissions');
select ok(not has_table_privilege('authenticated', 'public.submissions', 'DELETE'), 'authenticated cannot delete submissions');

select ok(has_table_privilege('service_role', 'public.submissions', 'SELECT'), 'service role can read submissions');
select ok(has_table_privilege('service_role', 'public.submissions', 'INSERT'), 'service role can insert submissions');
select ok(has_table_privilege('service_role', 'public.submissions', 'UPDATE'), 'service role can update submissions');
select ok(has_function_privilege('service_role', 'public.activate_challenge(bigint)', 'EXECUTE'), 'service role can activate challenge');

select * from finish();
rollback;
