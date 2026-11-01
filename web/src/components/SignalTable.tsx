import { Bot } from 'lucide-react'
import { SIGNALS } from '../lib/signals'

/** Static reference table of the 12 signals (landing + /how). */
export function SignalTable({ withWhat = true }: { withWhat?: boolean }) {
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th scope="col" className="pl-0">Code</th>
          <th scope="col">Signal</th>
          {withWhat && <th scope="col" className="hidden md:table-cell">What is checked</th>}
          <th scope="col" className="hidden sm:table-cell">Source</th>
          <th scope="col" className="pr-0 text-right">Weight</th>
        </tr>
      </thead>
      <tbody>
        {SIGNALS.map((s) => (
          <tr key={s.code}>
            <td className="w-0 whitespace-nowrap pl-0 font-mono text-xs text-muted">{s.code}</td>
            <td>
              <span className="font-medium text-text">{s.name}</span>{s.agent && <Bot className="ml-2 inline h-3.5 w-3.5 text-faint" strokeWidth={1.5} aria-label="browsing agent" />}
              {withWhat && <p className="mt-0.5 text-sm text-muted md:hidden">{s.what}</p>}
            </td>
            {withWhat && <td className="hidden text-sm text-muted md:table-cell">{s.what}</td>}
            <td className="hidden whitespace-nowrap font-mono text-[11px] text-faint sm:table-cell">{s.tool}</td>
            <td className="whitespace-nowrap pr-0 text-right font-mono text-xs tnum text-muted">{s.range}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
