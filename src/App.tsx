import { Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { ListeningPage } from './routes/games/ListeningPage'
import { WordBuilderPage } from './routes/games/WordBuilderPage'
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
          <Route path="/learn/:rowId" element={<LearnPage />} />
          <Route path="/practice/:rowId" element={<PracticeHubPage />} />
          <Route path="/practice/:rowId/word-builder" element={<WordBuilderPage />} />
          <Route path="/practice/:rowId/listening" element={<ListeningPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
