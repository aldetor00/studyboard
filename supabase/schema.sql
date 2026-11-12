-- StudyBoard: schema Supabase
-- Esegui questo script UNA volta in Supabase > SQL Editor > New query > Run.

-- Tutti i dati dell'app (materie, attività, scadenze, sessioni, note, timer)
-- sono salvati come "item" generici: un id, un tipo (kind) e un JSON con i dati.
create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null,                     -- quando l'item è stato modificato sul dispositivo
  server_updated_at timestamptz not null default now(), -- quando il server l'ha ricevuto (serve per la sync)
  primary key (user_id, id)
);

create index if not exists items_user_server_updated_idx
  on public.items (user_id, server_updated_at);

-- Sicurezza: ogni utente vede e modifica solo i propri dati.
alter table public.items enable row level security;

drop policy if exists "items_own_rows" on public.items;
create policy "items_own_rows" on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vince la modifica più recente: se arriva una versione più vecchia di quella
-- già salvata (es. da un dispositivo rimasto offline), viene ignorata.
create or replace function public.items_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

-- ---------------------------------------------------------------------------
-- Materiali: file caricati dall'utente (PDF, appunti, immagini...).
-- Bucket privato; ogni utente può usare solo la propria cartella "<id utente>/...".
-- Limite per file: 50 MB (il massimo del piano gratuito di Supabase).
insert into storage.buckets (id, name, public, file_size_limit)
values ('materiali', 'materiali', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "materiali_select_own" on storage.objects;
create policy "materiali_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'materiali' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "materiali_insert_own" on storage.objects;
create policy "materiali_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materiali' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "materiali_update_own" on storage.objects;
create policy "materiali_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'materiali' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'materiali' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "materiali_delete_own" on storage.objects;
create policy "materiali_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materiali' and (storage.foldername(name))[1] = auth.uid()::text);
