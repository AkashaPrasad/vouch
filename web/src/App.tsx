import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './lib/auth'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import Landing from './pages/Landing'
import Check from './pages/Check'
import How from './pages/How'
import Me from './pages/Me'
import NotFound from './pages/NotFound'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ScrollTop />
          <div className="flex min-h-dvh flex-col bg-bg">
            <Nav />
            <main id="main" className="flex-1">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/c/:id" element={<Check />} />
                <Route path="/how" element={<How />} />
                <Route path="/me" element={<Me />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
