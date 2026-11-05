-- Reakcie na správy (vlastné emoty). Text správ sa nemení. V súkromných správach je reakcia metadáto, nie je šifrovaná.

-- 1) Verejný chat: vidia prihlásení, každý pridáva a ruší len svoje.
create table if not exists public.chat_reactions (
  message_id bigint not null references public.chat_messages on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  emote text not null check (emote in ('kek', 'pog', 'rip', 'cope', 'beli', 'pull', 'salty', 'gg')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emote)
);
create index if not exists chat_reactions_user_idx on public.chat_reactions (user_id, created_at desc);
alter table public.chat_reactions enable row level security;
revoke all on public.chat_reactions from anon, authenticated;
grant select, delete on public.chat_reactions to authenticated;
grant insert (message_id, emote) on public.chat_reactions to authenticated;
drop policy if exists "chat_reactions_read" on public.chat_reactions;
create policy "chat_reactions_read" on public.chat_reactions for select to authenticated using (true);
drop policy if exists "chat_reactions_insert_own" on public.chat_reactions;
create policy "chat_reactions_insert_own" on public.chat_reactions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "chat_reactions_delete_own" on public.chat_reactions;
create policy "chat_reactions_delete_own" on public.chat_reactions for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.chat_reaction_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.chat_bans where user_id = new.user_id) then
    raise exception 'Máš zablokované písanie v chate.';
  end if;
  if not exists (select 1 from public.chat_messages where id = new.message_id and deleted_at is null) then
    raise exception 'Táto správa už neexistuje.';
  end if;
  if (select count(*) from public.chat_reactions where user_id = new.user_id and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Reaguješ priveľmi rýchlo. Počkaj chvíľu.';
  end if;
  return new;
end $$;
revoke execute on function public.chat_reaction_before_insert() from public, anon, authenticated;
drop trigger if exists chat_reaction_before_insert on public.chat_reactions;
create trigger chat_reaction_before_insert before insert on public.chat_reactions
  for each row execute function public.chat_reaction_before_insert();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reactions') then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end $$;

-- 2) Súkromné správy: prístup len cez funkciu dm (service_role), rovnako ako správy.
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  emote text not null check (emote in ('kek', 'pog', 'rip', 'cope', 'beli', 'pull', 'salty', 'gg')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emote)
);
create index if not exists dm_reactions_user_idx on public.dm_reactions (user_id, created_at desc);
-- poistka proti zasypaniu telefónu: pamätá si odoslané upozornenia aj po zrušení reakcie
create table if not exists public.dm_reaction_pushes (
  message_id uuid not null references public.dm_messages on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  emote text not null,
  conversation_id uuid not null references public.dm_conversations on delete cascade,
  pushed_at timestamptz not null default now(),
  primary key (message_id, user_id, emote)
);
create index if not exists dm_reaction_pushes_recent_idx on public.dm_reaction_pushes (user_id, conversation_id, pushed_at desc);
alter table public.dm_reactions enable row level security;
alter table public.dm_reaction_pushes enable row level security;
revoke all on public.dm_reactions, public.dm_reaction_pushes from anon, authenticated;
grant select, insert, delete on public.dm_reactions to service_role;
grant select, insert on public.dm_reaction_pushes to service_role;

create or replace function public.dm_react(p_me uuid, p_message uuid, p_emote text, p_on boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare m public.dm_messages; c public.dm_conversations; other uuid; n int; notify boolean := false;
begin
  select * into m from public.dm_messages where id = p_message;
  if not found or not exists (select 1 from public.dm_members where conversation_id = m.conversation_id and user_id = p_me) then
    raise exception 'DM: Správa sa nenašla.';
  end if;
  select * into c from public.dm_conversations where id = m.conversation_id;
  if c.status <> 'accepted' then raise exception 'DM: Reagovať môžeš, až keď je žiadosť prijatá.'; end if;
  other := case when c.user_a = p_me then c.user_b else c.user_a end;
  if p_on and public.dm_blocked_between(p_me, other) then raise exception 'DM: Tomuto hráčovi teraz nemôžeš reagovať.'; end if;
  if not p_on then
    delete from public.dm_reactions where message_id = p_message and user_id = p_me and emote = p_emote;
    get diagnostics n = row_count;
    return jsonb_build_object('changed', n > 0, 'notify', false, 'conversation_id', m.conversation_id, 'recipient', other);
  end if;
  if (select count(*) from public.dm_reactions where user_id = p_me and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'DM: Reaguješ priveľmi rýchlo. Počkaj chvíľu.';
  end if;
  insert into public.dm_reactions (message_id, user_id, emote) values (p_message, p_me, p_emote) on conflict do nothing;
  get diagnostics n = row_count;
  -- upozornenie: len na cudziu správu, tá istá reakcia najviac raz, od jedného hráča v konverzácii najviac raz za 30 s
  if n > 0 and m.sender_id = other
     and not exists (select 1 from public.dm_reaction_pushes where message_id = p_message and user_id = p_me and emote = p_emote)
     and not exists (select 1 from public.dm_reaction_pushes where user_id = p_me and conversation_id = m.conversation_id and pushed_at > now() - interval '30 seconds') then
    notify := true;
    insert into public.dm_reaction_pushes (message_id, user_id, emote, conversation_id) values (p_message, p_me, p_emote, m.conversation_id);
  end if;
  return jsonb_build_object('changed', n > 0, 'notify', notify, 'conversation_id', m.conversation_id, 'recipient', other);
end $$;
revoke execute on function public.dm_react(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.dm_react(uuid, uuid, text, boolean) to service_role;

create or replace function public.dm_history(p_me uuid, p_conv uuid, p_before timestamptz, p_limit int)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.dm_members where conversation_id = p_conv and user_id = p_me) then
    raise exception 'DM: Konverzácia sa nenašla.';
  end if;
  return (
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (
      select x.id, x.conversation_id, x.sender_id, x.created_at, x.ciphertext, x.iv, x.key_version,
        (select coalesce(jsonb_agg(jsonb_build_object('emote', e.emote, 'user_id', e.user_id)), '[]'::jsonb) from public.dm_reactions e where e.message_id = x.id) as reactions
      from public.dm_messages x
      where x.conversation_id = p_conv and (p_before is null or x.created_at < p_before)
      order by x.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) r
  );
end $$;
