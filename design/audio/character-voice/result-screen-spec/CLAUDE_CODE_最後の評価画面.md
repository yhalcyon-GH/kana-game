# Claude Code 指示：最後の評価画面

かなゲームの最後の結果画面に、たまみずの短い評価コメントを表示してください。

## 基本ルール

- 判定は正答率を基準にする。
- 8問モードと15問モードの両方に対応する。
- 評価コメントは結果画面で1つだけ表示する。
- 問題中の「連続正解コメント」とは別の処理にする。
- 最高条件から順番に判定し、最初に一致したコメントを使う。

## 評価条件

| 正答率 | 8問モード | 15問モード | たまみずのコメント |
|---|---:|---:|---|
| 100% | 8問正解 | 15問正解 | パーフェクト！ |
| 80%以上 | 7問正解 | 12〜14問正解 | すごい！ |
| 60%以上 | 5〜6問正解 | 9〜11問正解 | いいかんじ！ |
| 40%以上 | 4問正解 | 6〜8問正解 | あとすこし！ |
| 40%未満 | 0〜3問正解 | 0〜5問正解 | もういっかい！ |

## TypeScript実装例

```ts
type QuestionCount = 8 | 15;

type ResultEvaluation =
  | "perfect"
  | "great"
  | "good"
  | "almost"
  | "retry";

interface EvaluationResult {
  id: ResultEvaluation;
  message: string;
}

export function getResultEvaluation(
  correctCount: number,
  questionCount: QuestionCount,
): EvaluationResult {
  const accuracy = correctCount / questionCount;

  if (accuracy === 1) {
    return {
      id: "perfect",
      message: "パーフェクト！",
    };
  }

  if (accuracy >= 0.8) {
    return {
      id: "great",
      message: "すごい！",
    };
  }

  if (accuracy >= 0.6) {
    return {
      id: "good",
      message: "いいかんじ！",
    };
  }

  if (accuracy >= 0.4) {
    return {
      id: "almost",
      message: "あとすこし！",
    };
  }

  return {
    id: "retry",
    message: "もういっかい！",
  };
}
```

## 注意

- `Math.round()`で正答率を丸めて判定しない。
- `correctCount / questionCount` の値をそのまま比較する。
- 8問モードの6問正解は75%なので「いいかんじ！」。
- 8問モードの7問正解は87.5%なので「すごい！」。
- 15問モードの12問正解は80%なので「すごい！」。
- 全問正解では「すごい！」ではなく、必ず「パーフェクト！」を優先する。
