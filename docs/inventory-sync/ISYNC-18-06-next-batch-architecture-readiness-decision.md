# ISYNC-18-06 — Next-Batch and Architecture Readiness Decision

**Ticket:** ISYNC-18-06 — Next-Batch and Architecture Readiness Decision  
**Branch:** `feature/ISYNC-18-06-next-batch-architecture-readiness`  
**Date:** 2026-07-27  
**Type:** Decision document — no production changes, no code changes  
**Base commit:** `6f34bcd` (ISYNC-18-05 merge into main)

---

## Preflight Confirmation

| Check | Result |
|---|---|
| Branch base | `main` at `6f34bcd` (ISYNC-18-05 merged) |
| Branch | `feature/ISYNC-18-06-next-batch-architecture-readiness` ✓ |
| Git status | Clean — no staged secrets, no temp scripts, no private files |
| server/.env staged | No ✓ |
| Private workbook, image ZIP, Apply JSON | Not tracked (`_private/` gitignored) ✓ |
| Backup file | Not in repo (`C:\Development\backups\postgres\`) ✓ |

---

## Step 1 — Final ISYNC-18 State

### What ISYNC-18 Successfully Proved

ISYNC-18 is a six-sub-ticket story that ran end-to-end on 2026-07-27. It proved:

1. **The controlled import pipeline works for a small CREATE-only batch.**  
   Preview + Apply + post-Apply validation passed with no errors on a 4-row package. The pipeline is safe to use again for future CREATE-only batches when operated under the ISYNC-18-03 runbook.

2. **The Review Queue is functional for imported artworks.**  
   All 4 artworks appeared in the admin Review Queue immediately after Apply, with correct images and prices, and were not visible to the public.

3. **The two-gate public visibility model is enforced by the server.**  
   Newly imported artworks with `status=NEEDS_REVIEW` and `show_on_website=false` (the DB default) never appeared in the public API regardless of other field values. The gates work as designed in ARCH-INV-01.

4. **Production Apply is safe when preceded by backup + baseline + Preview.**  
   The ISYNC-18-03 runbook sequence (backup → baseline → Preview gate → Apply → post-Apply validation) produced a clean, fully reversible import with no stop conditions hit and no unintended side effects.

5. **INV-PRICE-01 is not blocking for numeric-priced CREATE rows.**  
   All 4 rows used straightforward numeric INR prices. Price USD was computed correctly by the backend using the production `fx_rate=92.4` and `usd_multiplier=2.25`. No size-level Price on Request was involved.

6. **A valid production backup procedure exists.**  
   `pg_dump` at `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` produced a complete 12.08 MB backup. Rollback SQL is documented in the ISYNC-18-03 runbook. The backup has been retained at `C:\Development\backups\postgres\chitrakala_prod_20260727_pre_isync18.backup`.

### Production State That Changed

| Metric | Before ISYNC-18 | After ISYNC-18 |
|---|---|---|
| Admin artworks | 38 | 42 (+4) |
| NEEDS_REVIEW artworks | 0 | 4 |
| warli-art artworks (admin) | 0 | 2 |
| mixed-art artworks (admin) | 0 | 1 |
| texture-art artworks (admin) | 1 | 2 |

### Production State That Did Not Change

| Metric | Value | Confirmed unchanged |
|---|---|---|
| Public artworks | 38 | ✓ |
| artwork_sizes rows | 91 | ✓ |
| categories (DB) | 7 | ✓ |
| order_requests | 3 | ✓ |
| order_request_items | 4 | ✓ |
| fx_rate | 92.4 | ✓ |
| usd_multiplier | 2.25 | ✓ |
| maintenance_mode | false | ✓ |
| All 38 existing artworks | Unchanged | ✓ |

### Current Status of the 4 Imported Artworks

| ID | Title | Category | Price INR | Price USD | Status |
|---|---|---|---|---|---|
| `art-1785182575357-0` | 18" Round Warli Art | warli-art | ₹7,000 | $170 | NEEDS_REVIEW |
| `art-1785182575357-1` | 10" Round Warli Art | warli-art | ₹2,500 | $61 | NEEDS_REVIEW |
| `art-1785182575357-2` | Decorative Tray 11" | mixed-art | ₹1,100 | $27 | NEEDS_REVIEW |
| `art-1785182575357-3` | 3 Partition Square Box with Handle | texture-art | ₹1,600 | $39 | NEEDS_REVIEW |

All 4: `show_on_website=false`, `sku=null`, images set, hidden from public API.  
**All 4 artworks have not shipped from India.** They must remain NEEDS_REVIEW and hidden until physically received, inspected, and owner-reviewed.

### Conclusion

**The controlled import pipeline (Preview + Apply + Review Queue) is proven for a small CREATE-only batch. The 4 imported artworks should remain NEEDS_REVIEW + hidden until shipped, received, inspected, and approved by the owner.**

---

## Step 2 — Next-Batch Decision

### Options Evaluated

**Option A — Pause additional imports until the current 4 artworks are shipped/received and reviewed.**  
Advantages: Avoids accumulating unreviewed NEEDS_REVIEW records; next import can include data confirmed correct at time of receipt; fewer in-flight records for the owner to track.  
Disadvantages: Delays pipeline reuse until shipment arrives.

**Option B — Continue importing future shipment items as hidden NEEDS_REVIEW drafts before shipment.**  
Advantages: Drafts can be prepared ahead of time; pipeline can be exercised again before next shipment.  
Disadvantages: Accumulates NEEDS_REVIEW records without shipment context; owner cannot confirm materials, dimensions, or images match actual received items. Risk of importing incorrect data for items not yet verified.

**Option C — Prepare a larger next import package but do not Apply until data/images/owner fields are ready.**  
Advantages: Package preparation can start in parallel with awaiting shipment.  
Disadvantages: Without a firm trigger (e.g., shipment confirmed, images received), packages can sit unreviewed. Apply depends on image ZIP being ready, which requires received items.

**Option D — Start ARCH-INV-02 planning before any larger inventory/shipment workflow is built.**  
Advantages: Ensures the next batch is designed against a sound shipment/inventory architecture. Prevents repeated import-and-forget workflows that don't reflect real stock state.  
Disadvantages: Adds design work before next import. Not blocking if import scope stays small and CREATE-only.

### Recommendation

**Option A is the recommended safe next step for production imports. Option D can proceed in parallel as a non-blocking planning effort.**

Rationale:
- The current 4 artworks have not shipped. There is no urgency to import additional batches before these are resolved.
- Importing more NEEDS_REVIEW records before the current 4 are processed adds noise and risk without business value.
- The full publish workflow (ISYNC-18-07) has not yet been validated end-to-end. Publishing should be tested with exactly one received, ready artwork before any batch publish is considered.
- ARCH-INV-02 can begin as a planning document in parallel — it does not block ISYNC-18 closure or small future imports, but its output should inform any larger import/shipment workflow.

**Decision: Pause additional production imports until:**
1. The current 4 artworks are physically received and inspected.
2. ISYNC-18-07 (publish workflow validation) is completed successfully on at least one received artwork.
3. Owner confirms readiness of next source workbook and images.

**Exception:** A future import of a small, unambiguous CREATE-only batch (with confirmed images and owner-reviewed fields) may proceed under a new ISYNC-19 ticket without waiting for ARCH-INV-02, as long as the ISYNC-18-03 runbook is followed.

---

## Step 3 — Publish Workflow Decision

### Current State

The publish workflow has not been tested end-to-end. As of ISYNC-18-05, the admin Review Queue is confirmed functional (artworks visible, Edit available, Publish visible but not clicked). The ISYNC-18-03 runbook and ISYNC-18-05 ticket explicitly withheld publish because the artworks have not shipped.

### Decision

**Do not publish any of the 4 imported artworks now. The artworks have not shipped.**

Publishing should be tested in a controlled future ticket after at least one artwork is:
- Physically received at the destination
- Visually inspected to confirm it matches the imported record
- Owner-reviewed for all required fields (Materials, Dimensions, Description)

### Recommended Future Ticket

**ISYNC-18-07 — Controlled Publish Workflow Validation for Received Artwork**

> **Scope:** After shipment is received — choose exactly one received and ready artwork from the 4 imported rows. Owner fills in Materials, Dimensions, and Description. Admin sets `status=IN_STOCK` and `show_on_website=true` via the admin panel. Validate: SKU auto-generation, public catalog visibility, category visibility (warli-art or mixed-art appearing publicly for the first time), order request flow, and confirmation that no other hidden artworks became public. Roll back immediately if anything unexpected occurs.

This ticket must not be created or implemented in the ISYNC-18-06 branch. The recommendation is on record here for scheduling after shipment receipt.

**Pre-conditions for ISYNC-18-07:**
1. At least one of the 4 artworks has been physically received and inspected
2. Owner has filled in Materials and Description for that artwork
3. Owner has confirmed the image matches the physical received item
4. Dimensions are confirmed or standardized (e.g., "18 in diameter" not "18in round")
5. Owner explicitly approves the single-artwork publish

---

## Step 4 — Pending Shipment Handling Decision

### Current Temporary Handling

For unshipped imported artworks, the approved interim state is:

| Field | Value | Reason |
|---|---|---|
| status | NEEDS_REVIEW | Prevents accidental publish; standard import default |
| show_on_website | false | Keeps artwork hidden from public |
| sku | null | No SKU until owner decides to publish |
| notes | Import sourcing note (needs update) | See recommended text below |

### Recommended Notes Field Value

The owner should update the `notes` field on each of the 4 artworks via the admin panel:

```
Pending shipment from India. Do not publish until received, inspected, and all fields reviewed by owner.
```

This replaces or prepends to the current import sourcing notes. The `notes` field is admin-only — it is not shown to public customers. It serves as a visible internal hold flag for any admin editing these records.

### What Must NOT Change While Artworks Are Pending Shipment

`status`, `show_on_website`, and `sku` must remain unchanged until the owner explicitly approves publishing via ISYNC-18-07.

### On Adding a New Database Status (TO_BE_SHIPPED / IN_TRANSIT)

A real "To Be Shipped" or "In Transit" lifecycle status should not be added to the current `artworks.status` column in this ticket or any ISYNC-18 sub-ticket. The approved status values are: `NEEDS_REVIEW`, `IN_STOCK`, `MADE_TO_ORDER`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED` (per ARCH-INV-01).

Shipment/receiving state is a physical inventory lifecycle concern, not a public catalog concern. Adding `TO_BE_SHIPPED` or `IN_TRANSIT` to the artwork status field would conflate the catalog record with physical stock state — the exact separation that ARCH-INV-02 is designed to address.

**Interim solution: use the `notes` field as a human-readable hold flag.** Long-term, ARCH-INV-02 should design a proper shipment/receiving lifecycle that does not pollute the catalog status field.

---

## Step 5 — ARCH-INV-02 Readiness Decision

### ISYNC-18 No Longer Blocks ARCH-INV-02

ISYNC-18 has established a working import pipeline and confirmed the two-gate visibility model functions correctly. The design gaps that ARCH-INV-02 is intended to address — specifically the conflation of catalog records with physical stock state — have now been made more concrete through ISYNC-18 execution. The pending-shipment problem (artworks imported before physical receipt) is a direct illustration of why the separation matters.

**ARCH-INV-02 is ready to start as a planning/design effort.**

### ARCH-INV-02 Scope

ARCH-INV-02 should remain a separate planning/design ticket from ISYNC-18. It should not be implemented inside ISYNC-18-06 or any ISYNC-18 sub-ticket.

ARCH-INV-02 should design the separation between:

1. **Catalog artwork record** — what the artwork is (title, category, description, materials, dimensions, images, pricing). Lives in `artworks`. Stable once published. Public-facing.
2. **Physical stock/inventory record** — how many physical units exist and where. Not currently modeled. May be a separate table or a set of columns on `artworks` depending on scale.
3. **Shipment/receiving status** — where in the physical fulfillment lifecycle an item sits (ordered from artist → in transit → received → inspected → available). Not the same as the catalog status.
4. **Future availability/public status** — the two-gate model (`status` + `show_on_website`) already exists; ARCH-INV-02 should confirm whether this model is sufficient long-term or needs extension.
5. **Order/request lifecycle** — customer inquiry → quote → confirmation → fulfillment. Separate from both catalog and physical stock.

### On Shipment Status Values

"To Be Shipped" and "In Transit" are shipment/inventory lifecycle concepts. They do not belong in the `artworks.status` column, which is a catalog/availability concept. ARCH-INV-02 should define how shipment state is tracked without polluting the catalog status field — whether that means a separate `physical_inventory` table, a `shipment_status` column, or integration with an external logistics record.

### Relationship to ISYNC-19

ARCH-INV-02 output should inform, but does not block, a future small CREATE-only import (ISYNC-19) if the import scope remains within the proven ISYNC-18 pipeline parameters. A larger import or a shipment-triggered workflow should wait for ARCH-INV-02 planning to be complete.

---

## Step 6 — INV-PRICE-01 Decision

### Conclusion: INV-PRICE-01 Is Not Required for ISYNC-18

INV-PRICE-01 addresses size-level Price on Request — the case where a row has `Price on Request = TRUE` and `Size Label` set. This triggers a parser error and requires a separate implementation before such rows can be imported.

For the completed 4-row ISYNC-18 batch:
- All 4 rows had numeric INR prices (7,000 / 2,500 / 1,100 / 1,600)
- All 4 rows had `Price on Request = FALSE`
- Size labels were present but are descriptive metadata only — they do not create size-pricing entries and do not trigger the POR parser error
- Price USD was calculated correctly by the backend at Apply time

**INV-PRICE-01 remains unstarted and is not required for ISYNC-18 closure.**

INV-PRICE-01 should be evaluated when a future import batch includes artworks with size-level pricing or Price on Request. It is not needed for future CREATE-only batches with straightforward numeric prices.

---

## Step 7 — Follow-Up Tickets Discovered During ISYNC-18

The following tickets are recommended based on findings during ISYNC-18. None are implemented in this branch.

### 1. ISYNC-18-07 — Controlled Publish Workflow Validation for Received Artwork

**Priority:** High — must be completed before any of the 4 imported artworks go public  
**Trigger:** Owner confirms physical receipt of at least one of the 4 artworks  
**Scope:** Choose one received, ready artwork. Owner fills in Materials, Dimensions, Description. Admin sets status=IN_STOCK and show_on_website=true. Validate: SKU auto-generation, public catalog appearance, category visibility (warli-art or mixed-art will appear publicly for the first time), order request flow, no other hidden items made public. Roll back if anything unexpected occurs.

### 2. WEB-CAT-02 — Fix Public Artworks Category Query Filtering

**Priority:** Medium — pre-existing bug; does not affect current publish workflow but impacts future category-based filtering  
**Finding (ISYNC-18-04 Observation 1):** `GET /api/artworks?category=<slug>` ignores the `category` query parameter and returns all 38 public artworks regardless of the slug provided. Category filtering is currently implemented client-side only.  
**Risk:** When warli-art and mixed-art gain public artworks (post-ISYNC-18-07), the public category gallery will depend on client-side filtering working correctly. If the API ever needs to support server-side filtering (for SEO, pagination, or mobile clients), the current bug will surface as a regression.  
**Scope:** Investigate `dbQueries.js:getArtworks()` and the artworks route handler. Add a `WHERE category = $1` condition when a `category` parameter is present. Validate that existing 38 artworks still return correctly per category.

### 3. ARCH-INV-02 — Separate Artwork Catalog from Physical Inventory Stock

**Priority:** Medium — planning/design only; implementation in follow-up tickets  
**Trigger:** Can start now; ISYNC-18 no longer blocks it  
**Scope:** Design document defining separation between catalog record, physical stock, shipment/receiving status, and order lifecycle. Should address how "pending shipment" and "in transit" states are tracked without adding to `artworks.status`. Should confirm whether the two-gate visibility model is sufficient or needs extension. Output informs future ISYNC-19 design, ORD-01, and any shipment-tracking implementation.

### 4. INV-STATUS-01 — Define Internal Shipment / In-Transit Inventory Lifecycle (Optional)

**Priority:** Low — only if not absorbed into ARCH-INV-02  
**Finding (ISYNC-18-05):** The current state of the 4 imported artworks (imported before physical receipt) has no formal representation in the schema. The `notes` field is being used as a human-readable hold flag ("Pending shipment from India..."). This is a workaround, not a solution.  
**Scope:** If ARCH-INV-02 does not fully address shipment lifecycle, define a lightweight shipment/receiving status model. Do not add new values to `artworks.status`. Consider a separate `shipment_batches` or `physical_inventory` table, or a `shipment_status` column on `artworks`, depending on what ARCH-INV-02 recommends.

### 5. ISYNC-19 — Prepare Next Production Import Batch (Optional)

**Priority:** Low — only after ISYNC-18-07 completes and owner confirms source data readiness  
**Trigger:** After ISYNC-18-07 validates the full publish workflow end-to-end AND owner has confirmed source workbook and images for the next batch  
**Scope:** Follow the ISYNC-18-03 runbook. Evaluate which of the 21 currently excluded shipmentDetails rows are ready for import (ambiguous rows require BUS-REVIEW-01 decisions to be resolved first). Candidate rows: any unambiguous CREATE row with confirmed image, materials, and owner-reviewed description. UPDATE rows (existing artwork edits) require additional runbook steps not yet defined.

### Additional Open Items (From BUS-REVIEW-01, Not Blocking ISYNC-18 Closure)

From ISYNC-18-01, 10 of 11 BUS-REVIEW-01 decisions remain open. These affect expanded import batches but do not block ISYNC-18 closure:

| Decision | Topic |
|---|---|
| 1 | SKU assignment for existing 38 artworks (INV-SKU-01 scope) |
| 2 | Initial status/quantity defaults for future imports |
| 3 | Dimensions field strategy |
| 4 | Saree/textile dimensions wording |
| 5 | Image filename strategy |
| 6a | Duplicate "Coaster Set (4 pieces)" titles |
| 6b | Duplicate "Decorative Wall Panel" titles |
| 7 | Missing pricing variants (2 artworks) |
| 8 | Generic title "Mirror Mosaic artwork" |
| 9 | Lippan materials correction |
| 10 | Textile-design category handling |

---

## Risks and Open Questions

| Risk | Severity | Mitigation |
|---|---|---|
| 4 artworks sitting as NEEDS_REVIEW indefinitely if shipment is delayed | Low | Notes field documents hold reason; no production risk while hidden |
| `owner_review_needed` field returns null in API for all 4 rows | Low | Flag is set in workbook; admin UI may surface it differently; verify when editing records |
| description and notes fields are identical on all 4 rows | Low — admin only | Owner should update both before publish; notes should be replaced with pending-shipment message |
| warli-art and mixed-art categories empty publicly until ISYNC-18-07 | Low — expected | These categories will appear publicly after first successful publish via ISYNC-18-07 |
| WEB-CAT-02 bug means /api/artworks?category= is non-functional server-side | Medium — pre-existing | Client-side filtering works; file WEB-CAT-02 for remediation |
| No GET /api/admin/artworks/:id endpoint | Low — workaround known | Validation uses full list + filter; document for any future admin tooling |
| Next batch may include UPDATE rows (matching existing artworks) — not yet validated | Medium | ISYNC-18 only proved CREATE rows; UPDATE validation requires separate runbook extension and owner-confirmed IDs |
| Backup procedure relies on PostgreSQL 18 being available at the specified path | Low | Document path; validate on each new machine before running Apply |

---

## Final Recommendation

**ISYNC-18 has successfully proven the controlled import pipeline for a small CREATE-only batch. The recommended path forward is:**

1. **Do not publish the 4 imported artworks now.** They have not shipped.
2. **Owner should update Notes on all 4 artworks** with the pending-shipment message via the admin panel.
3. **Owner should update Materials on all 4 artworks and Dimensions on Row 4** (3 Partition Square Box) before the publish review window opens.
4. **After shipment receipt, run ISYNC-18-07** (controlled publish workflow validation) with exactly one received and ready artwork.
5. **File WEB-CAT-02** to fix the non-functional `?category=` filter on the public artworks API.
6. **Start ARCH-INV-02 as a planning/design effort** — ISYNC-18 no longer blocks it.
7. **Do not start ISYNC-19** until ISYNC-18-07 completes and the next source workbook/images are confirmed ready by the owner.
8. **INV-PRICE-01 remains deferred** — not needed for the completed 4-row batch.

---

## Ticket Status

| Ticket | Status | Can Close? |
|---|---|---|
| ISYNC-18-00 | Done / merged | ✓ |
| ISYNC-18-01 | Done / merged | ✓ |
| ISYNC-18-02 | Done / merged | ✓ |
| ISYNC-18-03 | Done / merged | ✓ |
| ISYNC-18-04 | Done / merged | ✓ |
| ISYNC-18-05 | Done / merged | ✓ |
| ISYNC-18-06 | Complete after merge | ✓ |
| **ISYNC-18 (parent story)** | **Ready to close** | ✓ — see note |

**ISYNC-18-06 can be marked Done after this branch is merged to main.**

**ISYNC-18 (parent story) can be closed after ISYNC-18-06 is merged.** The parent story delivered a working controlled import pipeline for a 4-row CREATE-only batch. The outstanding items (publish workflow, architecture, next batch) are appropriately scoped to follow-up tickets (ISYNC-18-07, ARCH-INV-02, ISYNC-19) and do not extend the ISYNC-18 story.

**Note:** The 4 imported artworks will remain as open items in production until ISYNC-18-07 completes. Closing ISYNC-18 does not mean those artworks are ready to publish — it means the import pipeline story is complete and the artwork lifecycle handoff to the owner is documented.
