import { Link } from 'react-router-dom'
import { useTitle } from '../lib/useTitle'
export default function NotFound() {
  useTitle('Page not found')
  return (
    <div className="container-x py-24 text-center">
      <p className="font-mono text-sm text-faint">404</p>
      <h1 className="mt-2 text-2xl font-semibold">This page doesn’t exist</h1>
      <Link to="/" className="btn-primary mt-6">Check an offer</Link>
    </div>
  )
}
