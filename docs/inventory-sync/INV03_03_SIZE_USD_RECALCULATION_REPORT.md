# INV-03-03 Size-Level USD Recalculation Report

## Summary

- Total size rows: 73
- MATCH rows: 0
- USD_RECALC_NEEDED rows: 73
- Missing/invalid price rows: 0
- Affected artwork count: 33
- Largest absolute delta: 411

## Formula

- FX rate: 92.4
- Multiplier: 2.25
- Formula: `price_inr / 92.40 * 2.25`
- Rounding rule: nearest whole USD dollar using `Math.round`.

## Notes

- This report is analysis-only.
- No workbook values were modified.
- No database writes were performed.
- Size-level USD updates should be handled in a later controlled workflow.

## Detailed Findings

| artwork_id | artwork_title | size_label | price_inr | current_price_usd | recalculated_price_usd | delta | review_flag |
|---|---|---|---:|---:|---:|---:|---|
| art-1770419263598 | Eternal Glow – Mandala of Light and Balance | 12" x 12" | 4500 | 76 | 110 | 34 | USD_RECALC_NEEDED |
| art-1770419263598 | Eternal Glow – Mandala of Light and Balance | 18" x 18" | 7500 | 76 | 183 | 107 | USD_RECALC_NEEDED |
| art-1770419263598 | Eternal Glow – Mandala of Light and Balance | 24" x 24" | 10000 | 76 | 244 | 168 | USD_RECALC_NEEDED |
| art-1770419263598 | Eternal Glow – Mandala of Light and Balance | 36" x 36" | 20000 | 76 | 487 | 411 | USD_RECALC_NEEDED |
| art-1770419460850 | Mandala in Blue and Peach | 12" | 3500 | 76 | 85 | 9 | USD_RECALC_NEEDED |
| art-1770771760544 | Hand-Painted Keychains (set of 5) | custom | 450 | 9 | 11 | 2 | USD_RECALC_NEEDED |
| art-1770771970545 | Mango-Shaped storage box | 4" X 2" | 450 | 9 | 11 | 2 | USD_RECALC_NEEDED |
| art-1770775579766 | Intricate Floral Mandala Art in Green & Gold | 12" round | 4000 | 76 | 97 | 21 | USD_RECALC_NEEDED |
| art-1770775579766 | Intricate Floral Mandala Art in Green & Gold | 18" round | 6900 | 76 | 168 | 92 | USD_RECALC_NEEDED |
| art-1770775579766 | Intricate Floral Mandala Art in Green & Gold | 24" round | 9000 | 76 | 219 | 143 | USD_RECALC_NEEDED |
| art-1770775579766 | Intricate Floral Mandala Art in Green & Gold | 36" round | 18000 | 76 | 438 | 362 | USD_RECALC_NEEDED |
| art-1770777152872 | Sacred Geometry in Clay & Mirror | 18" X 18" | 8000 | 152 | 195 | 43 | USD_RECALC_NEEDED |
| art-1770777152872 | Sacred Geometry in Clay & Mirror | 24" X 24" | 12000 | 152 | 292 | 140 | USD_RECALC_NEEDED |
| art-1770778384172 | Butterfly Set (3 pieces) | 4", 6", 8" set | 1500 | 28 | 37 | 9 | USD_RECALC_NEEDED |
| art-1770778509370 | Coaster Set (4 pieces) | 4" (set of 4) | 800 | 15 | 19 | 4 | USD_RECALC_NEEDED |
| art-1770778509370 | Coaster Set (4 pieces) | 4" (set of 6) | 1000 | 15 | 24 | 9 | USD_RECALC_NEEDED |
| art-1770778509370 | Coaster Set (4 pieces) | 4" with resin (set of 4) | 1200 | 15 | 29 | 14 | USD_RECALC_NEEDED |
| art-1770778509370 | Coaster Set (4 pieces) | 4" with resin (set of 6) | 1500 | 15 | 37 | 22 | USD_RECALC_NEEDED |
| art-1770779054676 | Floral Rectangular Wooden Storage Box | 12" X 5" X 3" (2 partitions) | 1500 | 28 | 37 | 9 | USD_RECALC_NEEDED |
| art-1770779054676 | Floral Rectangular Wooden Storage Box | 9" X 9" X 4" (3 partitions) | 1800 | 28 | 44 | 16 | USD_RECALC_NEEDED |
| art-1770779208267 | Rectangular Wooden box | 9" x 2.5" X 2.5" (single) | 700 | 13 | 17 | 4 | USD_RECALC_NEEDED |
| art-1770779208267 | Rectangular Wooden box | set of 3 | 1900 | 13 | 46 | 33 | USD_RECALC_NEEDED |
| art-1770933508740 | Canvas Bag - Birds | 10"x10" | 1500 | 38 | 37 | -1 | USD_RECALC_NEEDED |
| art-1770933508740 | Canvas Bag - Birds | 12"x12" | 2000 | 38 | 49 | 11 | USD_RECALC_NEEDED |
| art-1771030266195 | Hand-Painted Floral Saree | Standard | 20000 | 379 | 487 | 108 | USD_RECALC_NEEDED |
| art-1771030980031 | Midnight Plum Hand-Painted Floral Saree | Standard | 18000 | 341 | 438 | 97 | USD_RECALC_NEEDED |
| art-1771031213758 | Soft Romantic Pastel Drape with Lavender Blooms | Standard | 12000 | 227 | 292 | 65 | USD_RECALC_NEEDED |
| art-1771033398626 | Teal & Blue Boho Decorative Round | 6" (set of 2) | 1000 | 19 | 24 | 5 | USD_RECALC_NEEDED |
| art-1771033398626 | Teal & Blue Boho Decorative Round | 6" with resin (set of 2) | 1500 | 19 | 37 | 18 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 9" (single) | 800 | 15 | 19 | 4 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 10" (single) | 900 | 15 | 22 | 7 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 15" (single) | 1250 | 15 | 30 | 15 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 9" (set of 2) | 1500 | 15 | 37 | 22 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 10" (set of 2) | 1600 | 15 | 39 | 24 | USD_RECALC_NEEDED |
| art-1771101879286 | Decorative Serving Board | 15" (set of 2) | 2100 | 15 | 51 | 36 | USD_RECALC_NEEDED |
| art-1771101978525 | Hand painted Tussar Saree | Standard | 22000 | 417 | 536 | 119 | USD_RECALC_NEEDED |
| art-1771102194181 | Coaster Set (4 pieces) | 4" (set of 4) | 800 | 15 | 19 | 4 | USD_RECALC_NEEDED |
| art-1771102194181 | Coaster Set (4 pieces) | 4" (set of 6) | 1000 | 15 | 24 | 9 | USD_RECALC_NEEDED |
| art-1771102194181 | Coaster Set (4 pieces) | 4" with resin (set of 4) | 1200 | 15 | 29 | 14 | USD_RECALC_NEEDED |
| art-1771102194181 | Coaster Set (4 pieces) | 4" with resin (set of 6) | 1500 | 15 | 37 | 22 | USD_RECALC_NEEDED |
| art-1771102482592 | Decorative Wall Panel | 8" (round) or 8" (square) | 1600 | 57 | 39 | -18 | USD_RECALC_NEEDED |
| art-1771102482592 | Decorative Wall Panel | 10" (round) or 10" (square") | 2000 | 57 | 49 | -8 | USD_RECALC_NEEDED |
| art-1771102482592 | Decorative Wall Panel | 12" x 14" | 2800 | 57 | 68 | 11 | USD_RECALC_NEEDED |
| art-1771102578812 | Decorative Wall Panel | 8"(round) or 8" (square) | 1600 | 34 | 39 | 5 | USD_RECALC_NEEDED |
| art-1771102578812 | Decorative Wall Panel | 10"(round) or 10" (square) | 2000 | 34 | 49 | 15 | USD_RECALC_NEEDED |
| art-1771102578812 | Decorative Wall Panel | 12" X 14" | 2800 | 34 | 68 | 34 | USD_RECALC_NEEDED |
| art-1771102688340 | Small decorative Rounds (set of 5) | 6" (set of 5) | 1500 | 23 | 37 | 14 | USD_RECALC_NEEDED |
| art-1771454920479 | Canvas Bag - Flowers | 12" x 11" | 1000 | 19 | 24 | 5 | USD_RECALC_NEEDED |
| art-1771454920479 | Canvas Bag - Flowers | 14" x 15" | 1800 | 19 | 44 | 25 | USD_RECALC_NEEDED |
| art-1771902788998 | Hand Painted Wooden Mandala Tray (fillable Round) | 4.5" round | 500 | 21 | 12 | -9 | USD_RECALC_NEEDED |
| art-1771902788998 | Hand Painted Wooden Mandala Tray (fillable Round) | 6"round | 700 | 21 | 17 | -4 | USD_RECALC_NEEDED |
| art-1771902788998 | Hand Painted Wooden Mandala Tray (fillable Round) | 8" round | 900 | 21 | 22 | 1 | USD_RECALC_NEEDED |
| art-1771902788998 | Hand Painted Wooden Mandala Tray (fillable Round) | 10" round | 1100 | 21 | 27 | 6 | USD_RECALC_NEEDED |
| art-1771903158477 | Luxury Lippan Art Wall Panel | 18" X 18" | 8000 | 152 | 195 | 43 | USD_RECALC_NEEDED |
| art-1771903158477 | Luxury Lippan Art Wall Panel | 24" X 24" | 12000 | 152 | 292 | 140 | USD_RECALC_NEEDED |
| art-1771903526915 | Handcrafted Mud & Mirror Floral Mandala | 8"(round) or 8" (square) | 1600 | 53 | 39 | -14 | USD_RECALC_NEEDED |
| art-1771903526915 | Handcrafted Mud & Mirror Floral Mandala | 10" (round) or 10" (square") | 2000 | 53 | 49 | -4 | USD_RECALC_NEEDED |
| art-1771903526915 | Handcrafted Mud & Mirror Floral Mandala | 12" X 14" | 2800 | 53 | 68 | 15 | USD_RECALC_NEEDED |
| art-1771903835260 | Wooden Coaster Set | 4" (set of 4) | 800 | 15 | 19 | 4 | USD_RECALC_NEEDED |
| art-1771903835260 | Wooden Coaster Set | 4" (set of 6) | 1000 | 15 | 24 | 9 | USD_RECALC_NEEDED |
| art-1771903835260 | Wooden Coaster Set | 4" with resin (set of 4) | 1200 | 15 | 29 | 14 | USD_RECALC_NEEDED |
| art-1771903835260 | Wooden Coaster Set | 4" with resin (set of 6) | 1500 | 15 | 37 | 22 | USD_RECALC_NEEDED |
| art-1771904016600 | Heart Shaped Wooden Coaster Set | 4" (set of 4) | 800 | 15 | 19 | 4 | USD_RECALC_NEEDED |
| art-1771904016600 | Heart Shaped Wooden Coaster Set | 4" (set of 6) | 1000 | 15 | 24 | 9 | USD_RECALC_NEEDED |
| art-1771904016600 | Heart Shaped Wooden Coaster Set | 4" with resin (set of 4) | 1200 | 15 | 29 | 14 | USD_RECALC_NEEDED |
| art-1771904016600 | Heart Shaped Wooden Coaster Set | 4" with resin (set of 6) | 1500 | 15 | 37 | 22 | USD_RECALC_NEEDED |
| art-1772897507182 | Peach & Ivory Mirror Work Mandala | 18" X 18" | 8000 | 152 | 195 | 43 | USD_RECALC_NEEDED |
| art-1772897507182 | Peach & Ivory Mirror Work Mandala | 24" X 24" | 12000 | 152 | 292 | 140 | USD_RECALC_NEEDED |
| art-1772899719136 | Lippan Art Small decorative Squares (set of 5) | 4" (squares and round) | 1000 | 19 | 24 | 5 | USD_RECALC_NEEDED |
| art-1772942427729 | Hand-Painted Blue & Green Dot Mandala Wall Art | 12” x 12” | 4000 | 76 | 97 | 21 | USD_RECALC_NEEDED |
| art-1772991773037 | Elegant Pink Floral Texture Wall Art – 4 Panel Canvas Set | Each Panel - 24” x 12”  (4 panels) | 25000 | 473 | 609 | 136 | USD_RECALC_NEEDED |
| art-1778384480649 | Rhythms of Heritage – Blue Mirror Mosaic Art Work | 12"x12" | 11500 | 218 | 280 | 62 | USD_RECALC_NEEDED |
| art-1778384550442 | Moonlit Lotus – White Mirror Mosaic Art Work | 12"x12" | 13500 | 256 | 329 | 73 | USD_RECALC_NEEDED |
