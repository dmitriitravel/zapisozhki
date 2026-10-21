-- Облачная синхронизация MemoCards.
--
-- Модель: устройство хранит данные локально (IndexedDB) и обменивается изменениями
-- с этими таблицами через RPC sync_push / sync_pull. Конфликты решаются по правилу
-- «последняя запись побеждает» (updated_at — время на устройстве, мс). Удаления хранятся
-- как tombstone (deleted_at), чтобы другие устройства узнали об удалении.
-- Пользователь = Telegram-аккаунт; учётная запись Supabase Auth создаётся Edge Function
-- telegram-auth после проверки подписи initData.

-- ---------------------------------------------------------------------------
-- Профиль пользователя (Telegram-данные + настройки приложения)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  first_name text not null default '',
  last_name text not null default '',
  username text not null default '',
  photo_url text not null default '',
  -- Настройки приложения (AppSettings) и время их изменения на устройстве, мс.
  settings jsonb not null default '{}'::jsonb,
  settings_updated_at bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Профиль пользователя Telegram и его настройки MemoCards';

-- ---------------------------------------------------------------------------
-- Колоды
-- ---------------------------------------------------------------------------
create table public.decks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  description text not null default '',
  emoji text not null default '📚',
  is_active boolean not null default true,
  library_id text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index decks_synced_at_idx on public.decks (user_id, synced_at);

-- ---------------------------------------------------------------------------
-- Карточки
-- ---------------------------------------------------------------------------
create table public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  deck_id text not null,
  question text not null default '',
  answer text not null default '',
  -- Идентификатор полноразмерного изображения в бакете card-images (<user_id>/<image_id>).
  image_id text,
  thumbnail_data_url text,
  scheduling jsonb not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

create index cards_deck_idx on public.cards (user_id, deck_id);
create index cards_synced_at_idx on public.cards (user_id, synced_at);

-- ---------------------------------------------------------------------------
-- Журнал ответов
-- ---------------------------------------------------------------------------
create table public.review_log (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  card_id text not null,
  deck_id text not null,
  grade text not null,
  reviewed_at bigint not null,
  state_before text not null,
  state_after text not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);

create index review_log_card_idx on public.review_log (user_id, card_id);
create index review_log_synced_at_idx on public.review_log (user_id, synced_at);

-- ---------------------------------------------------------------------------
-- synced_at проставляется сервером при каждой записи — по нему устройства
-- запрашивают изменения «с прошлого раза».
-- ---------------------------------------------------------------------------
create or replace function public.set_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

create trigger decks_set_synced_at
  before insert or update on public.decks
  for each row execute function public.set_synced_at();

create trigger cards_set_synced_at
  before insert or update on public.cards
  for each row execute function public.set_synced_at();

create trigger review_log_set_synced_at
  before insert or update on public.review_log
  for each row execute function public.set_synced_at();

-- ---------------------------------------------------------------------------
-- RLS: каждый видит и меняет только свои строки.
-- Профили создаёт Edge Function сервисным ключом, клиенту доступно только чтение
-- и обновление собственного профиля.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_log enable row level security;

create policy "profiles: owner can select"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "decks: owner has full access"
  on public.decks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cards: owner has full access"
  on public.cards for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "review_log: owner has full access"
  on public.review_log for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- sync_pull(since): изменения пользователя с момента since (мс, серверное время).
-- Возвращает и tombstone-строки, чтобы устройство удалило их локально.
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull(since bigint default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select case when since is null then null else to_timestamp(since / 1000.0) end as since_ts
  )
  select jsonb_build_object(
    'serverTime', (extract(epoch from now()) * 1000)::bigint,
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'title', d.title,
        'description', d.description,
        'emoji', d.emoji,
        'isActive', d.is_active,
        'libraryId', d.library_id,
        'createdAt', d.created_at,
        'updatedAt', d.updated_at,
        'deletedAt', d.deleted_at
      ) order by d.synced_at)
      from public.decks d, bounds b
      where d.user_id = (select auth.uid())
        and (b.since_ts is null or d.synced_at > b.since_ts)
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'deckId', c.deck_id,
        'question', c.question,
        'answer', c.answer,
        'imageId', c.image_id,
        'thumbnailDataUrl', c.thumbnail_data_url,
        'scheduling', c.scheduling,
        'createdAt', c.created_at,
        'updatedAt', c.updated_at,
        'deletedAt', c.deleted_at
      ) order by c.synced_at)
      from public.cards c, bounds b
      where c.user_id = (select auth.uid())
        and (b.since_ts is null or c.synced_at > b.since_ts)
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'cardId', r.card_id,
        'deckId', r.deck_id,
        'grade', r.grade,
        'reviewedAt', r.reviewed_at,
        'stateBefore', r.state_before,
        'stateAfter', r.state_after
      ) order by r.synced_at)
      from public.review_log r, bounds b
      where r.user_id = (select auth.uid())
        and (b.since_ts is null or r.synced_at > b.since_ts)
    ), '[]'::jsonb),
    'settings', (
      select jsonb_build_object('value', p.settings, 'updatedAt', p.settings_updated_at)
      from public.profiles p
      where p.user_id = (select auth.uid())
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- sync_push(payload): применяет пакет изменений с устройства.
-- {
--   replaceAll?: boolean,                       -- сначала удалить все данные пользователя
--   deletedDecks?: [{ id, deletedAt }],
--   deletedCards?: [{ id, deletedAt }],
--   clearedReviewCardIds?: [id],                -- сброс прогресса карточки
--   decks?: [Deck], cards?: [Card], reviews?: [ReviewLogEntry],
--   settings?: { value: AppSettings, updatedAt }
-- }
-- Порядок: очистка → tombstone → колоды → карточки → журнал → настройки.
-- ---------------------------------------------------------------------------
create or replace function public.sync_push(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deleted_decks jsonb := coalesce(payload->'deletedDecks', '[]'::jsonb);
  deleted_cards jsonb := coalesce(payload->'deletedCards', '[]'::jsonb);
  cleared_cards jsonb := coalesce(payload->'clearedReviewCardIds', '[]'::jsonb);
begin
  if uid is null then
    raise exception 'sync_push: требуется авторизация' using errcode = '42501';
  end if;

  if coalesce((payload->>'replaceAll')::boolean, false) then
    delete from public.review_log where user_id = uid;
    delete from public.cards where user_id = uid;
    delete from public.decks where user_id = uid;
  end if;

  -- Tombstone для колод и их карточек.
  update public.decks d
     set deleted_at = x.deleted_at,
         updated_at = greatest(d.updated_at, x.deleted_at)
    from (
      select e->>'id' as id, (e->>'deletedAt')::bigint as deleted_at
      from jsonb_array_elements(deleted_decks) e
    ) x
   where d.user_id = uid and d.id = x.id and d.deleted_at is null;

  update public.cards c
     set deleted_at = x.deleted_at,
         updated_at = greatest(c.updated_at, x.deleted_at)
    from (
      select e->>'id' as id, (e->>'deletedAt')::bigint as deleted_at
      from jsonb_array_elements(deleted_decks) e
    ) x
   where c.user_id = uid and c.deck_id = x.id and c.deleted_at is null;

  -- Tombstone для отдельных карточек.
  update public.cards c
     set deleted_at = x.deleted_at,
         updated_at = greatest(c.updated_at, x.deleted_at)
    from (
      select e->>'id' as id, (e->>'deletedAt')::bigint as deleted_at
      from jsonb_array_elements(deleted_cards) e
    ) x
   where c.user_id = uid and c.id = x.id and c.deleted_at is null;

  -- Колоды: вставка или обновление, если версия с устройства не старше серверной.
  insert into public.decks (
    user_id, id, title, description, emoji, is_active, library_id, created_at, updated_at, deleted_at
  )
  select uid,
         e->>'id',
         coalesce(e->>'title', ''),
         coalesce(e->>'description', ''),
         coalesce(e->>'emoji', '📚'),
         coalesce((e->>'isActive')::boolean, true),
         e->>'libraryId',
         (e->>'createdAt')::bigint,
         (e->>'updatedAt')::bigint,
         null
    from jsonb_array_elements(coalesce(payload->'decks', '[]'::jsonb)) e
  on conflict (user_id, id) do update
     set title = excluded.title,
         description = excluded.description,
         emoji = excluded.emoji,
         is_active = excluded.is_active,
         library_id = excluded.library_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = null
   where (public.decks.deleted_at is null and public.decks.updated_at <= excluded.updated_at)
      or (public.decks.deleted_at is not null and public.decks.updated_at < excluded.updated_at);

  -- Карточки (только для существующих колод).
  insert into public.cards (
    user_id, id, deck_id, question, answer, image_id, thumbnail_data_url,
    scheduling, created_at, updated_at, deleted_at
  )
  select uid,
         e->>'id',
         e->>'deckId',
         coalesce(e->>'question', ''),
         coalesce(e->>'answer', ''),
         e->>'imageId',
         e->>'thumbnailDataUrl',
         coalesce(e->'scheduling', '{}'::jsonb),
         (e->>'createdAt')::bigint,
         (e->>'updatedAt')::bigint,
         null
    from jsonb_array_elements(coalesce(payload->'cards', '[]'::jsonb)) e
   where exists (
     select 1 from public.decks d where d.user_id = uid and d.id = e->>'deckId'
   )
  on conflict (user_id, id) do update
     set deck_id = excluded.deck_id,
         question = excluded.question,
         answer = excluded.answer,
         image_id = excluded.image_id,
         thumbnail_data_url = excluded.thumbnail_data_url,
         scheduling = excluded.scheduling,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = null
   where (public.cards.deleted_at is null and public.cards.updated_at <= excluded.updated_at)
      or (public.cards.deleted_at is not null and public.cards.updated_at < excluded.updated_at);

  -- Журнал: удаляем записи удалённых/сброшенных карточек, добавляем новые.
  delete from public.review_log r
   where r.user_id = uid
     and (
       r.card_id in (select e->>'id' from jsonb_array_elements(deleted_cards) e)
       or r.deck_id in (select e->>'id' from jsonb_array_elements(deleted_decks) e)
       or r.card_id in (select jsonb_array_elements_text(cleared_cards))
     );

  insert into public.review_log (
    user_id, id, card_id, deck_id, grade, reviewed_at, state_before, state_after
  )
  select uid,
         e->>'id',
         e->>'cardId',
         e->>'deckId',
         e->>'grade',
         (e->>'reviewedAt')::bigint,
         e->>'stateBefore',
         e->>'stateAfter'
    from jsonb_array_elements(coalesce(payload->'reviews', '[]'::jsonb)) e
   where exists (
     select 1 from public.cards c where c.user_id = uid and c.id = e->>'cardId'
   )
  on conflict (user_id, id) do nothing;

  -- Настройки: тоже «последняя запись побеждает».
  if payload ? 'settings' then
    update public.profiles p
       set settings = coalesce(payload->'settings'->'value', '{}'::jsonb),
           settings_updated_at = coalesce((payload->'settings'->>'updatedAt')::bigint, 0),
           updated_at = now()
     where p.user_id = uid
       and p.settings_updated_at <= coalesce((payload->'settings'->>'updatedAt')::bigint, 0);
  end if;

  return jsonb_build_object('serverTime', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

revoke execute on function public.sync_pull(bigint) from public, anon;
revoke execute on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_pull(bigint) to authenticated;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Хранилище изображений карточек: приватный бакет, путь <user_id>/<image_id>.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images',
  'card-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "card-images: owner can select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "card-images: owner can insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "card-images: owner can update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "card-images: owner can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
