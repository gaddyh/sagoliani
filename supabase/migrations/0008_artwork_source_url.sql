-- ============================================================================
-- External source link for artworks (e.g. Google Drive, Dropbox).
-- Used by the print list to provide download links for each artwork.
-- ============================================================================

alter table public.artworks
  add column if not exists source_url text;
