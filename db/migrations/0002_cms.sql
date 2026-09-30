-- Phase 2: custom CMS tables (8 + versions). Leads/forms pipeline tables come in phase 5.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,                       -- sha256 of the cookie token
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  names jsonb not null default '{}'          -- {"ca":"","es":"","en":""}
);

create table media (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                  -- object key in S3
  mime text not null,
  alt jsonb not null default '{}',
  credit text not null default '',
  created_at timestamptz not null default now()
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('post', 'page')),
  theme text not null default '',
  category_id uuid references categories(id) on delete set null,
  author_id uuid references users(id) on delete set null,
  tags text[] not null default '{}',
  cover_media_id uuid references media(id) on delete set null,
  published_on date,
  created_at timestamptz not null default now()
);

create table entry_translations (
  entry_id uuid not null references entries(id) on delete cascade,
  locale text not null check (locale in ('ca', 'es', 'en')),
  title text not null default '',
  slug text not null,
  sections jsonb not null default '[]',
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  publish_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (entry_id, locale),
  unique (locale, slug)
);
create index entry_translations_status_idx on entry_translations(status, publish_at);

create table entry_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  locale text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index entry_versions_idx on entry_versions(entry_id, locale, created_at desc);

create table forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fields jsonb not null default '[]',
  destination text not null default 'crm_lead' check (destination in ('crm_lead', 'project', 'responses_only')),
  notifications jsonb not null default '{}',
  consent jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'
);
insert into settings (id) values (1);
