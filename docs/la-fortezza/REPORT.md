# LA FORTEZZA UNIVERSAL – reference assembly, round 1 (HISTORGIC v007)

Status: **visual prototype for approval – not engineering-approved.** Viewer: `/lf.html` (standalone; the existing app is untouched).

## 1. Repository audit (what is reused)
- `index.html`: Three.js r160 scene builder, product types, per-product option rows, catalogue studio, hero shots, BOM-style summaries.
- The medium-duty shelving engine (`SHX` / `buildShelf`) already keeps a source and a status per dimension. LA FORTEZZA follows the same pattern but is a **separate family** – it is not beam-and-deck and must not share that engine or its 600 kg claim.
- Integration into the scene builder ("הוסף", studio, hero shots) is deferred until the reference assembly is approved.

## 2. Crosswalk Huliot SKU → manufacturer part (only where evidenced)
| Huliot | Part | Manufacturer candidate | Mapping |
|---|---|---|---|
| 33540612 | upright 2000 | U25000023 (p.19) | unverified |
| 33540604 | side tie 400 | fixed traverse 1078, P 400 (p.21) | unverified |
| 33530400 | shelf 970 × 400, no reinforcement | – (normal shelf N family, p.43–44) | unverified |
| 33530020 | metal shelf clip | G25000000 (p.47) | unverified |
| 33520550 | anchoring foot | 8723874 (p.21) | unverified |
| 33520560 | plastic foot | 2192 (p.21) | unverified |
| 33510010 | diagonal stabilisation set | bracing cross 8717540, L 970 (p.33) | unverified |

## 3. Verified facts used
- Upright section 28 × 49 mm, allow 29 mm in plan; slots 16 mm, gap 9 mm → pitch 25 mm (p.18).
- Shelf edge 33 mm; N / 1R / 2R families (p.43, p.45). Local 33530400 = 97 × 40, no reinforcement, 105 kg (LOC p.66).
- Fixing foot 8723874: plate 50 × 76, H 25, two bolts + one drive screw; **mandatory when H : P > 4 : 1** (p.21). Here 2000 / 400 = 5 → anchoring feet.
- Frames supplied unassembled, without feet; first traverse 150 mm above the floor (p.25).
- Shelf loads are for uniformly distributed load, deflection ≤ 1/200 (p.42).

## 4. Rules
- R1 anchoring when H/P > 4 – verified (p.21).
- R2 diagonal stabilisation set always included – **HISTORGIC product policy**, not a manufacturer requirement.
- R3 frame capacity by shelf spacing / bays (p.24) – requires review, not applied.
- R4 shelf load = uniformly distributed (p.42; LOC 105 kg) – verified.

## 5. Open questions (block engineering approval)
1. Shelf clip: **MFR p.47 has no drawing** (blank under the title); only the LOC p.68 illustration. Size, thickness, tongue → PENDING VERIFICATION.
2. Are clips included with local shelf 33530400 (manufacturer: "4 clips included") or bought separately as 33530020?
3. Upright orientation: which side of the C is open, and which faces carry slots.
4. Number of side ties per frame at H 2000 and the top tie position (the source counts only from 2750 H).
5. Diagonal set: strap size, attachment points, and whether 33510010 = 8717540.
6. Shelf count / heights in the reference assembly (chosen: 5 shelves at 150 / 600 / 1050 / 1500 / 1950, on the 25 mm pitch).
7. Sheet thickness, slot width, slot column positions, the shelf edge return – not dimensioned.

## 6. Reference assembly BOM (physical vs to buy)
| Part | SKU | Physical | To buy |
|---|---|---|---|
| Upright 2000 | 33540612 | 4 | 4 |
| Anchoring foot | 33520550 | 4 | 4 |
| Side tie 400 | 33540604 | 4 (2 per frame – to confirm) | 4 |
| Diagonal straps | 33510010 | 2 straps | 1 set |
| Shelf 97 × 40 | 33530400 | 5 | 5 |
| Shelf clip | 33530020 | 20 (4 per shelf) | **?** – depends on Q2 |


---

# Round 2 (HISTORGIC v010) – corrected reference assembly

Status: **NOT engineering-approved. No load or safety rating is shown for any configuration.** Temporary components are independent modules (`MODULES` in `lf.html`: `build()` + named ports); the assembly only uses the ports, so their geometry can be replaced later without rebuilding the system.

## Decisions applied
| # | Decision | Implementation |
|---|---|---|
| 1 | Bracing mandatory everywhere | In the model, BOM (marked "חובה") and price column. 2 crosses stacked (MFR p.33 "up to H 3000 = 2 braces in height" – interpretation). 33510010 ↔ 8717540 **not** assumed. |
| 2 | Clip temporary | Module `clip`, status PENDING. 4 per shelf = manufacturer figure; inclusion in 33530400 PENDING. |
| 3 | Upright re-check | Section rebuilt from MFR p.18: U, two V grooves per 49 mm wall, folded lips. Slots placed in the grooves (interpretation). Orientation and slotted face PENDING – profile not approved. |
| 4 | Side ties | 2 per frame, hooks snapped to slots; count and heights PENDING. |
| 5 | Shelves | 5 shelves, demo heights, derived from a slot index; mounting check (foot bracket, upright top). |
| 6 | Anchor feet | Foot module port = upright axis; anchor holes ±31 mm (PENDING). |
| 7 | Render | Dark studio background, key / fill / rim lights, soft shadows, outlines; colour by material / component / status. |
| 8 | Close-ups | clip ↔ upright ↔ shelf, brace ↔ upright, tie ↔ upright (+ foot), each with "פירוק החיבור" and status labels. |

## New evidence read in round 2
- **MFR p.33:** bracing strap section **50 × 1.5**, galvanised; fixed with bolt + nut; codes per L 770–1270 (8717540 = L 970); "up to H 3000 = 2 braces in height, every 8 bays, with fixing feet 8723874"; frame-ties bar 8742435 only in frames with braces.
- **MFR p.18:** slots 16 / gap 9 / pitch 25; section 28 × 49 (29 in plan). The slot elevation's column positions (0.30 / 0.72 of the face) match the V-groove positions (≈15 / 37 mm from the web) – read as "slots in the grooves" (provisional).
- **MFR p.21:** fixed traverse hooks into the upright slots (drawing, no dimensions); foot 8723874 is a U bracket around the upright on a 50 × 76 plate.
- **LOC p.68:** set 33510010 and clip 33530020 – names and codes only, no dimensions or contents.

## Verified vs provisional (summary – full table in the viewer side panel)
| Status | Count | Examples |
|---|---|---|
| Verified | 19 | upright 28 × 49 × 2000, slots 16/9/25, shelf 970 × 400 × 33, strap 50 × 1.5, foot plate 50 × 76 × 25, tie length 400, 4 clips per shelf |
| Provisional | 9 | upright section shape and groove positions, slots-in-grooves, shelf return, tie hook, brace L = bay length, brace fixing, 2 crosses in height, foot alignment |
| PENDING VERIFICATION | 18 | upright orientation / sheet / slot width / first slot, shelf thickness and 970 = length vs module, clip (all geometry, inclusion), tie section / count / heights, brace bolt direction / heights / set contents, foot holes / plate thickness |

## Open questions
See the "שאלות פתוחות" list in the viewer. Prices: none supplied – every BOM row shows "חסר מחיר".

QA images: `qa/assembly-material.webp`, `qa/assembly-components.webp`, `qa/joints-closeups.webp`.

---

# Round 3 (HISTORGIC v011) – integrated in the scene builder

V010 approved as a visual / functional base (not an engineering approval). `lf.html` is frozen as the V010 reference; the live model is product type `lf` in `index.html`, built on the existing product architecture (capCfg / applyCfg / rebuild / panel / HEADS / PRODUCT_OPTS / library / AI ops) – no second display model, no rewrite.

- **Data:** `LFX` – every value with status + source. Widths kept apart (`lfWidths`): `moduleNominalWidth` (verified, catalogue), `shelfPhysicalWidth` (pending – assumed = catalogue), `clipClearance` (pending placeholder, 2 mm), `uprightCenterDistance` and `assemblyOuterWidth` (derived, pending).
- **Supported SKUs only** (LOC p.65–68): shelves 97/117 × 30/40/50/60 (8 SKUs, with their reinforcement), uprights 200/225/250, ties 300–600.
- **Editable in the scene:** depth, height, bays (97/117 each, shared uprights), shelves per bay (3–8, demo heights snapped to the slot pitch), bracing crosses (1/2/3 – parameter, not verified) and braced-bay interval (every 8 = MFR / every bay), ties per frame (2/3 – not verified), status colours, level of detail.
- **Bracing:** always present – there is no control that removes it.
- **BOM:** recomputed on every change: uprights 2(N+1), shelves per SKU, clips 4 per shelf (purchase "?"), ties per frame, anchor feet 2(N+1), bracing straps (sets 33510010 "?"); price column "חסר מחיר"; no loads.
- **Adjacent units:** the existing snapping prevents overlaps; two LA FORTEZZA units standing flush (same turn, depth, height) get a "join into one row with a shared upright" button.
- **Not included yet (deliberately):** catalogue studio and hero shots (unverified product), the automatic space planner (`api/design.js`), back-to-back and corners (no connection rules in the sources). The voice / text assistant knows the product (`api/scene.js`, type `lf`, settings `lafortezza`).
- **Regression:** v010 vs v011 with all 17 existing product types in one scene – identical sizes, positions and mesh count; studio variants identical (334); screenshot identical except the animated logo; hero-shot flow (gauge, lock, result, re-render, voice) passes.
