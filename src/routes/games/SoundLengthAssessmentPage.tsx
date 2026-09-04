import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AssessmentScoreVisual } from '../../components/AssessmentScoreVisual'
import { WordImage } from '../../components/WordImage'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
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
  const [finished, setFinished] = useState(false)
  const { speak, supported } = useTTS()
  const { mood, onCorrect, onWrong, clear, resetSession } = useAnswerFeedback(20)
  const question = plan.questions[index]
  const playedQuestionRef = useRef<string | null>(null)

  const answer = (choice: string) => {
    if (selected) return
    const correct = choice === question.correct
    setSelected(choice)
    setAnswers((current) => [...current, { question, correct }])
    if (correct) onCorrect()
    else onWrong({ id: question.word.id, kana: question.word.kana, romaji: question.word.romaji })
  }

  const advance = () => {
    clear()
    if (index + 1 < plan.questions.length) {
      setSelected(null)
      setIndex((current) => current + 1)
      return
    }
    const correct = answers.filter((answer) => answer.correct).length
    markCompleted('sokuon-chouon', { correct, total: plan.questions.length })
    setFinished(true)
  }

  const correct = answers.filter((answer) => answer.correct).length
  useEffect(() => {
    if (!question || playedQuestionRef.current === `${index}:${question.word.id}`) return
    playedQuestionRef.current = `${index}:${question.word.id}`
    speak(`words/${question.word.id}`, question.word.audioText ?? question.word.kana)
  }, [index, question, speak])
  if (finished) {
    const mistakes = answers.filter((answer) => !answer.correct)
    return <div className="flex w-full flex-col items-center gap-5 text-center">
      <h1 className="text-2xl font-bold">Stop &amp; Long Sound Test complete!</h1>
      <AssessmentScoreVisual correct={correct} total={plan.questions.length} />
      {mistakes.length > 0 && <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left dark:border-neutral-700 dark:bg-neutral-900"><h2 className="font-bold">Missed this round</h2><ul className="mt-2 flex min-w-0 flex-col gap-1" data-testid="assessment-mistake-list">{[...new Map(mistakes.map((answer) => [answer.question.word.id, answer])).values()].map((answer) => <li key={answer.question.word.id} className="flex min-w-0 flex-wrap justify-between gap-x-3 text-neutral-600 dark:text-neutral-400"><span className="font-kana break-all font-semibold text-neutral-800 dark:text-neutral-200">{answer.question.word.kana}</span><span className="break-all">{answer.question.word.romaji}</span></li>)}</ul></div>}
      <div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={() => { setIndex(0); setAnswers([]); setSelected(null); setFinished(false); playedQuestionRef.current = null; resetSession() }} className="rounded-full border px-6 py-2 font-semibold">Play Again</button><Link to="/youon" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white">Continue</Link><Link to="/other" className="rounded-full border px-6 py-2 font-semibold">Back</Link></div>
    </div>
  }

  return <div className="flex w-full flex-col items-center gap-6" data-testid="sound-length-assessment">
    <div className="flex w-full items-center gap-3"><Link to="/other" className="rounded-full border px-4 py-1.5 text-sm">← Back</Link><p className="text-sm text-neutral-500">Question {index + 1} / 20</p></div>
    <button type="button" onClick={() => speak(`words/${question.word.id}`, question.word.audioText ?? question.word.kana)} className="rounded-full bg-neutral-100 px-5 py-3 text-lg">🔊 {supported ? 'Replay audio' : 'Audio'}</button>
    <SoundLengthPrompt prompt={question.prompt} />
    <div className="grid w-full max-w-md grid-cols-3 gap-3">{question.choices.map((choice) => <button key={choice} type="button" disabled={!!selected} onClick={() => answer(choice)} className={`rounded-xl border-2 px-4 py-4 font-kana text-3xl font-bold ${selected === choice ? (choice === question.correct ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-neutral-300'}`}>{choice}</button>)}</div>
    {selected && <div className="w-full max-w-md rounded-2xl border p-4 text-center"><p className="font-kana text-3xl"><WordReveal question={question} /></p><WordImage word={question.word} className="mx-auto mt-2 h-20 w-20" /><p>{question.word.romaji} · {question.word.meaning}</p></div>}
    <AnswerFeedbackRow mood={mood} showNext={selected !== null} onNext={advance} />
  </div>
}

function WordReveal({ question }: { question: SoundLengthQuestion }) {
  const characters = [...question.word.kana]
  if (question.correct === '×') return <span data-testid="sound-length-word-reveal">{question.word.kana}</span>
  return <span data-testid="sound-length-word-reveal">
    {characters.slice(0, question.blankIndex).join('')}
    <span className="text-red-600 dark:text-red-400" data-testid="sound-length-correct-character">{characters[question.blankIndex]}</span>
    {characters.slice(question.blankIndex + 1).join('')}
  </span>
}

function SoundLengthPrompt({ prompt }: { prompt: string }) {
  const [before, after = ''] = prompt.split('□')
  return <p className="max-w-full break-all font-kana text-5xl font-bold" data-testid="sound-length-prompt">{before}<span className="mx-1 inline-flex h-[1.05em] min-w-[0.9em] align-[-0.12em] rounded-lg border-2 border-dashed border-amber-500 bg-amber-50 shadow-inner dark:bg-amber-950/40" data-testid="sound-length-blank" aria-label="blank" />{after}</p>
}
