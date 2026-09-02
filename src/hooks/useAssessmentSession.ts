import { useMemo, useState } from 'react'
import { getAssessmentAdvice } from '../lib/assessment/advice'
import { buildAssessmentScope } from '../lib/assessment/assessmentScope'
import { scoreAssessment } from '../lib/assessment/diagnostics'
import { buildAssessmentPlan } from '../lib/assessment/planner'
import type { AssessmentAnswer, AssessmentQuestion, AssessmentScript } from '../lib/assessment/types'

// React glue for the Hiragana/Katakana Test (Issue #189): builds one 20-
// question plan per attempt from the pure planner/scope, walks through it
// one question at a time, and scores the whole thing once every question
// has an answer. Deliberately does NOT touch Review/SRS/mastery/box state —
// see planner.ts's buildAssessmentPlan and diagnostics.ts's scoreAssessment,
// both pure and untouched by this hook beyond calling them.
export function useAssessmentSession(script: AssessmentScript) {
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => buildAssessmentScope(script), [script])
  // Rebuilt fresh (new rng draw) every attempt — Play Again gets a new plan,
  // same as every other Practice mini-game's retry. `attempt` is otherwise
  // unused inside the callback; it's a deliberate extra dep purely to force
  // a fresh plan on each retry (same idiom as the other game pages' own
  // sessionAttempt-keyed retry state, e.g. ListeningPage's sessionKey).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildAssessmentPlan(scope), [scope, attempt])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([])

  const currentQuestion: AssessmentQuestion | undefined = plan[index]
  // Finishing all ASSESSMENT_QUESTION_COUNT questions is what completes the
  // test (Issue #189: "finishing the 20-question test marks that endpoint
  // complete; score only drives diagnosis/advice") — opening the page or
  // answering only some of them must never reach this state.
  const finished = plan.length > 0 && index >= plan.length

  function submitAnswer(answer: AssessmentAnswer) {
    setAnswers((previous) => [...previous, answer])
  }

  function advance() {
    setIndex((i) => Math.min(i + 1, plan.length))
  }

  function restart() {
    setAttempt((a) => a + 1)
    setIndex(0)
    setAnswers([])
  }

  const result = finished ? scoreAssessment(script, answers) : null
  const advice = result ? getAssessmentAdvice(result) : []

  // `attempt` is exposed so callers can build a React key that changes
  // across a retake even when a question id collides with one from the
  // previous attempt (question ids are `${family}-${cursor}`, stable
  // per-position within a plan, NOT globally unique across attempts — see
  // AssessmentPage.tsx's per-question wrapper key).
  return { scope, plan, currentQuestion, index, total: plan.length, answers, finished, result, advice, attempt, submitAnswer, advance, restart }
}
