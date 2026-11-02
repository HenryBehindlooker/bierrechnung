-- Zirbenstube – gemeinsame Liste in Supabase
-- Einmal im Supabase-Dashboard unter „SQL Editor“ ausführen.
--
-- Die Tabelle ist für den öffentlichen Anon-Key gesperrt (RLS ohne Policies).
-- Zugriff gibt es nur über die beiden Funktionen und nur mit dem geheimen,
-- 32-stelligen Raumcode aus dem Einladungslink.

create table if not exists public.zirbenstube_rooms (
  code       text primary key check (length(code) >= 24),
  data       jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.zirbenstube_rooms enable row level security;
revoke all on public.zirbenstube_rooms from anon, authenticated;

-- Stand laden
create or replace function public.zs_get(p_code text)
returns table (data jsonb, version bigint)
language sql
security definer
set search_path = public
as $$
  select r.data, r.version from public.zirbenstube_rooms r where r.code = p_code;
$$;

-- Stand speichern, nur wenn sich die Version seit dem Laden nicht geändert hat.
-- p_version = 0 legt eine neue Liste an. Rückgabe: neue Version oder -1 bei Konflikt.
create or replace function public.zs_save(p_code text, p_data jsonb, p_version bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if length(p_code) < 24 then
    raise exception 'Raumcode zu kurz';
  end if;
  if pg_column_size(p_data) > 5000000 then
    raise exception 'Daten zu groß';
  end if;
  if p_version = 0 then
    insert into public.zirbenstube_rooms (code, data, version)
    values (p_code, p_data, 1)
    on conflict (code) do nothing;
    if found then
      return 1;
    end if;
    return -1;
  end if;
  update public.zirbenstube_rooms
     set data = p_data, version = version + 1, updated_at = now()
   where code = p_code and version = p_version
  returning version into v;
  return coalesce(v, -1);
end;
$$;

revoke all on function public.zs_get(text) from public;
revoke all on function public.zs_save(text, jsonb, bigint) from public;
grant execute on function public.zs_get(text) to anon, authenticated;
grant execute on function public.zs_save(text, jsonb, bigint) to anon, authenticated;
