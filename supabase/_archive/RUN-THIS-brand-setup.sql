-- Brand / Social Media Setup fields on companies. All optional; safe to run repeatedly.
--   logo_url       — public URL of the uploaded company logo (brand reference/avatar)
--   image_style    — chosen AI-image style key (cinematic | infographic | illustration
--                    | photographic | minimal); drives buildImagePrompt per company
--   post_guidance  — free-text guidance for the AI (key products, audience, do/don't)
alter table public.companies
  add column if not exists logo_url      text,
  add column if not exists image_style   text,
  add column if not exists post_guidance text;

comment on column public.companies.image_style is
  'AI image style key: cinematic | infographic | illustration | photographic | minimal.';
comment on column public.companies.post_guidance is
  'Free-text brand guidance injected into AI post/image prompts.';

-- Preserve American Fusion's current infographic look now that the style is a setting
-- (the old AMFN hardcode was removed). Only sets it if not already chosen.
update public.companies
   set image_style = 'infographic'
 where upper(ticker) = 'AMFN' and (image_style is null or image_style = '');
