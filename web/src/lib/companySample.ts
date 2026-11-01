import type { CompanyReport } from './companyTypes'

/** Built-in demo report for a FICTIONAL company. Shown only when GET /api/company-research/sample is unavailable,
 *  so the page layout can be seen offline. All quotes and links are illustrative (example.com). */
const u = (p: string) => `https://example.com/demo/${p}`
export const DEMO_REPORT: CompanyReport = {
  company: 'Northwind Labs (demo)',
  website: 'https://example.com',
  as_of: '2026-10-28',
  overall: {
    verdict_text: 'Employees describe strong peer teams and learning, with recurring concerns about long hours near launches and one round of layoffs in 2025. Compensation is reported as roughly at market for engineers, below market for support roles.',
    score_0_100: 62,
    confidence: 'medium',
  },
  dimensions: [
    { key: 'culture', label: 'Culture', score_0_100: 71, summary: 'Collaborative teams and approachable seniors are the most common theme; some describe politics in larger orgs.', evidence: [
      { quote: 'My team is genuinely helpful, people review your PRs the same day and nobody makes you feel stupid for asking.', source_url: u('reddit/1'), platform: 'reddit', sentiment: 'positive', date: '2026-08-14' },
      { quote: 'Good culture at the team level, but the org above that is very political.', source_url: u('ambitionbox/1'), platform: 'ambitionbox', sentiment: 'mixed', date: '2026-07-02' },
      { quote: 'Friendly people, flexible about remote days.', source_url: u('glassdoor/1'), platform: 'glassdoor', sentiment: 'positive', date: '2026-05-21' },
      { quote: 'Credit for wins goes up the chain, blame comes down.', source_url: u('blind/1'), platform: 'blind', sentiment: 'negative', date: '2026-04-11' },
      { quote: 'Hackathons and internal demos are a real part of the culture, not just a slide.', source_url: u('linkedin/1'), platform: 'linkedin', sentiment: 'positive' },
    ] },
    { key: 'work_life_balance', label: 'Work-life balance', score_0_100: 44, summary: 'Usually reasonable, but several reports describe 60-hour weeks before major releases.', evidence: [
      { quote: 'Normal weeks are fine. Launch months are brutal, weekends included.', source_url: u('reddit/2'), platform: 'reddit', sentiment: 'mixed', date: '2026-09-03' },
      { quote: 'Work life balance is poor in the payments team. Late night calls are common.', source_url: u('ambitionbox/2'), platform: 'ambitionbox', sentiment: 'negative', date: '2026-06-18' },
      { quote: 'My manager actively stops us from working weekends.', source_url: u('glassdoor/2'), platform: 'glassdoor', sentiment: 'positive', date: '2026-03-30' },
    ] },
    { key: 'compensation', label: 'Compensation', score_0_100: 58, summary: 'Engineers report pay near market; support and operations roles report below-market pay and small hikes.', evidence: [
      { quote: 'Base is competitive for SDE-2, ESOPs are the weak part.', source_url: u('blind/2'), platform: 'blind', sentiment: 'mixed', date: '2026-08-01' },
      { quote: 'Appraisal hikes were 4 to 6 percent this year for most of support.', source_url: u('ambitionbox/3'), platform: 'ambitionbox', sentiment: 'negative', date: '2026-05-09' },
    ] },
    { key: 'management', label: 'Management', score_0_100: 55, summary: 'Experience depends heavily on the team; frequent manager changes are mentioned.', evidence: [
      { quote: 'Had three managers in eighteen months. Each one reset the roadmap.', source_url: u('glassdoor/3'), platform: 'glassdoor', sentiment: 'negative', date: '2026-07-22' },
      { quote: 'Skip-level meetings actually happen and feedback is acted on.', source_url: u('reddit/3'), platform: 'reddit', sentiment: 'positive', date: '2026-02-17' },
    ] },
    { key: 'stability_layoffs', label: 'Stability and layoffs', score_0_100: 40, summary: 'One reported layoff round in 2025 and a hiring freeze in early 2026; no reports since.', evidence: [
      { quote: 'Around 8 percent of staff were let go, mostly in the hardware unit.', source_url: u('news/1'), platform: 'news', sentiment: 'negative', date: '2025-11-12' },
      { quote: 'Severance was fair, two months plus insurance till year end.', source_url: u('x/1'), platform: 'x', sentiment: 'mixed', date: '2025-11-14' },
    ] },
    { key: 'freshers_treatment', label: 'Treatment of freshers', score_0_100: 68, summary: 'Structured onboarding and mentorship are praised; bond clauses are not reported.', evidence: [
      { quote: 'Six-week bootcamp for new grads, then a buddy for the first quarter.', source_url: u('linkedin/2'), platform: 'linkedin', sentiment: 'positive', date: '2026-06-30' },
      { quote: 'Freshers get real tickets from week two, which I liked.', source_url: u('reddit/4'), platform: 'reddit', sentiment: 'positive', date: '2026-01-25' },
    ] },
    { key: 'growth', label: 'Growth', score_0_100: 63, summary: 'Internal moves are common; promotion cycles are described as slow but transparent.', evidence: [
      { quote: 'Switched teams internally without any drama after a year.', source_url: u('glassdoor/4'), platform: 'glassdoor', sentiment: 'positive', date: '2026-04-04' },
      { quote: 'Promotion took two cycles even with good ratings.', source_url: u('blind/3'), platform: 'blind', sentiment: 'negative', date: '2026-03-12' },
    ] },
    { key: 'hiring_process', label: 'Hiring process', score_0_100: null, summary: 'Too few recent reports to score. The official careers page lists four interview rounds.', evidence: [
      { quote: 'Our process: recruiter call, technical screen, onsite loop, and a team-match conversation.', source_url: u('official/careers'), platform: 'official', sentiment: 'mixed' },
    ] },
  ],
  layoffs_timeline: [
    { date: '2025-11-12', what: 'About 8 percent of staff laid off, concentrated in the hardware unit.', source_url: u('news/1') },
    { date: '2026-02-01', what: 'Hiring freeze announced for non-engineering roles; lifted in May.', source_url: u('news/2') },
  ],
  red_flags: [
    { text: 'Repeated reports of weekend work before launches in the payments team.', source_url: u('ambitionbox/2') },
    { text: 'Frequent manager turnover mentioned across platforms.', source_url: u('glassdoor/3') },
  ],
  green_flags: [
    { text: 'Structured onboarding and mentorship for new graduates.', source_url: u('linkedin/2') },
    { text: 'Severance described as fair during the 2025 layoff.', source_url: u('x/1') },
    { text: 'Internal team moves reported as easy.', source_url: u('glassdoor/4') },
  ],
  platforms_covered: [
    { platform: 'reddit', items: 14, reachable: true, note: 'Threads from 3 subreddits' },
    { platform: 'ambitionbox', items: 22, reachable: true, note: 'Reviews from the last 12 months' },
    { platform: 'glassdoor', items: 6, reachable: false, note: 'Login wall after the first page; partial coverage' },
    { platform: 'blind', items: 5, reachable: false, note: 'Most posts require sign in' },
    { platform: 'x', items: 3, reachable: true, note: 'Public posts only' },
    { platform: 'linkedin', items: 4, reachable: false, note: 'Public posts only; profiles login-walled' },
    { platform: 'news', items: 4, reachable: true, note: 'Two outlets' },
    { platform: 'official', items: 2, reachable: true, note: 'Careers page and press room' },
  ],
  sources: [
    { title: 'Thread: honest review of working here?', url: u('reddit/1'), platform: 'reddit' },
    { title: 'Employee reviews (2026)', url: u('ambitionbox/1'), platform: 'ambitionbox' },
    { title: 'Company reviews, page 1', url: u('glassdoor/1'), platform: 'glassdoor' },
    { title: 'Post: comp and ESOPs discussion', url: u('blind/2'), platform: 'blind' },
    { title: 'Report: hardware unit layoffs', url: u('news/1'), platform: 'news' },
    { title: 'Careers: how we hire', url: u('official/careers'), platform: 'official' },
  ],
}
