-- ============================================================
--  Portfolio CMS — Supabase Schema
--  Run this entire file in: Supabase → SQL Editor → New query
-- ============================================================

-- ── 1. site_config ─────────────────────────────────────────
--  Single row (id = 'main') storing hero, resume, contact,
--  visibility flags — all as JSONB for flexible editing.
-- ───────────────────────────────────────────────────────────
create table if not exists site_config (
  id          text primary key default 'main',
  hero        jsonb not null default '{}'::jsonb,
  resume      jsonb not null default '{}'::jsonb,
  contact     jsonb not null default '{}'::jsonb,
  visibility  jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

-- Seed with default values so the row always exists
insert into site_config (id, hero, resume, contact, visibility)
values (
  'main',
  '{
    "name": "Samridh Kudesia",
    "photo": "",
    "tagline": "Product thinker building at the intersection of AI, education, and consumer tech.",
    "links": {
      "linkedin": "https://www.linkedin.com/in/samridhkudesia/",
      "email": "samridh@gmail.com"
    }
  }'::jsonb,
  '{
    "label": "Download Resume",
    "url": "https://drive.google.com/file/d/13_X6XgvUpGSUbbPtPZZlA-gJSnFkPfj1/view?usp=drive_link"
  }'::jsonb,
  '{
    "email": "samridh@gmail.com",
    "linkedin": "https://www.linkedin.com/in/samridhkudesia/",
    "note": "Open to interesting conversations about product, AI, and education."
  }'::jsonb,
  '{
    "experience": true,
    "projects": true,
    "quiz": true,
    "write": true,
    "reading": true,
    "watch": true,
    "wishlist": true,
    "contact": true
  }'::jsonb
)
on conflict (id) do nothing;

-- ── 2. timeline ─────────────────────────────────────────────
create table if not exists timeline (
  id          text primary key,
  position    integer not null default 0,
  company     text not null default '',
  role        text not null default '',
  subtext     text not null default '',
  website     text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  duration    text not null default '',
  bullets     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz default now()
);

insert into timeline (id, position, company, role, subtext, website, start_date, end_date, duration, bullets) values
  ('tl-1', 0, 'Park+', 'Product Manager',
   'Building India''s mobility future, one parking spot at a time.',
   'https://parkplus.io', '2022', 'Present', '2+ yrs',
   '["Led product strategy for India''s largest parking & mobility super-app","Owned CRM and mobile app roadmap serving millions of urban users","Collaborated cross-functionally with design, engineering, and growth teams"]'::jsonb),
  ('tl-2', 1, 'Plaksha University', 'Founders'' Office — Program Lead',
   'Helping reimagine what a technology university could look like in India.',
   'https://plaksha.edu.in', '2021', '2022', '~1 yr',
   '["Worked in the Founders'' Office helping build a next-generation tech university","Spearheaded launch of a quality AI/ML program for advanced tech education"]'::jsonb),
  ('tl-3', 2, 'Leap Finance', 'Associate',
   'Making international education financially accessible for Indian students.',
   'https://leapfinance.com', '2020', '2021', '~1 yr',
   '["Contributed to fintech product and operations at a leading EdFintech startup","Supported international student financing product lines"]'::jsonb),
  ('tl-4', 3, 'Kuar — Koç University Arçelik Research Center', 'Research Intern',
   'Exploring the intersection of design, creativity, and human-computer interaction.',
   'https://kuar.ku.edu.tr', '2019', '2020', '~1 yr',
   '["Conducted research in creative industries and human-computer interaction","Contributed to academic publications on design and technology innovation"]'::jsonb)
on conflict (id) do nothing;

-- ── 3. projects ─────────────────────────────────────────────
create table if not exists projects (
  id          text primary key,
  position    integer not null default 0,
  title       text not null default '',
  description text not null default '',
  url         text not null default '',
  tags        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz default now()
);

insert into projects (id, position, title, description, url, tags) values
  ('proj-1', 0, 'Park+ Mobility Super-App',
   'Led product for India''s largest parking platform — FASTag, EV charging, and parking discovery for 10M+ users.',
   'https://parkplus.io', '["Product","Mobile","Mobility"]'::jsonb),
  ('proj-2', 1, 'Plaksha AI/ML Program',
   'Designed and launched a rigorous AI/ML curriculum at Plaksha University to democratize advanced tech education.',
   'https://plaksha.edu.in', '["Education","AI","Program Design"]'::jsonb)
on conflict (id) do nothing;

-- ── 4. quiz ─────────────────────────────────────────────────
create table if not exists quiz (
  id          text primary key,
  position    integer not null default 0,
  title       text not null default '',
  link        text not null default '',
  image       text not null default '',
  blurb       text not null default '',
  date        date,
  updated_at  timestamptz default now()
);

-- ── 5. posts (Write / blog) ──────────────────────────────────
create table if not exists posts (
  id          text primary key,
  title       text not null default '',
  subtitle    text not null default '',
  slug        text not null default '',
  date        date,
  content     text not null default '',
  updated_at  timestamptz default now()
);

-- Slug must be unique so URLs never collide
create unique index if not exists posts_slug_idx on posts (slug);

-- ── 6. wishlist_items ────────────────────────────────────────
create table if not exists wishlist_items (
  id          text primary key,
  position    integer not null default 0,
  title       text not null default '',
  price       text not null default '',
  url         text not null default '',
  image       text not null default '',
  priority    text not null default '',
  updated_at  timestamptz default now()
);

-- ============================================================
--  Row Level Security
--  Public: SELECT on all tables (anon key can read everything)
--  Write:  blocked for anon — only the service_role key
--          (used by the Netlify function) can INSERT/UPDATE/DELETE
-- ============================================================

alter table site_config    enable row level security;
alter table timeline       enable row level security;
alter table projects       enable row level security;
alter table quiz           enable row level security;
alter table posts          enable row level security;
alter table wishlist_items enable row level security;

-- Public read policies
create policy "public read site_config"    on site_config    for select using (true);
create policy "public read timeline"       on timeline       for select using (true);
create policy "public read projects"       on projects       for select using (true);
create policy "public read quiz"           on quiz           for select using (true);
create policy "public read posts"          on posts          for select using (true);
create policy "public read wishlist_items" on wishlist_items for select using (true);

-- ============================================================
--  Done. The Netlify function uses the service_role key
--  which bypasses RLS and can write freely.
-- ============================================================
