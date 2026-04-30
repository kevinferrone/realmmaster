-- ============================================
-- REALMMASTER — FULL SCHEMA WITH CAMPAIGN MEMORY
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- WORLDS: DM's world canon
create table worlds (
  id uuid primary key default gen_random_uuid(),
  dm_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  canon_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PLAYERS: each player the DM adds
create table players (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete cascade,
  dm_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  invite_token text unique default encode(gen_random_bytes(16), 'hex'),
  character_name text,
  character_class text,
  character_background text,
  character_knowledge text,       -- initial knowledge at campaign start
  character_sheet_text text,
  character_stats jsonb,
  created_at timestamptz default now()
);

-- MESSAGES: every chat turn
create table messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  world_id uuid references worlds(id) on delete cascade,
  session_id uuid,                -- groups messages into sessions
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- SESSIONS: tracks each play session
create table sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  world_id uuid references worlds(id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  summary text,                   -- AI-generated summary of this session
  summary_generated_at timestamptz,
  message_count int default 0
);

-- CHARACTER_KNOWLEDGE: running ledger of what each character knows
-- DM can add/edit, AI can auto-add after sessions
create table character_knowledge (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  world_id uuid references worlds(id) on delete cascade,
  category text not null,         -- 'location', 'npc', 'faction', 'event', 'secret', 'item', 'lore'
  title text not null,            -- short label e.g. "The Vault of Keth"
  content text not null,          -- what the character knows about this
  source text,                    -- 'dm_granted', 'auto_extracted', 'character_sheet'
  session_id uuid references sessions(id) on delete set null,
  granted_at timestamptz default now(),
  is_active boolean default true  -- DM can revoke/hide knowledge
);

-- DOCUMENT_FILES: metadata for uploaded files
create table document_files (
  id uuid primary key default gen_random_uuid(),
  world_id uuid references worlds(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  file_type text not null check (file_type in ('canon', 'character')),
  filename text not null,
  storage_path text not null,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table worlds enable row level security;
alter table players enable row level security;
alter table messages enable row level security;
alter table sessions enable row level security;
alter table character_knowledge enable row level security;
alter table document_files enable row level security;

-- DMs own their worlds
create policy "DMs own their worlds"
  on worlds for all using (dm_id = auth.uid());

-- DMs manage players in their worlds
create policy "DMs manage their players"
  on players for all using (dm_id = auth.uid());

-- Open read for players (filtered by token in API)
create policy "Open player reads"
  on players for select using (true);

create policy "Open player updates"
  on players for update using (true);

-- DMs read all messages in their worlds
create policy "DMs read messages"
  on messages for select
  using (world_id in (select id from worlds where dm_id = auth.uid()));

create policy "Service inserts messages"
  on messages for insert with check (true);

-- Sessions
create policy "DMs read sessions"
  on sessions for select
  using (world_id in (select id from worlds where dm_id = auth.uid()));

create policy "Service manages sessions"
  on sessions for all with check (true);

-- Character knowledge
create policy "DMs manage knowledge"
  on character_knowledge for all
  using (world_id in (select id from worlds where dm_id = auth.uid()));

create policy "Open knowledge reads"
  on character_knowledge for select using (true);

create policy "Service inserts knowledge"
  on character_knowledge for insert with check (true);

-- Document files
create policy "DMs manage files"
  on document_files for all
  using (world_id in (select id from worlds where dm_id = auth.uid()));

-- ============================================
-- STORAGE BUCKETS
-- ============================================

insert into storage.buckets (id, name, public)
values ('canon-docs', 'canon-docs', false)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('character-sheets', 'character-sheets', false)
on conflict do nothing;

create policy "Service manages canon"
  on storage.objects for all using (bucket_id = 'canon-docs');

create policy "Service manages sheets"
  on storage.objects for all using (bucket_id = 'character-sheets');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get player by invite token (no auth needed)
create or replace function get_player_by_token(token text)
returns setof players
language sql security definer
as $$
  select * from players where invite_token = token limit 1;
$$;

-- Get full memory context for a player (used by chat API)
create or replace function get_player_memory(p_player_id uuid)
returns table (
  session_summaries text,
  knowledge_entries jsonb
)
language sql security definer
as $$
  select
    coalesce(
      (select string_agg('Session ' || rn || ' — ' || summary, E'\n')
       from (
         select summary,
                row_number() over (order by started_at) as rn
         from sessions
         where player_id = p_player_id
           and summary is not null
           and summary != ''
       ) sub
      ), ''
    ) as session_summaries,
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'category', category,
           'title', title,
           'content', content
         ) order by granted_at
       )
       from character_knowledge
       where player_id = p_player_id
         and is_active = true
      ), '[]'::jsonb
    ) as knowledge_entries;
$$;
