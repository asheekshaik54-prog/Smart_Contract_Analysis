import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Shell } from '../components/layout/Shell'

const Landing = lazy(() => import('../pages/Landing'))
const Scanner = lazy(() => import('../pages/Scanner'))
const Results = lazy(() => import('../pages/Results'))
const Compare = lazy(() => import('../pages/Compare'))
const History = lazy(() => import('../pages/History'))
const Methodology = lazy(() => import('../pages/Methodology'))
const SettingsPage = lazy(() => import('../pages/Settings'))
const NotFound = lazy(() => import('../pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-muted" role="status">Loading…</p>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Landing />} /><Route path="scan" element={<Scanner />} /><Route path="results/:id" element={<Results />} />
          <Route path="compare" element={<Compare />} /><Route path="history" element={<History />} /><Route path="methodology" element={<Methodology />} />
          <Route path="settings" element={<SettingsPage />} /><Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
