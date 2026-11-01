import { Link } from 'react-router-dom'
import { useTitle } from '../lib/useTitle'
export default function NotFound() {
  useTitle('Page not found')
  return (
    <div className="container-x py-24">
      <p className="label">404</p>
      <h1 className="mt-2 text-xl font-semibold">This page doesn’t exist</h1>
      <Link to="/app" className="btn-primary mt-6">Open dashboard</Link>
    </div>
  )
}
