import { Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GuideHighlightProvider } from './components/GuideHighlightProvider'
import { IntroGuide } from './components/IntroGuide'
import { NavBar } from './components/NavBar'
import {
  CATEGORIES,
  CATEGORIES_BY_ID,
  DEFAULT_CATEGORY_ID,
  KATAKANA_CATEGORY_ID,
  SPECIAL_KATAKANA_CATEGORY_ID,
  YOUON_CATEGORY_ID,
} from './data/curriculum'
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
import { SavedPage } from './routes/SavedPage'
import { SettingsPage } from './routes/SettingsPage'

// Every category that isn't hiragana/katakana/yōon/special-katakana gets
// bundled into one 'そのほか' page rather than a new top-level page per
// category — computed from CATEGORIES so a future category just appears
// here automatically once its branch merges, no route change needed. 拗音
// gets its own dedicated page (below) rather than joining this bundle, at
// the user's explicit request: it has enough rows ("セッションがたくさんあ
// る") to deserve one. Special Katakana is excluded the same way — it's
// bundled onto the SAME /youon page as a continuation of Yōon, not here.
const OTHER_CATEGORY_IDS = CATEGORIES.map((c) => c.id).filter(
  (id) =>
    id !== DEFAULT_CATEGORY_ID && id !== KATAKANA_CATEGORY_ID && id !== YOUON_CATEGORY_ID && id !== SPECIAL_KATAKANA_CATEGORY_ID,
)

function App() {
  useTrackLastStudied()
  return (
    <GuideHighlightProvider>
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
                    description="Learn hiragana with everyday words."
                    categoryIds={[DEFAULT_CATEGORY_ID]}
                    askTamamizuKanaIntroVariant="hiragana"
                  />
                }
              />
              <Route
                path="/katakana"
                element={
                  <CategoryRowsPage
                    title="カタカナ"
                    description="Learn katakana with everyday words."
                    categoryIds={[KATAKANA_CATEGORY_ID]}
                    askTamamizuKanaIntroVariant="katakana"
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
                    description="Learn small ゃゅょ sounds like きゃ / kya."
                    // Special Katakana (ファ/ティ/シェ/...) is presented as a
                    // continuation of this SAME page, right after Yōon — see
                    // curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID. Bundling
                    // its rows on here (not a new top-level page/NavBar
                    // entry) mirrors exactly how '/other' bundles Sokuon +
                    // Chōon below.
                    categoryIds={[YOUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID]}
                  />
                }
              />
              <Route
                path="/other"
                element={
                  <CategoryRowsPage
                    title="っ・ー"
                    description="Learn small っ/ッ and long vowel ー."
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
              <Route path="/saved" element={<SavedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </GuideHighlightProvider>
  )
}

export default App
