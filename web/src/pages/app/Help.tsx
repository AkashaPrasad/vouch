import { ExternalLink } from 'lucide-react'
import { SignalTable } from '../../components/SignalTable'
import { ExampleLedger } from '../../components/ExampleLedger'
import { PageHead, Section } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'

export default function Help() {
  useTitle('Help')
  return (
    <div>
      <PageHead label="Account" title="Help" sub="How Vouch scores, and what to do if you have been scammed." />
      <Section label="Method" title="Score ledger" className="mt-6"><div className="mt-3"><ExampleLedger /></div><p className="mt-2 max-w-2xl text-sm text-muted">Start at 50. Risk signals add their weight, reassuring ones subtract. 0–29 likely genuine · 30–59 be careful · 60–100 high risk. Money asked forces at least “be careful”.</p></Section>
      <Section label="Signals" title="The 12 checks" className="mt-8"><SignalTable /></Section>
      <Section label="Got scammed?" title="Report it" className="mt-8">
        <ul className="mt-1 divide-y divide-border text-sm">
          <li className="py-3"><a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline decoration-border-strong underline-offset-4 hover:decoration-text">National Cyber Crime Reporting Portal <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /></a><p className="mt-1 text-muted">File a complaint online. Attach the message, payment proof and the Vouch link.</p></li>
          <li className="py-3"><a href="tel:1930" className="font-mono underline underline-offset-4">1930</a><p className="mt-1 text-muted">Cyber fraud helpline. Call within the first hours to improve the chance of freezing the money.</p></li>
          <li className="py-3">Contact Vouch: <a href="mailto:hello@vouch.spacesdrive.cc" className="font-mono underline underline-offset-4">hello@vouch.spacesdrive.cc</a></li>
        </ul>
      </Section>
    </div>
  )
}
