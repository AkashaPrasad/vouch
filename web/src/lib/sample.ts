import { api, ApiError } from './api'
import type { Watch, WatchCheckResult } from './types'

/** Built-in sample resume (kept for the optional resume panel; the sample flow saves preferences instead). */
export const SAMPLE_RESUME = `Ananya Rao
Bengaluru, Karnataka · ananya.rao.dev@example.com · github.com/ananya-rao-dev

EDUCATION
B.Tech, Computer Science and Engineering, 2022–2026
RV College of Engineering, Bengaluru · CGPA 8.4 / 10

SKILLS
Languages: TypeScript, JavaScript, Python, SQL
Frontend: React, Next.js, Tailwind CSS, Redux Toolkit
Backend: Node.js, Express, FastAPI, PostgreSQL, REST APIs
Tools: Git, Docker, Jest, Postman, AWS (EC2, S3)

EXPERIENCE
Software Engineering Intern, Razorpay (Bengaluru), May 2025 – Jul 2025
- Built React + TypeScript components for the merchant dashboard settlement view used by 4,000+ merchants.
- Added Jest and React Testing Library coverage, raising module coverage from 41% to 78%.

Backend Intern, a Bengaluru fintech startup, Dec 2024 – Feb 2025
- Wrote Node.js/Express endpoints for KYC document status and cut p95 latency 30% with PostgreSQL indexes.
- Automated a daily reconciliation report in Python (pandas) that replaced a manual spreadsheet.

PROJECTS
CampusCart: a React Native + Node.js marketplace for hostel students (600 monthly users).
JobLens: a Python scraper and FastAPI service that tags job postings by required skills.

Looking for: Software Engineer / Frontend Engineer / Full-stack Engineer (fresher), Bengaluru or remote.`

export const SAMPLE_PREFERENCES = { fields: ['Engineering'], roles: ['Software Engineer', 'Frontend Developer'], free_text: 'fresher or intern roles in Bengaluru or remote, React/Node' }

export const SAMPLE_SOURCES = ['https://careers.navi.com/', 'https://www.accenture.com/in-en/careers/jobsearch']

const PENDING = 'vouch_pending_sample'
export const setPendingSample = (v: boolean) => { try { v ? sessionStorage.setItem(PENDING, '1') : sessionStorage.removeItem(PENDING) } catch { /* ignore */ } }
export const takePendingSample = () => { try { const v = sessionStorage.getItem(PENDING) === '1'; sessionStorage.removeItem(PENDING); return v } catch { return false } }

export interface SampleResult { watch: Watch; result: WatchCheckResult | null; checkError?: string; prefsSaved: boolean }

/** Save sample preferences if the user has none, watch a sample careers page, and run the first check. */
export async function runSample(): Promise<SampleResult> {
  let prefsSaved = false
  let hasPrefs = false
  try { const p = await api.preferences(); hasPrefs = !!(p?.roles?.length || p?.fields?.length || p?.free_text?.trim()) } catch { hasPrefs = false }
  if (!hasPrefs) {
    try { await api.savePreferences(SAMPLE_PREFERENCES); prefsSaved = true } catch { /* keep going: postings still list without scores */ }
  }
  let watch: Watch | null = null
  let lastErr: unknown = null
  for (const url of SAMPLE_SOURCES) {
    try { watch = await api.createWatch(url, 'daily'); break } catch (e) {
      lastErr = e
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) break
    }
  }
  if (!watch) {
    if (lastErr instanceof ApiError && lastErr.status === 404) throw new ApiError('Watches are not available yet.', 404)
    throw lastErr instanceof Error ? lastErr : new Error('Could not create the sample watch')
  }
  try { return { watch, result: await api.checkWatch(watch.id), prefsSaved } }
  catch (e) { return { watch, result: null, checkError: e instanceof Error ? e.message : 'The first check failed', prefsSaved } }
}
