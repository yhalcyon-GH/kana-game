import { useEffect, useMemo, useState } from 'react'
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
  const [answers, setAnswers] = useState<boolean[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const { speak, supported } = useTTS()
  const question = plan.questions[index]
  const finished = answers.length === plan.questions.length

  const answer = (choice: string) => {
    if (selected) return
    const correct = choice === question.correct
    setSelected(choice)
    setAnswers((current) => [...current, correct])
    if (correct) window.setTimeout(() => { setSelected(null); setIndex((current) => current + 1) }, 900)
  }

  const correct = answers.filter(Boolean).length
  useEffect(() => {
    if (finished) markCompleted('sokuon-chouon', { correct, total: 20 })
  }, [correct, finished, markCompleted])

  if (finished) {
    return <div className="flex w-full flex-col items-center gap-5 text-center"><h1 className="text-2xl font-bold">Sokuon / Chōon Test complete!</h1><p className="text-2xl font-bold">{correct} / 20</p><p>{Math.round(correct / 20 * 100)}%</p><Link to="/youon" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white">Continue</Link></div>
  }

  return <div className="flex w-full flex-col items-center gap-6" data-testid="sound-length-assessment">
    <div className="flex w-full items-center gap-3"><Link to="/other" className="rounded-full border px-4 py-1.5 text-sm">← Back</Link><p className="text-sm text-neutral-500">Question {index + 1} / 20</p></div>
    <button type="button" onClick={() => speak(`words/${question.word.id}`, question.word.audioText ?? question.word.kana)} className="rounded-full bg-neutral-100 px-5 py-3 text-lg">🔊 {supported ? 'Play audio' : 'Audio'}</button>
    <p className="font-kana text-5xl font-bold" data-testid="sound-length-prompt">{question.prompt}</p>
    <div className="grid w-full max-w-md grid-cols-3 gap-3">{question.choices.map((choice) => <button key={choice} type="button" disabled={!!selected} onClick={() => answer(choice)} className={`rounded-xl border-2 px-4 py-4 font-kana text-3xl font-bold ${selected === choice ? (choice === question.correct ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-neutral-300'}`}>{choice}</button>)}</div>
    {selected && <div className="w-full max-w-md rounded-2xl border p-4 text-center"><p className="font-kana text-3xl"><WordReveal question={question} /></p><WordImage word={question.word} className="mx-auto mt-2 h-20 w-20" /><p>{question.word.romaji} · {question.word.meaning}</p>{selected !== question.correct && <button type="button" onClick={() => { setSelected(null); setIndex((current) => current + 1) }} className="mt-3 rounded-full bg-blue-600 px-5 py-2 font-semibold text-white">Next</button>}</div>}
  </div>
}

function WordReveal({ question }: { question: SoundLengthQuestion }) { return <>{question.word.kana} <span className="font-sans text-base">({question.correct})</span></> }
