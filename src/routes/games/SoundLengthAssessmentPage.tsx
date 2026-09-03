import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { WordImage } from '../../components/WordImage'
import { useTTS } from '../../hooks/useTTS'
import { buildSoundLengthAssessmentPlan, createSoundLengthRng, type SoundLengthQuestion } from '../../lib/soundLengthAssessmentPlan'
import { useProgressStore } from '../../store/progressStore'
import { WORDS_BY_ROW } from '../../data/words'

export function SoundLengthAssessmentPage() {
  const markCompleted = useProgressStore((state) => state.markAssessmentCompleted)
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const words = useMemo(() => Object.entries(WORDS_BY_ROW).filter(([rowId]) => rowId === 'sokuon-row' || rowId.startsWith('chouon-')).flatMap(([, rowWords]) => rowWords), [])
  const plan = useMemo(() => buildSoundLengthAssessmentPlan(words, createSoundLengthRng(seed)), [seed, words])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<{ question: SoundLengthQuestion; correct: boolean }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const { speak, supported } = useTTS()
  const question = plan.questions[index]
  const finished = answers.length === plan.questions.length
  const playedQuestionRef = useRef<string | null>(null)

  const answer = (choice: string) => {
    if (selected) return
    const correct = choice === question.correct
    setSelected(choice)
    setAnswers((current) => [...current, { question, correct }])
    if (correct) window.setTimeout(() => { setSelected(null); setIndex((current) => current + 1) }, 900)
  }

  const correct = answers.filter((answer) => answer.correct).length
  useEffect(() => {
    if (!question || playedQuestionRef.current === `${index}:${question.word.id}`) return
    playedQuestionRef.current = `${index}:${question.word.id}`
    speak(`words/${question.word.id}`, question.word.audioText ?? question.word.kana)
  }, [index, question, speak])
  useEffect(() => {
    if (finished) markCompleted('sokuon-chouon', { correct, total: 20 })
  }, [correct, finished, markCompleted])

  if (finished) {
    const mistakes = answers.filter((answer) => !answer.correct)
    return <div className="flex w-full flex-col items-center gap-5 text-center">
      <h1 className="text-2xl font-bold">Sokuon / Chōon Test complete!</h1>
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-neutral-900"><p className="text-4xl font-bold">{Math.round(correct / 20 * 100)}%</p><p className="mt-1 text-lg font-semibold">{correct} / 20 correct</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"><div className="h-full bg-blue-600" style={{ width: `${correct / 20 * 100}%` }} /></div></div>
      {mistakes.length > 0 && <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left dark:border-neutral-700 dark:bg-neutral-900"><h2 className="font-bold">Missed this round</h2><ul className="mt-2 space-y-1">{[...new Map(mistakes.map((answer) => [answer.question.word.id, answer])).values()].map((answer) => <li key={answer.question.word.id}><span className="font-kana">{answer.question.word.kana}</span> — {answer.question.correct}</li>)}</ul></div>}
      <div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={() => { setIndex(0); setAnswers([]); setSelected(null); playedQuestionRef.current = null }} className="rounded-full border px-6 py-2 font-semibold">Play Again</button><Link to="/youon" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white">Continue</Link><Link to="/other" className="rounded-full border px-6 py-2 font-semibold">Back</Link></div>
    </div>
  }

  return <div className="flex w-full flex-col items-center gap-6" data-testid="sound-length-assessment">
    <div className="flex w-full items-center gap-3"><Link to="/other" className="rounded-full border px-4 py-1.5 text-sm">← Back</Link><p className="text-sm text-neutral-500">Question {index + 1} / 20</p></div>
    <button type="button" onClick={() => speak(`words/${question.word.id}`, question.word.audioText ?? question.word.kana)} className="rounded-full bg-neutral-100 px-5 py-3 text-lg">🔊 {supported ? 'Replay audio' : 'Audio'}</button>
    <p className="font-kana text-5xl font-bold" data-testid="sound-length-prompt">{question.prompt}</p>
    <div className="grid w-full max-w-md grid-cols-3 gap-3">{question.choices.map((choice) => <button key={choice} type="button" disabled={!!selected} onClick={() => answer(choice)} className={`rounded-xl border-2 px-4 py-4 font-kana text-3xl font-bold ${selected === choice ? (choice === question.correct ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-neutral-300'}`}>{choice}</button>)}</div>
    {selected && <div className="w-full max-w-md rounded-2xl border p-4 text-center"><p className="font-kana text-3xl"><WordReveal question={question} /></p><WordImage word={question.word} className="mx-auto mt-2 h-20 w-20" /><p>{question.word.romaji} · {question.word.meaning}</p>{selected !== question.correct && <button type="button" onClick={() => { setSelected(null); setIndex((current) => current + 1) }} className="mt-3 rounded-full bg-blue-600 px-5 py-2 font-semibold text-white">Next</button>}</div>}
  </div>
}

function WordReveal({ question }: { question: SoundLengthQuestion }) { return <>{question.word.kana} <span className="font-sans text-base">({question.correct})</span></> }
