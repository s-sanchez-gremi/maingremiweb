-- Company logo: key of a small WebP in the private bucket (records/companies/<id>/logo.webp), shown instead of the monogram in the workspace.
alter table clients add column logo_key text;
