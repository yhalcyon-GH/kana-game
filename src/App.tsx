import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
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
import { AssessmentPage } from './routes/games/AssessmentPage'
import { CafePage } from './routes/games/CafePage'
import { KanaQuizPage } from './routes/games/KanaQuizPage'
import { KanaTypingPage } from './routes/games/KanaTypingPage'
import { ListeningPage } from './routes/games/ListeningPage'
import { RestaurantPage } from './routes/games/RestaurantPage'
import { TracingPage } from './routes/games/TracingPage'
import { WordBuilderPage } from './routes/games/WordBuilderPage'
import { AboutPage } from './routes/AboutPage'
import { CategoryRowsPage } from './routes/CategoryRowsPage'
import { HomePage } from './routes/HomePage'
import { LearnPage } from './routes/LearnPage'
import { PracticeHubPage } from './routes/PracticeHubPage'
import { PrivacyPage } from './routes/PrivacyPage'
import { ReviewMistakesPage } from './routes/ReviewMistakesPage'
import { ReviewPage } from './routes/ReviewPage'
import { SavedPage } from './routes/SavedPage'
import { SettingsPage } from './routes/SettingsPage'
import { ThirdPartyNoticesPage } from './routes/ThirdPartyNoticesPage'

// Compile-time guard: the PoC page, its env values and Paddle SDK are omitted
// from production builds. Keep this conditional import and the route guard.
const PaddleTestPage = import.meta.env.DEV ? lazy(() => import('./routes/PaddleTestPage')) : null

// Phase 3A PR C — same compile-time exclusion pattern as PaddleTestPage
// above. Not a production login/account/purchase UI — see
// docs/adr/0001-cross-site-auth-transport.md (production browser
// session transport is a separate, later decision) and
// docs/paddle-auth-phase3a-pr-c.md.
const AccountTestPage = import.meta.env.DEV ? lazy(() => import('./routes/AccountTestPage')) : null
const VerifyPage = import.meta.env.DEV ? lazy(() => import('./routes/VerifyPage')) : null

// Phase 3B — the production Web auth UI. Unlike PaddleTestPage/
// AccountTestPage/VerifyPage above, none of these need excluding from a
// production bundle -- LoginPage and AccountPage are always present
// (both dev and production builds). ProductionVerifyPage is also always
// imported (no module-level DEV gate, no tree-shaking need here — it's
// legitimate production code), but which one of it / the dev-only
// VerifyPage actually gets a Route registered at the shared "/verify"
// path is decided at RENDER time below via `import.meta.env.DEV`,
// mirroring the exact same live-condition pattern already used for
// PaddleTestPage/AccountTestPage/VerifyPage's own Route guards (see
// those `{import.meta.env.DEV && X && (...)}` lines) — this is what
// makes both the dev-vs-production selection testable via
// `vi.stubEnv('DEV', ...)` (a module-level `const X = import.meta.env.DEV
// ? ... : null` only ever evaluates once, at first import, and would
// never re-toggle for a later stubEnv call within the same test file)
// AND what lets a real Rollup production build dead-code-eliminate the
// dev-only VerifyPage branch (import.meta.env.DEV is statically
// replaced with `false` at build time there).
//
// Both pages render at the exact same "#/verify" route the backend
// hardcodes into every Magic Link (see MagicLinkUrlBuilder.php) — they
// are mutually exclusive by DEV/production build, never both
// registered at once, so a Magic Link always lands on the right one
// for the build that sent it.
const LoginPage = lazy(() => import('./routes/LoginPage'))
const AccountPage = lazy(() => import('./routes/AccountPage'))
const ProductionVerifyPage = lazy(() => import('./routes/ProductionVerifyPage'))

function RestaurantRoute() {
  const { checkpointId } = useParams()
  return <RestaurantPage checkpointId={checkpointId ?? 'na-row'} />
}

function CafeRoute() {
  const { checkpointId } = useParams()
  return <CafePage checkpointId={checkpointId ?? 'katakana-ha-row'} />
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-neutral-500 dark:text-neutral-400">This page isn&apos;t available.</p>
      <Link to="/" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">
        Go Home
      </Link>
    </div>
  )
}

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
              {import.meta.env.DEV && PaddleTestPage && (
                <Route path="/paddle-test" element={<Suspense fallback={<p>Loading sandbox test page…</p>}><PaddleTestPage /></Suspense>} />
              )}
              {import.meta.env.DEV && AccountTestPage && (
                <Route path="/account-test" element={<Suspense fallback={<p>Loading account test page…</p>}><AccountTestPage /></Suspense>} />
              )}
              {import.meta.env.DEV && VerifyPage && (
                <Route path="/verify" element={<Suspense fallback={<p>Loading…</p>}><VerifyPage /></Suspense>} />
              )}
              {!import.meta.env.DEV && (
                <Route path="/verify" element={<Suspense fallback={<p>Loading…</p>}><ProductionVerifyPage /></Suspense>} />
              )}
              <Route path="/login" element={<Suspense fallback={<p>Loading…</p>}><LoginPage /></Suspense>} />
              <Route path="/account" element={<Suspense fallback={<p>Loading…</p>}><AccountPage /></Suspense>} />
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
              {/* Hiragana Restaurant — standalone, repeatable, non-curriculum
                  mini-game (see routes/games/RestaurantPage.tsx). Deliberately
                  not nested under /practice/:categoryId/:rowId since it's not
                  a Recommended Path activity for any row. */}
              <Route path="/restaurant/:checkpointId" element={<RestaurantRoute />} />
              {/* Cafe — standalone, repeatable, non-curriculum mini-game
                  (routes/games/CafePage.tsx), keyed by checkpoint id rather
                  than stage since a Cafe checkpoint's pool is its own
                  spotlight dishes + a katakana-only filler pool, not a
                  script-wide stage bucket. */}
              <Route path="/cafe/:checkpointId" element={<CafeRoute />} />
              {/* Hiragana/Katakana Test (Issue #189, Phase 1) — a
                  section-endpoint assessment, not a per-row game, so it
                  gets its own top-level route keyed by script rather than
                  nesting under /practice/:categoryId/:rowId. See
                  routes/games/AssessmentPage.tsx and
                  lib/recommendedPath.ts's assessment-after-checkpoint
                  wiring. */}
              <Route path="/assessment/:script" element={<AssessmentPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/saved" element={<SavedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/third-party-notices" element={<ThirdPartyNoticesPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </GuideHighlightProvider>
  )
}

export default App
