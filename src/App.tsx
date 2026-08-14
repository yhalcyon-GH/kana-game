import { Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { REVIEW_SCOPE_ID } from './hooks/useCurriculum'
import { KanaQuizPage } from './routes/games/KanaQuizPage'
import { KanaTypingPage } from './routes/games/KanaTypingPage'
import { ListeningPage } from './routes/games/ListeningPage'
import { TracingPage } from './routes/games/TracingPage'
import { WordBuilderPage } from './routes/games/WordBuilderPage'
import { AboutPage } from './routes/AboutPage'
import { HomePage } from './routes/HomePage'
import { LearnPage } from './routes/LearnPage'
import { PracticeHubPage } from './routes/PracticeHubPage'
import { ReviewPage } from './routes/ReviewPage'
import { SettingsPage } from './routes/SettingsPage'

function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <NavBar />
      <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
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
          <Route path="/practice/review/word-builder" element={<WordBuilderPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/listening" element={<ListeningPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/practice/review/kana-typing" element={<KanaTypingPage rowIdOverride={REVIEW_SCOPE_ID} />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
