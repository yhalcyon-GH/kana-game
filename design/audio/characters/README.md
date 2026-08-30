# Single-kana recording archive

`kana-recordings/` — one `wav/` and `webm/` take per kana id (104 total: 46 base + 20 dakuten + 5 handakuten + 33 yōon), merged from 4 separate recording-session batches that were previously kept as separate zips (now in Desktop/Dust, since their content is fully represented here):

1. `kana_ta_to_n_processed` — た〜ん row (31 chars)
2. `kana_additional_58_processed` — all dakuten/handakuten/yōon (58 chars, no overlap with the others)
3. `kana_reshoot_7_claude_ready` — a 7-character re-recording pass (ha/hi/ne/ri/shi/wa/wo) fixing issues in the batch above
4. `kana_a_to_so_processed` — あ〜そ row (15 chars), the latest batch, which includes a further re-recording of しshi

Merged in that chronological order (each later batch's file overwrites any earlier one for the same kana id), so `kana-recordings/` holds exactly each character's most recent take. Each original zip also had per-sub-batch nested folders (e.g. `kana_ma_to_n_processed/`, `groups/kana_cha_chu_cho_processed/`) — those were redundant with that zip's own top-level combined `wav/`/`webm/` and were not carried over.
