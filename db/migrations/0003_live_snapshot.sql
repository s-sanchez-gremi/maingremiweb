-- Draft vs live: the editable columns are the DRAFT. `live` is the validated snapshot the public site serves.
alter table entry_translations add column live jsonb;
update entry_translations
  set live = jsonb_build_object('title', title, 'slug', slug, 'sections', sections, 'seo', seo, 'publishedAt', updated_at)
  where status = 'published';
-- One live slug per language (draft slugs are already unique via unique(locale, slug)).
create unique index entry_translations_live_slug on entry_translations (locale, (live->>'slug')) where live is not null;
