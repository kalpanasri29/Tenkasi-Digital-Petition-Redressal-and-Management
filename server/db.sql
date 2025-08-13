create table if not exists submissions (
  id text primary key,
  type text not null check (type in ('complaint','petition')),
  name text not null,
  phone text not null,
  email text,
  department text,
  category text,
  taluk text not null,
  firka text not null,
  village text not null,
  description text not null,
  urgency text not null check (urgency in ('low','medium','high')),
  status text not null,
  photos jsonb default '[]'::jsonb,
  timestamp timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table if not exists officials (
  id serial primary key,
  username text unique not null,
  password text not null
);