-- Grand Line Tracker – nahlásenie správy v chate, filter „Moje“ v Reporte, počet nových hlásení pre admina (4. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.feedback drop constraint if exists feedback_source_check;
alter table public.feedback add constraint feedback_source_check check (source in ('web', 'game', 'chat'));
alter table public.feedback add column if not exists chat_message_id bigint references public.chat_messages on delete set null;
create unique index if not exists feedback_chat_report_key on public.feedback (chat_message_id, user_id) where chat_message_id is not null;

-- nahlásená správa je úloha len pre admina: urážku neopakujeme na verejnej nástenke
create or replace function public.chat_report_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); m public.chat_messages;
begin
  if uid is null then raise exception 'Nie si prihlásený.'; end if;
  select * into m from public.chat_messages where id = p_id and deleted_at is null;
  if not found then raise exception 'Táto správa už neexistuje.'; end if;
  if m.user_id = uid then raise exception 'Vlastnú správu nahlásiť nemôžeš.'; end if;
  if exists (select 1 from public.feedback where chat_message_id = p_id and user_id = uid) then
    raise exception 'Túto správu si už nahlásil.';
  end if;
  insert into public.feedback (user_id, kind, message, page, source, hidden, chat_message_id)
  values (uid, 'other', left('Nahlásená správa v chate od ' || m.username || ': ' || m.body, 2000), 'Chat', 'chat', true, p_id);
end $$;
revoke execute on function public.chat_report_message(bigint) from public, anon;
grant execute on function public.chat_report_message(bigint) to authenticated;

-- autor uvidí, ktoré úlohy sú jeho, ostatní to nezistia
create or replace function public.feedback_my_ids()
returns setof bigint language sql stable security definer set search_path = '' as $$
  select id from public.feedback where user_id = auth.uid();
$$;
revoke execute on function public.feedback_my_ids() from public, anon;
grant execute on function public.feedback_my_ids() to authenticated;

-- odznak pre admina ráta aj skryté (napríklad nahlásené správy z chatu)
create or replace function public.feedback_new_count()
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Na toto nemáš oprávnenie.'; end if;
  return (select count(*) from public.feedback where status = 'new');
end $$;
revoke execute on function public.feedback_new_count() from public, anon;
grant execute on function public.feedback_new_count() to authenticated;

commit;
