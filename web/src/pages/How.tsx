import { Link } from 'react-router-dom'
import { SignalTable } from '../components/SignalTable'
import { ExampleLedger } from '../components/ExampleLedger'
import { useTitle } from '../lib/useTitle'

const TOOLS = [
  ['TinyFish Search', 'Finds the official site, scam reports, registry pages and news for the company, phone and email.'],
  ['TinyFish Fetch', 'Reads registry pages, the careers page and any linked site as markdown so the rule engine can compare them.'],
  ['TinyFish Agent', 'Browses cybercrime.gov.in, mca.gov.in and careers portals that have no API, and reports what it found.'],
  ['TinyFish Research', 'On demand: a multi-minute dossier on the company and recruiter with sources.'],
  ['TinyFish Browser', 'Live preview of agents at work, and screenshots of the claimed site and the official careers page as visual receipts.'],
  ['TinyFish Monitor', 'Watches careers pages, ATS boards and LinkedIn company pages, and alerts you when a new posting matches what you asked for.'],
  ['RDAP · DNS · URLhaus', 'Free registries for domain age, mail records and abuse listings. No keys.'],
]

export default function How() {
  useTitle('How it scores')
  return (
    <div className="container-x pt-10">
      <p className="label">Method</p>
      <h1 className="mt-2 max-w-2xl text-[30px] font-semibold leading-tight tracking-[-0.02em]">Twelve checks. One deterministic score.</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">Every check starts at 50. Risk signals add their weight, reassuring signals subtract. The band is read off the final number: <span className="text-green">0–29 likely genuine</span>, <span className="text-amber">30–59 be careful</span>, <span className="text-red">60–100 high risk</span>. When too few checks resolve, the outcome is “could not verify” instead of a guess. Two hard rules: a money request forces at least “be careful”; money plus a lookalike or impersonated domain, a scam report or a suspect-registry hit forces “high risk”. The language model extracts and explains; its second opinion is bounded to ±25 points and never overrides a hard rule.</p>

      <section aria-labelledby="ex-h" className="mt-10">
        <div className="border-b border-border pb-2"><p className="label">Worked example</p><h2 id="ex-h" className="mt-1 text-base font-semibold">Score ledger</h2></div>
        <div className="mt-3"><ExampleLedger /></div>
      </section>

      <section aria-labelledby="sig-h" className="mt-10">
        <div className="border-b border-border pb-2"><p className="label">Signals</p><h2 id="sig-h" className="mt-1 text-base font-semibold">What each one checks</h2></div>
        <SignalTable />
      </section>

      <section aria-labelledby="hosts-h" className="mt-10">
        <div className="border-b border-border pb-2"><p className="label">Hosts</p><h2 id="hosts-h" className="mt-1 text-base font-semibold">Platforms are not companies</h2></div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Every host in a message is classified first: company domain, job board (LinkedIn, Naukri, Internshala…), social, messaging (WhatsApp, Telegram), form or doc (Google Forms, Notion), link shortener, free site builder (Wix, Blogspot, GitHub Pages…), payment link or free mail. Only a company domain is age-checked or can earn green credit. A listing that lives only on a platform, a form or a shortener is flagged, and a well-known brand name paired with the wrong domain is scored as impersonation.</p>
      </section>

      <section aria-labelledby="tools-h" className="mt-10">
        <div className="border-b border-border pb-2"><p className="label">Sources</p><h2 id="tools-h" className="mt-1 text-base font-semibold">Where the evidence comes from</h2></div>
        <table className="ledger-table">
          <tbody>{TOOLS.map(([n, d]) => <tr key={n}><td className="w-0 whitespace-nowrap pl-0 font-mono text-xs text-text">{n}</td><td className="pr-0 text-sm text-muted">{d}</td></tr>)}</tbody>
        </table>
      </section>

      <div className="mt-10 flex flex-wrap gap-2"><Link to="/app" className="btn-primary h-12 px-6">Open dashboard</Link><a href="/#how" className="btn-secondary h-12 px-6">Back to overview</a></div>
    </div>
  )
}
