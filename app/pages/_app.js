import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '../lib/api'

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const currentUser = auth.getCurrentUser()
    const isAuthenticated = auth.isAuthenticated()

    const publicPages = ['/login', '/register']
    const isPublicPage = publicPages.includes(router.pathname)

    // If a redirect is required, fire it and keep the loading spinner visible
    // until the new route mounts. This prevents the target page component
    // from rendering (and calling its hooks) before the navigation completes,
    // which was causing React error #310 "Rendered more hooks than during the
    // previous render" — LandingDashboard briefly rendered all 14 of its hooks
    // at the same moment as the unauthenticated redirect, creating a hook-count
    // mismatch that crashed React 18's concurrent renderer.
    if (!isAuthenticated && !isPublicPage) {
      router.push('/login')
      return
    }

    if (isAuthenticated && isPublicPage) {
      router.push('/')
      return
    }

    // No redirect needed — the user belongs on this page. Reveal it.
    setUser(currentUser)
    setLoading(false)
  }, [router.pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading PeptiFit...</p>
        </div>
      </div>
    )
  }

  return <Component {...pageProps} user={user} setUser={setUser} />
}
