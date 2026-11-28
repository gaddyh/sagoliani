-- ============================================================================
-- Import provenance for physical ceramic units.
--
-- Migration and inventory imports run with the service key and insert units
-- with a stable import_ref (e.g. 'inv-2026-11-28:row-12:u3'). The unique
-- index makes imports idempotent: rerunning an import can never duplicate
-- inventory (ON CONFLICT / merge-duplicates does nothing).
-- ============================================================================

alter table public.ceramic_units add column if not exists import_ref text;
create unique index if not exists ceramic_units_import_ref_idx
  on public.ceramic_units (import_ref);
