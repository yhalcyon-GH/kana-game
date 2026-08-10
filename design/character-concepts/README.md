# Mascot character design exploration

AI-generated concept art for kana-game's original mascot character: a fox spirit girl inspired by the classical tale 玉水物語 (Tamamizu Monogatari). Generated with Gemini 2.5 Flash Image ("Nano Banana"). Not yet wired into the app — this is design reference material.

See the `project-kana-game-mascot-character` memory for the full design brief and history. Short version:

- Fox spirit girl, ~14-15 years old, semi-chibi proportions (~4.5 heads tall), round (not square/sharp) face
- Short reddish-orange bob, amber eyes, fox ears + tail
- Heian-court-**attendant** (女房) robe — deliberately NOT a shrine-maiden/miko design, the key differentiator from generic anime kitsune-girl characters
- Sleeve/hem trim in "kasane-no-irome" layered autumn gradient (not flat fox-orange)
- Green obi patterned with rice ears (稲穂)
- Subtle abstract pale blue/white "suimon" (water-ripple) pattern on the robe, referencing her name "Tamamizu" (clear water)
- One anatomically-correct 7-lobed maple leaf on a simple kanzashi hairpin
- Holds an oversized writing brush (筆) in her right hand — references the letter she leaves at the story's end

## Files (roughly chronological)

- `char_sheet_v1_1.png`, `char_sheet_v2_1.png` — earliest single-image style tests (elegant flat-vector, then moe-cute)
- `char_variant_2.png`–`char_variant_10.png` — batch of 10 pose/prop variations exploring differentiators (fan, letter, brush, maple branch). `char_variant_1.png` (the one the user picked as the face/base reference — short bob, closed fan, tasseled hairpin) was lost from the scratch directory before backup; its design was carried forward into `char_extracted_1.png` onward.
- `char_final_1.png`–`char_final_3.png` — brush + traditional folded-letter (結び文) exploration
- `char_suihatsu_1.png`–`char_suihatsu_3.png` — alternate direction with authentic Heian 垂髪 hairstyle (not used in the end, kept for reference)
- `char_extracted_1.png` — first attempt recreating the chosen variant-1 look from a feature description
- `char_v2_1.png` through `char_v9_1.png` — iterative refinement (brush-only pose, no-text fixes, face roundness back-and-forth, single-vs-double maple leaf, obi pattern, spatial layout experiments)

## Known model limitations hit during this process

- Reliably generates stray text/kanji inside patterns unless explicitly and repeatedly told not to
- Sometimes draws bristles on both ends of the brush instead of one
- Cannot reliably place elements on a specified side (left/right instructions, and even "same side as X" relative instructions, were inconsistently followed across generations)

No final version has been picked yet — `char_v9_1.png` is the latest iteration as of the last session.
