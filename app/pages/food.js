import Link from 'next/link'

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/meals',
      permanent: false
    }
  }
}

export default function FoodPageRedirect() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-white">
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 text-center">
        <h1 className="text-lg font-semibold">Food diary moved</h1>
        <p className="mt-2 text-sm text-gray-400">Redirecting to Meals.</p>
        <Link href="/meals" className="mt-4 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black">
          Open Meals
        </Link>
      </div>
    </div>
  )
}
