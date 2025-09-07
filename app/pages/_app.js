import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '../lib/api'

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if user is authenticated on app load
    const currentUser = auth.getCurrentUser()
    const isAuthenticated = auth.isAuthenticated()
    
    setUser(currentUser)
    setLoading(false)

    // Redirect logic
    const publicPages = ['/login', '/register']
    const isPublicPage = publicPages.includes(router.pathname)

    if (!isAuthenticated && !isPublicPage) {
      router.push('/login')
    } else if (isAuthenticated && isPublicPage) {
      router.push('/')
    }
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
