import { Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { IntroGuide } from './components/IntroGuide'
import { NavBar } from './components/NavBar'
import { CATEGORIES, CATEGORIES_BY_ID, DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID, YOUON_CATEGORY_ID } from './data/curriculum'
import { REVIEW_SCOPE_ID } from './hooks/useCurriculum'
import { useTrackLastStudied } from './hooks/useTrackLastStudied'
import { KanaQuizPage } from './routes/games/KanaQuizPage'
import { KanaTypingPage } from './routes/games/KanaTypingPage'
import { ListeningPage } from './routes/games/ListeningPage'
import { TracingPage } from './routes/games/TracingPage'
import { WordBuilderPage } from './routes/games/WordBuilderPage'
import { AboutPage } from './routes/AboutPage'
import { CategoryRowsPage } from './routes/CategoryRowsPage'
import { HomePage } from './routes/HomePage'
import { LearnPage } from './routes/LearnPage'
import { PracticeHubPage } from './routes/PracticeHubPage'
import { ReviewMistakesPage } from './routes/ReviewMistakesPage'
import { ReviewPage } from './routes/ReviewPage'
import { SettingsPage } from './routes/SettingsPage'

// Every category that isn't hiragana/katakana/yōon gets bundled into one
// 'そのほか' page rather than a new top-level page per category — computed
// from CATEGORIES so a future category just appears here automatically once
// its branch merges, no route change needed. 拗音 gets its own dedicated
// page (below) rather than joining this bundle, at the user's explicit
// request: it has enough rows ("セッションがたくさんある") to deserve one.
const OTHER_CATEGORY_IDS = CATEGORIES.map((c) => c.id).filter(
  (id) => id !== DEFAULT_CATEGORY_ID && id !== KATAKANA_CATEGORY_ID && id !== YOUON_CATEGORY_ID,
)

function App() {
  useTrackLastStudied()
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <IntroGuide />
      <NavBar />
      <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-8">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/hiragana"
            element={
              <CategoryRowsPage
                title="ひらがな"
                description="Learn hiragana one row at a time, paired with real everyday words."
                categoryIds={[DEFAULT_CATEGORY_ID]}
              />
            }
          />
          <Route
            path="/katakana"
            element={
              <CategoryRowsPage
                title="カタカナ"
                description="Learn katakana one row at a time, paired with real everyday words."
                categoryIds={[KATAKANA_CATEGORY_ID]}
              />
            }
          />
          <Route
            path="/youon"
            element={
              <CategoryRowsPage
                // Kanji-free title (拗音's real name) — the target audience
                // may not read any kana yet, let alone kanji, see
                // ScriptCategory.displayLabel's comment.
                title={CATEGORIES_BY_ID[YOUON_CATEGORY_ID].displayLabel!}
                description="Contracted sounds like きゃ/kya — one row per consonant group, hiragana then katakana."
                categoryIds={[YOUON_CATEGORY_ID]}
              />
            }
          />
          <Route
            path="/other"
            element={
              <CategoryRowsPage
                title="っ＆ー"
                description="Two special marks: っ/ッ (a short pause) and ー (a long vowel)."
                categoryIds={OTHER_CATEGORY_IDS}
              />
            }
          />
          <Route path="/learn/:categoryId/:rowId" element={<LearnPage />} />
          <Route path="/practice/:categoryId/:rowId" element={<PracticeHubPage />} />
          <Route path="/practice/:categoryId/:rowId/word-builder" element={<WordBuilderPage />} />
          <Route path="/practice/:categoryId/:rowId/listening" element={<ListeningPage />} />
          <Route path="/practice/:categoryId/:rowId/kana-quiz" element={<KanaQuizPage />} />
          <Route path="/practice/:categoryId/:rowId/kana-typing" element={<KanaTypingPage />} />
          <Route path="/practice/:categoryId/:rowId/tracing" element={<TracingPage />} />
          {/* Review mixes every taught row across every category, so it
              deliberately does NOT nest under :categoryId — see
              REVIEW_SCOPE_ID in hooks/useCurriculum.ts. Each page component
              gets REVIEW_SCOPE_ID via a rowIdOverride prop instead of a
              route param here. */}
          <Route path="/practice/review" element={<PracticeHubPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/learn-chars" element={<ReviewMistakesPage kind="chars" />} />
          <Route path="/practice/review/learn-words" element={<ReviewMistakesPage kind="words" />} />
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/kana-typing" element={<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
