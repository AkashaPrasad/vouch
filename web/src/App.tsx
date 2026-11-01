import { useEffect } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './lib/auth'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { AppShell } from './components/app/AppShell'
import Landing from './pages/Landing'
import Check from './pages/Check'
import How from './pages/How'
import NotFound from './pages/NotFound'
import Overview from './pages/app/Overview'
import NewCheck from './pages/app/NewCheck'
import Checks from './pages/app/Checks'
import Research from './pages/app/Research'
import Watches from './pages/app/Watches'
import SettingsPage from './pages/app/SettingsPage'
import Billing from './pages/app/Billing'
import Help from './pages/app/Help'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
function Marketing() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Nav />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  )
}
function applyStoredTheme() {
  try { document.documentElement.dataset.theme = localStorage.getItem('vouch_theme_v2') === 'dark' ? 'dark' : 'light' } catch { document.documentElement.dataset.theme = 'light' }
}

export default function App() {
  useEffect(applyStoredTheme, [])
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ScrollTop />
          <Routes>
            <Route element={<Marketing />}>
              <Route path="/" element={<Landing />} />
              <Route path="/how" element={<How />} />
              <Route path="/c/:id" element={<Check />} />
              <Route path="/me" element={<Checks />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="new" element={<NewCheck />} />
              <Route path="checks" element={<Checks />} />
              <Route path="c/:id" element={<Check />} />
              <Route path="research" element={<Research />} />
              <Route path="watches" element={<Watches />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="billing" element={<Billing />} />
              <Route path="help" element={<Help />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
