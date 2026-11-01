import { Link } from 'react-router-dom'
import { ArrowRight, Bot, FileText, Search } from 'lucide-react'
import { SIGNALS } from '../lib/signals'
import { useTitle } from '../lib/useTitle'

const TOOLS = [
  { Icon: Search, name: 'TinyFish Search', body: 'Live web searches for scam reports, the company’s real domain and recruiter details.' },
  { Icon: FileText, name: 'TinyFish Fetch', body: 'Reads the company website and linked pages so we can compare them with the message.' },
  { Icon: Bot, name: 'TinyFish Agent', body: 'A browsing agent that visits the cybercrime registry, the MCA company registry and careers pages for you.' },
]

export default function How() {
  useTitle('How it works')
  return (
    <div className="container-x pt-10 sm:pt-14">
      <p className="eyebrow">How it works</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Twelve checks. One transparent score.</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Every check starts at a neutral score of 50. Risk signals add points, reassuring signals remove them. 0–29 is <span className="text-green">likely genuine</span>, 30–59 is <span className="text-amber">be careful</span>, 60–100 is <span className="text-red">high risk</span>. Asking for money always means at least “be careful”.
      </p>

      <section aria-labelledby="tools-h" className="mt-10">
        <h2 id="tools-h" className="text-lg font-semibold">TinyFish does the web work</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {TOOLS.map((t) => (
            <li key={t.name} className="card p-5">
              <t.Icon className="h-5 w-5 text-accent" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-4 font-semibold">{t.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sig-h" className="mt-10">
        <h2 id="sig-h" className="text-lg font-semibold">The 12 signals</h2>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-border text-xs text-faint sm:table-header-group">
              <tr><th scope="col" className="px-4 py-3 font-medium">Signal</th><th scope="col" className="px-4 py-3 font-medium">What we check</th><th scope="col" className="px-4 py-3 font-medium">Source</th><th scope="col" className="px-4 py-3 text-right font-medium">Weight</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SIGNALS.map((s) => (
                <tr key={s.code} className="flex flex-col gap-1 p-4 sm:table-row sm:p-0">
                  <th scope="row" className="font-medium sm:px-4 sm:py-3.5"><span className="mr-2 font-mono text-xs text-faint">{s.code}</span>{s.name}</th>
                  <td className="text-muted sm:px-4 sm:py-3.5">{s.what}</td>
                  <td className="font-mono text-xs text-faint sm:px-4 sm:py-3.5">{s.tool}</td>
                  <td className="font-mono text-xs text-muted sm:px-4 sm:py-3.5 sm:text-right">{s.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className="btn-primary h-12 px-6">Check an offer<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link>
      </div>
    </div>
  )
}
