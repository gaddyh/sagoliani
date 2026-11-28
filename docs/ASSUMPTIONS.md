# Unresolved business assumptions

Assumptions made during implementation that the artists should confirm.
Each one is safe to change later — stages, quantities and policies are data,
not code.

## Production workflow

1. **Stage path** (seeded, editable via SQL until the settings UI lands):
   1 הכנת חומר → 2 שריפה ראשונה → 3 זיגוג → 4 שריפה שנייה → 5 יישום ציור →
   6 שריפה שלישית → 7 בקרת איכות → 8 מוכן למסירה.
   `stage_id` means "the next stage the unit is waiting for"; a unit at
   stage 5 with no artwork is resting generic stock.
   *Confirm: does glazing always precede artwork application? Do generic
   units really rest after the second firing?*
2. **formed_drying import mapping**: imported inventory units were placed at
   stage 2 (waiting for the first firing) — the pieces are formed and drying;
   no firing was assumed. *Confirm this is the intended resting stage.*
3. **Rework destination**: a unit marked "rework" after a firing returns to
   `stage - 1` (e.g. firing-2 rework → re-glaze). *Confirm per-stage defaults.*
4. **Assorted artwork items** (מודה אני / מגוון ציורים): the concrete artwork
   is chosen at confirmation (`update_order_item_artwork`). *Confirm the
   studio always wants to pick it that early.*

## Payments and orders

5. **Payment statuses** currently modeled: unpaid / deposit / paid / refunded.
   *Confirm which PayBox states are actually used (cash on pickup? deposits?)*
6. Request numbers are server-issued `R-####` and stay with the order for its
   whole life; there is no separate internal order number.
7. Aggregate `ordered_quantity` in the inventory snapshot is demand context
   only — it was **not** imported as units and no orders were created from it.

## Inventory import (2026-11-28 snapshot)

8. **Quantity policy**: `formed_quantity_explicit` is verified; otherwise the
   **larger** of the estimated formed quantity and the reported stock was
   imported (never their sum — the overlap between them is unresolved in the
   source spreadsheet). Rows marked `requires_quantity_confirmation` are
   flagged in the import dry-run report.
9. **Row 20 (מגש מיקה)**: the note "2 במלאי בייבוש פרדס חנה" (reported stock 2)
   was preferred over the inferred estimate of 1 — hence 22 imported units
   overall rather than the snapshot's estimated total of 21.
10. Rows 13/16/19/20 carry `stock_overlap_with_formed_quantity: unknown` —
    if any reported stock is **in addition to** the formed pieces, the studio
    should add the difference manually after clarifying (or rerun a corrected
    snapshot — the import is idempotent per `import_ref`).

## Deployment (external credentials needed)

11. The production Supabase project does not exist yet. When it does:
    `supabase db push` (or paste migrations), `node scripts/seed_catalog.mjs`
    with prod env, create the two real artist accounts via the admin API,
    then `node scripts/import_inventory.mjs <snapshot> --apply`.
    Until then the spreadsheet remains the source of truth for inventory.
12. Automated daily backups (GitHub Action: encrypted dump + storage sync to
    off-site storage) require repo secrets the owner must provide
    (DB password / storage credentials). The free tier has no automatic
    backups.
