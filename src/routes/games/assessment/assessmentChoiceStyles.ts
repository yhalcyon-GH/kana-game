// Shared choice-button styling for the assessment question views — the
// exact same visual language (green/red reveal on answer) as Kana Quiz/
// Listening's own choice grids, factored out once since 3 of the 4
// assessment families use it.
export function assessmentChoiceClass(showResult: boolean, isCorrect: boolean): string {
  const base = 'rounded-xl border-2 px-6 py-4 text-2xl font-bold transition'
  if (!showResult) return `${base} border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800`
  return isCorrect
    ? `${base} border-green-500 bg-green-50 dark:bg-green-950`
    : `${base} border-red-500 bg-red-50 dark:bg-red-950`
}
