import '../styles/globals.css'
import '../styles/mobile.css'
import Head from 'next/head'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '../lib/api'
import DesktopNav from '../components/DesktopNav'

const PUBLIC_PAGES = ['/login', '/register']

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const isPublicPage = PUBLIC_PAGES.includes(router.pathname)

  useEffect(() => {
    let active = true

    const currentUser = auth.getCurrentUser()
    const isAuthenticated = auth.isAuthenticated()

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

    const finalize = async () => {
      if (isAuthenticated) {
        try {
          await auth.syncSettingsToLocalStorage()
        } catch (error) {
          // Keep app usable even if settings sync fails.
        }
      }

      if (!active) {
        return
      }

      setUser(currentUser)
      setLoading(false)
    }

    finalize()

    return () => {
      active = false
    }
  }, [router.pathname])

  if (loading) {
    return (
      <>
        <Head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
          />
          <meta name="mobile-web-app-capable" content="yes" />
        </Head>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading PeptiFit...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      {!isPublicPage && (
        <DesktopNav pathname={router.pathname} user={user} />
      )}
      <div className={isPublicPage ? '' : 'lg:pl-64'}>
        <Component {...pageProps} user={user} setUser={setUser} />
      </div>
    </>
  )
}
