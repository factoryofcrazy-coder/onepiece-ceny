-- Správca vidí pri nahlásení aj 5 správ pred nahlásenou a 5 po nej, nie zvyšok konverzácie.
-- Okolité správy sa berú zo živej konverzácie, po ich zmazaní ostane len kópia nahlásenej správy.
create or replace function public.dm_admin_reports(p_me uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.admins where user_id = p_me) then raise exception 'DM: Na toto nemáš oprávnenie.'; end if;
  return (
    select coalesce(jsonb_agg(r order by r.created_at), '[]'::jsonb) from (
      select d.id, d.created_at, d.message_id, d.conversation_id, d.sender_id, d.message_at, d.ciphertext, d.iv, d.key_version, d.reason,
             coalesce(s.username, 'Hráč') as sender_name, coalesce(t.username, 'Hráč') as reporter_name,
             (
               select coalesce(jsonb_agg(c order by c.created_at), '[]'::jsonb) from (
                 (
                   select x.id, x.conversation_id, x.sender_id, x.created_at, x.ciphertext, x.iv, x.key_version, coalesce(p.username, 'Hráč') as sender_name
                   from public.dm_messages x left join public.profiles p on p.id = x.sender_id
                   where x.conversation_id = d.conversation_id and x.created_at < d.message_at
                   order by x.created_at desc limit 5
                 )
                 union all
                 (
                   select x.id, x.conversation_id, x.sender_id, x.created_at, x.ciphertext, x.iv, x.key_version, coalesce(p.username, 'Hráč') as sender_name
                   from public.dm_messages x left join public.profiles p on p.id = x.sender_id
                   where x.conversation_id = d.conversation_id and x.created_at > d.message_at
                   order by x.created_at asc limit 5
                 )
               ) c
             ) as context
      from public.dm_reports d
      left join public.profiles s on s.id = d.sender_id
      left join public.profiles t on t.id = d.reporter
      where d.status = 'new'
      limit 100
    ) r
  );
end $$;
