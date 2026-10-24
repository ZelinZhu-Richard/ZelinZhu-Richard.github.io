// The /now/ page data. Edit this file to update the page, then rebuild.
// Bracketed text like '[current topic]' is a placeholder and renders as-is.
//
// courses[].status: 'enrolled' | 'sitting-in' | 'auditing' | 'self-study'
// courses[].statusNote: optional chip suffix, e.g. '8 h/wk' -> "Self-study · 8 h/wk"
// courses[].labels: optional { now, next } to rename the "now →" / "next →" lines
// milestones[].state: 'done' | 'next' | 'upcoming' (at most one 'next'; it shows NEXT in the date column)
// milestones[].label: free text for the date column ('Sep 2026', 'Dec 9–13', 'Spring 2027')
// milestones[].review: optional true on an 'upcoming' item that is under review (accent-outlined dot)
// milestones[].date: optional strict 'YYYY-MM' or 'YYYY-MM-DD'; dated items must be in chronological order
export const NOW = {
  updated: '2026-10-24',
  currently: ['MATH 347', 'ILO prep', 'qbench preprint'],
  term: { label: 'Fall', emphasis: '2026' },
  courses: [
    {
      title: 'MATH 347 — Linear Algebra for Applications',
      status: 'enrolled',
      where: 'UNC Chapel Hill',
      note: 'My one official UNC course this fall.',
      now: '[current topic]',
      next: '[next topic]',
    },
    {
      title: 'MATH 233 — Calculus of Functions of Several Variables',
      status: 'sitting-in',
      where: 'UNC Chapel Hill',
      note: 'Same professor as 347. I practice from the textbook instead of the assigned problem sets.',
      now: '[current topic]',
      next: '[next topic]',
    },
    {
      title: 'ECON 575 — Time Series Forecasting',
      status: 'auditing',
      where: 'UNC Chapel Hill',
      note: 'Forecasting runs through most of what I build, so this one is for the toolkit.',
      now: '[current topic]',
      next: '[next topic]',
    },
    {
      title: 'STOR 305',
      status: 'sitting-in',
      where: 'UNC Chapel Hill',
      note: "[One line on what you're getting out of it]",
      now: '[current topic]',
      next: '[next topic]',
    },
    {
      title: 'International Logic Olympiad 2027',
      status: 'self-study',
      statusNote: '8 h/wk',
      where: 'Senior division',
      note: 'Formal logic from zero, aiming to win. I built my own curriculum, problem bank and mock exams for it.',
      now: '[current unit]',
      next: '[latest]',
      labels: { next: 'mock score' },
    },
  ],
  milestones: [
    {
      label: 'Sep 2026',
      date: '2026-09',
      state: 'done',
      title: 'SENTINEL accepted at IEEE ICAIRC',
      detail: 'First author. Sequential diagnosis and mitigation of false convergence in physics-informed learning.',
    },
    {
      label: 'Oct 2026',
      date: '2026-10',
      state: 'done',
      title: 'qbench accepted to the Agenthon workshop, NeurIPS 2026',
      detail: 'A hidden-ground-truth benchmark for agentic quant research.',
    },
    {
      label: 'Oct 2026',
      date: '2026-10',
      state: 'upcoming',
      review: true,
      title: 'Lightning-talk abstract → Stanford AIMI AI+HEALTH',
      detail: 'Built on our Delphi-2M paper presentation from UNC PRIMES. Under review.',
    },
    {
      label: 'Next',
      state: 'next',
      title: 'qbench preprint on arXiv',
      detail: '[Target date]',
    },
    {
      label: 'Dec 9–13',
      date: '2026-12-09',
      state: 'upcoming',
      title: 'Agenthon at NeurIPS — Atlanta',
      detail: 'Verifiable AI for quantitative finance.',
    },
    {
      label: 'Spring 2027',
      state: 'upcoming',
      title: 'One more UNC class, maybe two at NC State',
      detail: '[Which ones]',
    },
    {
      label: '[Date] 2027',
      state: 'upcoming',
      title: 'International Logic Olympiad — Senior',
      detail: 'The goal is to win it.',
    },
  ],
};
