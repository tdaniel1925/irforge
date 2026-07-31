-- Adds a free-text brand-color hint to companies, used to steer AI image generation
-- (e.g. "navy blue and red"). Optional; safe to run multiple times.
alter table public.companies
  add column if not exists brand_colors text;

comment on column public.companies.brand_colors is
  'Free-text brand color hint for AI image generation (e.g. "navy blue and red").';
