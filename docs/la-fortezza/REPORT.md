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
