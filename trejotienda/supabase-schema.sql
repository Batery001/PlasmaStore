-- PlasmaStore (Vercel single-project) schema mínimo

-- Usuarios tienda (auth propia con cookie firmada)
create table if not exists public.store_users (
  id bigserial primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('customer','admin')),
  pass_hash text not null,
  created_at timestamptz not null default now()
);

-- Productos (catálogo)
create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  description text not null default '',
  price_cents int not null default 0,
  stock int not null default 0,
  image_url text null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Widgets (p.ej. carrusel)
create table if not exists public.store_widgets (
  widget_id text primary key,
  config_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Standings: snapshots de .tdf subidos
create table if not exists public.standings_snapshots (
  id bigserial primary key,
  file_name text not null,
  mtime_ms bigint not null,
  effective_date date not null,
  parse_error text null,
  payload jsonb null,
  has_finished_standings boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists standings_snapshots_effective_date_idx
  on public.standings_snapshots (effective_date desc);

-- “pending” (última subida)
create table if not exists public.standings_pending (
  id int primary key,
  file_name text not null default '',
  mtime_ms bigint not null default 0,
  parse_error text null,
  payload jsonb null,
  updated_at timestamptz not null default now()
);

insert into public.standings_pending (id)
values (1)
on conflict (id) do nothing;

-- Overrides de mazos (sprites/país/url) por jugador+cat+archivo
create table if not exists public.tournament_deck_overrides (
  k text primary key,
  entry jsonb not null,
  updated_at timestamptz not null default now()
);

