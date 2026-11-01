import { CheckForm } from '../../components/CheckForm'
import { PageHead } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'
export default function NewCheck() {
  useTitle('New check')
  return (
    <div className="max-w-3xl">
      <PageHead label="Run" title="New check" sub="Paste the message, offer letter or link. Twelve checks run in parallel; a first verdict usually lands within 30 seconds." />
      <div className="mt-5"><CheckForm /></div>
    </div>
  )
}
