# voicePipeline

長い録音（例: あ〜んを連続で読み上げた1本の.wav）を、文字単位の個別`.wav`ファイルに自動分割・クリーニングするツール。詳細な設計判断は開発時のプランを参照。ここでは使い方とツール/ライセンスの記録のみ。

## 使用ツールとライセンス

| ツール | 用途 | ライセンス | 備考 |
|---|---|---|---|
| Node.js / TypeScript (`tsx`) | パイプライン本体 | MIT (Node.js), MIT (tsx) | 既にこのプロジェクトの`scripts/`全体で使用中。新規依存追加なし。 |
| FFmpeg (Gyan.FFmpeg full build, winget経由インストール済み) | コンテナのデコード/エンコード、`afftdn`(定常ノイズ低減)、`loudnorm`(音量統一)、`alimiter`(リミッター) | LGPL/GPL (ビルド構成による。このビルドは`--enable-gpl`のためGPL) | **外部プロセスとして呼び出すのみ**（`execFile`/`spawn`）。静的リンクや配布物への同梱は一切行わない — アセット生成時にのみ使うツールであり、この使い方は既存の`scripts/normalizeAudioVolume.mjs`と同じ。GPLのコピーレフト条項は「配布」に対して発生するものであり、ローカルでの音声アセット生成には抵触しない。 |

新規npmパッケージは追加していない。WAVコンテナの読み書きは全てFFmpegに任せ、Node側は生PCM (`Int16Array`) のみを扱う（サプライチェーン最小化）。

Audacityは自動パイプラインには使用していない（無音検出・マージン・条件付き処理など細かい制御が必要なため、コード側で完全制御する方が安全）。自動処理で直しきれない1クリップだけを人力で追加修正したい場合の任意ツールとして案内するに留める。

## フォルダ構成

```
input/                     ユーザーの録音（gitignore対象、絶対に上書きしない）
  test.wav
output/
  test/
    segments.json          機械可読な分割結果
    report.html            波形+区切りマーカー+raw/processed聴き比べ
    raw/<id>.wav            無加工の分割音声（STEP2相当）
    processed/<id>.wav      クリック/呼吸音/ノイズ/音量処理後（STEP3-7相当）
scripts/voicePipeline/
  voicePipeline.manifest.json   入力ファイル名(拡張子なし) → sequences.tsのシーケンス名
  sequences.ts                   文字の並び順定義（src/data/characters.tsと照合済み）
  config.ts                      しきい値・マージン等の調整用定数
```

## 使い方

```bash
# STEP1: 解析のみ（一切加工しない）
npm run voice:analyze -- --file input/test.wav --sequence hiragana-gojuon-46

# STEP2: 無加工の分割のみ（output/test/raw/ に出力）
npm run voice:split -- --file input/test.wav --sequence hiragana-gojuon-46

# STEP3-7: クリーニング・音量統一まで実行（output/test/processed/ に出力）
npm run voice:process -- --file input/test.wav --sequence hiragana-gojuon-46

# manifestに登録済みのファイルなら --sequence は省略可
npm run voice:process -- --file input/hiragana_01.wav

# manifestに登録済みの全ファイルを一括処理
npm run voice:process -- --all
```

`--sequence`名は`sequences.ts`の`SEQUENCES`のキー（`hiragana-gojuon-46`など）。新しい録音を追加するときは`voicePipeline.manifest.json`に`"ファイル名(拡張子なし)": "シーケンス名"`を1行足すだけでよい。

**検出した区切り数と期待される文字数が一致しない場合、自動的に処理を中断し、音声ファイルは一切書き出さない。** `report.html`で波形を確認し、`config.ts`のしきい値を調整するか、録音を確認すること。

## 調整方法（音がおかしいとき）

`config.ts`の該当セクションを弱める方向に調整する。**強くする前にまず弱くする**こと:

- 語頭/語尾が切れる → `segmentation.preMarginMs` / `postMarginMs` を増やす
- 逆に無音が長すぎる → 同じ値を減らす、または`minSilenceMs`を調整
- 発話内部で誤って区切られる → `minSilenceMs`や`mergeGapMs`を増やす
- クリック除去が強すぎる/子音を削っている → `clickRepair.enabled = false`にするか`minProminenceDb`を上げる
- 呼吸音処理が不自然 → `breathAttenuation.attenuationDb`を下げる、または`enabled = false`
- 環境ノイズ処理が音質を変えすぎる → `environmentNoise.reductionDb`を下げる、または`floorThresholdDbfs`を下げて発動条件を厳しくする

## 出力先について

`output/`の中身は`public/audio/`へ**自動では昇格しない**。人間が`report.html`で確認し、問題なければ手動で該当ファイルを`public/audio/characters/`等へコピーすること（既存の「音声はコミット前提、なんとなく再生成しない」方針を踏襲）。
