-- ============================================================
-- ESSENSPLANER – Supabase Datenbank-Schema
-- ------------------------------------------------------------
-- SO WIRD ES EINGESPIELT:
--   1. Supabase Dashboard oeffnen (supabase.com -> dein Projekt)
--   2. Links im Menue: "SQL Editor"
--   3. "New query" -> diesen kompletten Text einfuegen
--   4. Button "Run" druecken
-- Dafuer brauchst du KEINE Keys an Dritte zu geben – du bist
-- in deinem eigenen Dashboard eingeloggt.
--
-- Datenmodell: pro Nutzer genau EINE Zeile je Tabelle. Die
-- eigentlichen Inhalte liegen als JSON in der Spalte "data".
-- Das haelt die Synchronisation einfach und robust.
-- ============================================================

-- ---------- PROFIL & EINSTELLUNGEN ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  settings        jsonb       not null default '{}'::jsonb,
  onboarding_done boolean     not null default false,
  updated_at      timestamptz not null default now()
);

-- ---------- REZEPTE ----------
create table if not exists public.recipes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- MAHLZEITENPLAN (14 Tage) ----------
create table if not exists public.meal_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- EINKAUFSLISTE ----------
create table if not exists public.grocery_items (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- VORRAT ----------
create table if not exists public.pantry_items (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Jeder Nutzer sieht und aendert AUSSCHLIESSLICH seine eigenen
-- Zeilen. Das ist es, was den oeffentlichen anon-Key sicher macht.
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.recipes       enable row level security;
alter table public.meal_plans    enable row level security;
alter table public.grocery_items enable row level security;
alter table public.pantry_items  enable row level security;

drop policy if exists "own_profile" on public.profiles;
create policy "own_profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own_recipes" on public.recipes;
create policy "own_recipes" on public.recipes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_meal_plans" on public.meal_plans;
create policy "own_meal_plans" on public.meal_plans
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_grocery_items" on public.grocery_items;
create policy "own_grocery_items" on public.grocery_items
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_pantry_items" on public.pantry_items;
create policy "own_pantry_items" on public.pantry_items
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- BERECHTIGUNGEN fuer angemeldete Nutzer
-- ============================================================
grant usage on schema public to authenticated;
grant all on public.profiles, public.recipes, public.meal_plans,
             public.grocery_items, public.pantry_items
  to authenticated;

-- ============================================================
-- AUTO-PROFIL: legt bei jeder Registrierung automatisch eine
-- profiles-Zeile an.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- FERTIG. Pruefen: Table Editor -> es sollten 5 Tabellen da sein,
-- alle mit gruenem "RLS enabled".
-- ============================================================
