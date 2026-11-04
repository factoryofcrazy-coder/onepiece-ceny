-- Grand Line Tracker – upozornenie na Discord pri novom hlásení (4. 11. 2026)
-- Spustiť v Supabase: projekt onepiece-tracker → SQL Editor → vložiť celý súbor → Run.
-- Odkaz na webhook sa do tohto súboru NEPÍŠE (repo je verejné) – vloží sa samostatným príkazom v SQL Editore.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
revoke all on private.settings from public, anon, authenticated;

create or replace function public.feedback_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare url text; label text;
begin
  select value into url from private.settings where key = 'report_webhook';
  if url is null then return null; end if;
  label := case new.kind when 'bug' then 'Chyba' when 'idea' then 'Nápad' else 'Iné' end;
  -- allowed_mentions: text od používateľa nesmie vedieť označiť @everyone
  perform net.http_post(
    url := url,
    body := jsonb_build_object(
      'content', left('**Nové hlásenie (' || label || case when new.source = 'game' then ', z hry' else '' end || ')**' || chr(10) || new.message, 1800) || chr(10) || 'https://www.grand-line.eu/report',
      'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return null;
exception when others then
  return null; -- výpadok upozornenia nesmie zablokovať hlásenie
end $$;
revoke execute on function public.feedback_notify() from public, anon, authenticated;
drop trigger if exists feedback_notify on public.feedback;
create trigger feedback_notify after insert on public.feedback
  for each row execute function public.feedback_notify();

commit;
