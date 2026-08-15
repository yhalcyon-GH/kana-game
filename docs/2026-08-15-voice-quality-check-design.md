# 音声品質チェック機能 設計書（フェーズ1）

日付: 2026-08-15
ステータス: 承認済み・実装前

## 背景・目的

`scripts/generateAudioElevenLabs.ts` はElevenLabsで単語・文字の音声を生成しているが、生成結果を人間が一つずつ聞いて確認する以外の検証手段がない。特に `audioText`（漢字表記のTTS上書き）を持つ単語は、ElevenLabsが意図しない読み方をする（誤読）リスクがある。

本機能の目的は、生成済み音声を自動検査し、

- **PASS**（問題なし）→ 自動的に採用
- **WARNING**（不確実性あり）→ 人間が確認
- **FAIL**（明らかな誤読）→ 修正・再生成

に振り分け、人間の確認作業を「疑わしい音声だけ」に絞り込むこと。

AIの判定を絶対視しない。FAIL/WARNINGの判定は人間の最終確認を前提とし、判定結果と「人間確認済みか」は明確に区別する（このデータ管理はフェーズ3のスコープ）。

## スコープ

**フェーズ1（本設計書の対象）**: データモデルの最小拡張、発音（読み）検査エンジン、生成パイプラインの再生成対応、CLIツール、JSONレポート。

**フェーズ2（対象外・将来）**: F0/ピッチ解析によるアクセント検査（WARNING寄りの補助シグナルとして設計する想定 — 後述の「調査結果」参照）。

**フェーズ3（対象外・将来）**: 開発者用の確認・フィルタ画面、"Human Verified" フラグの永続化。

## 調査結果のまとめ（設計判断の根拠）

- `AnchorWord.kana`（`src/data/types.ts`）は**常に純粋なかな**であり、漢字表記は存在しない（`curriculum.test.ts` が強制する不変条件）。したがって **`kana` 自体が「正しい読み」の正解データ**であり、新規の `reading` フィールドは不要。
- 誤読リスクは `audioText`（省略可、漢字を含みうる）が実際にどう読み上げられるかに限定される。検査対象は「`audioText ?? kana` から生成された音声が `kana` 通りに聞こえるか」。
- アクセント正解データは既存の `src/data/accents.ts`（`ACCENT_PATTERNS`、単語idごとのH/L文字列、kana文字と1:1）を流用できる。新規アクセント辞書は不要。
- 音声認識（ASR）は `whisper.cpp`（MIT、ローカル実行、無料、商用利用可）を採用。日本語WERは良好だが、**単語レベルのタイムスタンプは日本語では精度が低い**（大型モデル必須、ハルシネーションリスク）ため、モーラ単位の正確な強制アライメントは前提にしない。
- ASR出力（漢字混じりのことがある）は `kuroshiro` + `kuroshiro-analyzer-kuromoji`（共にMIT）でひらがなに正規化してから比較する。
- F0解析ライブラリの候補として `pitchfinder`（GPLv3）と `pitchy`（MIT）を比較し、ライセンス上 `pitchy` を採用候補とする（フェーズ2で使用）。
- 全処理はローカル・OSS（MIT/Apache/BSD）で完結し、追加の運用コストは発生しない。ElevenLabsでの**再生成のみ**が既存通り有料。

## アーキテクチャ

```
words.ts (kana = 正解読み, audioText? = TTS入力)
        │
        ▼
public/audio/words/<id>.wav（既存の生成済み音声）
        │
        ▼
scripts/checkVoiceQuality.ts（新規・検査エンジン）
        │  ① whisper.cppでASR実行 → 生テキスト
        │  ② kuroshiroでひらがな正規化
        │  ③ lib/mora.ts でモーラ分解し、期待かな（word.kana）と
        │     モーラ単位の編集距離で比較
        │  ④ voice-check.config.ts の閾値でPASS/WARNING/FAIL判定
        ▼
voice-check-report.json（詳細） + コンソールサマリ（npm run check-voices）
        │
        ▼（--regenerate フラグ時のみ、要事前確認）
generateAudioElevenLabs.ts の単語単発再生成 → 再チェック（最大3回）
```

## コンポーネント設計

### 1. `src/lib/mora.ts`（新規・純粋関数、フレームワーク非依存）

かな文字列をモーラ配列に分解する。促音（っ）・長音（ー）・撥音（ん）・拗音（きゃ等の2文字1モーラ）・清濁音を正しく扱う。

```ts
export function toMorae(kana: string): string[]
```

`curriculum.test.ts` 群と同じ思想で、既存の「一かな文字=一モーラ、拗音のみ例外」というドメイン知識（CLAUDE.md記載）をそのままコードに落とし込む。

### 2. `src/lib/voiceQuality.ts`（新規・純粋関数）

ASR生テキスト・期待かなを受け取り、モーラ単位の編集距離スコアと `pronunciationStatus` を返す。ASR呼び出しやファイルI/Oは含まない（テスト容易性のため分離）。

```ts
export interface PronunciationCheckResult {
  expectedReading: string;
  detectedReading: string;
  pronunciationScore: number; // 0-100
  pronunciationStatus: 'PASS' | 'WARNING' | 'FAIL';
  reasons: string[];
}

export function checkPronunciation(
  expectedKana: string,
  asrRawText: string,
  normalizedDetectedKana: string,
  thresholds: VoiceCheckThresholds
): PronunciationCheckResult
```

### 3. `scripts/lib/asr.ts`（新規・スクリプト専用I/O層）

whisper.cpp呼び出し（子プロセス実行 or Nodeバインディング）とkuroshiro正規化をラップする。`src/`ではなく`scripts/`配下に置く（既存の「`scripts/`はビルド対象外、`src/`から参照しない」方針に合わせる）。

### 4. `voice-check.config.ts`（新規・リポジトリルート or `scripts/`直下）

PASS/WARNING/FAILの閾値、whisperモデルサイズ、maxAttemptsなどを定義。決め打ちにしない。

### 5. `scripts/checkVoiceQuality.ts`（新規・CLIエントリポイント）

`npm run check-voices` から実行。全単語（`words.ts`）を走査し、対応するwavファイルを検査、コンソールサマリ表示 + `voice-check-report.json` 書き出し。`--row <rowId>` 等のスコープ絞り込み、`--regenerate` フラグ（後述）に対応。

### 6. `scripts/generateAudioElevenLabs.ts`（既存・小改修）

単語1件を生成する処理を関数として切り出し、`checkVoiceQuality.ts` の再生成フローから呼べるようにする。既存の一括生成の挙動・スキップロジックは変更しない。

## データフロー・出力形式

```ts
interface VoiceCheckReport {
  generatedAt: string;
  config: VoiceCheckThresholds;
  totals: { pass: number; warning: number; fail: number };
  results: VoiceCheckEntry[];
}

interface VoiceCheckEntry {
  wordId: string;
  expectedReading: string;   // = word.kana
  audioTextUsed: string;     // = word.audioText ?? word.kana
  detectedReading: string;
  pronunciationScore: number;
  pronunciationStatus: 'PASS' | 'WARNING' | 'FAIL';
  reasons: string[];
  aiVerdict: 'PASS' | 'WARNING' | 'FAIL'; // フェーズ3で human 確認と区別するための予約フィールド
}
```

CLI出力は依頼文の例に準じた人間可読フォーマット（Total/PASS/WARNING/FAIL件数 + FAILURES一覧）。

## 再生成ループと課金ガード

- `npm run check-voices` は**デフォルトで検査のみ**。ElevenLabsは一切呼ばない。
- `npm run check-voices -- --regenerate` を指定した場合のみ、FAIL項目について実行前に対象単語数と推定コストをコンソール表示し、確認を求めてから再生成ループ（最大 `maxAttempts=3`、設定ファイルで変更可）を実行する。
- これは「有料API実行前に必ず確認を取る」という既存の運用ルールに合わせるための必須要件（CLAUDE.mdには明記されていないが、このプロジェクトでの標準的な進め方）。

## エラーハンドリング

- 対応するwavファイルが存在しない単語はスキップし、レポートに `status: 'MISSING_AUDIO'` として記録（PASS/WARNING/FAILとは別扱い）。
- whisper.cpp実行失敗（モデル未ダウンロード等）は該当単語を `WARNING`（判定不能・要確認）とし、処理は継続する（1単語の失敗で全体を止めない）。

## テスト戦略

- `src/lib/mora.test.ts`: 促音・長音・撥音・拗音・清濁音を含むかな文字列のモーラ分解を網羅。
- `src/lib/voiceQuality.test.ts`: モックしたASR出力に対する判定ロジックのテスト。少なくとも以下を含む：
  - 正しい読み（一致）→ PASS
  - 依頼文の例：期待「おばあさん」・検出「おそぼさん」→ FAIL（pronunciation mismatch）
  - 軽微な誤認識（音声認識の不確実性）→ WARNING
  - 促音・長音・撥音・拗音・清濁音を含む単語の一致/不一致パターン
- ASRエンジン自体（whisper.cpp呼び出し）は単体テスト対象外とし、`scripts/lib/asr.ts` のインターフェースをモック可能にすることで `checkVoiceQuality.ts` 側のロジックをテストする。
- 実装後、`npm test` と `npm run build` が通ることを確認する（CLAUDE.md記載の標準ルール）。

## 既存コードへの影響

- `src/data/types.ts` / `words.ts`: **変更なし**（`kana` を正解読みとして流用するため）。
- `src/data/accents.ts`: **変更なし**（フェーズ1では未使用、フェーズ2で読み取り専用参照）。
- `scripts/generateAudioElevenLabs.ts`: 単語1件生成ロジックの関数切り出しのみ、既存の一括実行の挙動は不変。
- `package.json`: 新規devDependency追加（whisper.cppバインディング、kuroshiro、kuroshiro-analyzer-kuromoji）。既存依存には影響なし。
- 新規ファイルのみで完結し、既存の学習フロー（Learn/Practice/Tracing等）やSRSロジックには一切触れない。

## 未解決事項（実装計画フェーズで詰める）

- whisper.cppのNodeバインディング（`nodejs-whisper` / `smart-whisper` 等）の具体的な選定とモデルサイズ（速度 vs 精度、ディスク容量）。
- モーラ単位編集距離のスコア化アルゴリズムの具体的な重み付け。
- PASS/WARNING/FAILのデフォルト閾値の初期値。
