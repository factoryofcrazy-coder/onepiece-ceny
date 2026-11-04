-- Grand Line Tracker – hlásenia môžu posielať len prihlásení, čítať ich môže každý (4. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

revoke insert on public.feedback from anon;
revoke insert (kind, message, page, contact, user_agent) on public.feedback from anon;
drop policy if exists "feedback_insert" on public.feedback;
create policy "feedback_insert" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));

commit;
