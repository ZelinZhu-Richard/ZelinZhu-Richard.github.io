export const RESEARCH_AMBITIONS = {
  framing:
    'How do you turn forecasts or estimates of an intervention’s effects into better decisions when capacity is limited and conditions change? Use the first two years at UNC to develop one original answer that another researcher can check. A top-conference paper is a stretch outcome. Your transfer application can report the evidence you have by then, even if peer review is still ahead.',
  achievements: [
    {
      name: 'Publish a first-author NeurIPS, ICML, or ICLR main-track paper',
      evidence:
        'An archival proceedings paper that lists you first, with a contribution statement showing that you led the central research question, the proof or experiments, and the writing. Label shared first authorship explicitly if applicable.',
      ladder:
        'Build a simple baseline and reproduce the closest published result. Isolate a consequential question it leaves open, test your answer against strong baselines or prove it, and ask a researcher outside the project to try to overturn the claim. Submit when the manuscript survives that review.',
      fallback:
        'A full manuscript and reproducible artifact, with a preprint when the work is ready for public release.',
    },
    {
      name: 'Publish a solo-author NeurIPS, ICML, or ICLR main-track paper',
      evidence:
        'An archival proceedings paper with you as the sole author. This is an exceptional stretch target for work whose intellectual contributions and writing are genuinely yours.',
      ladder:
        'Replicate a small published result yourself, then narrow to one open lemma, counterexample, or empirical claim you can investigate end to end. Run the strongest checks, seek independent critique, and submit if the contribution holds. Credit anyone who makes a significant research contribution as a coauthor.',
      fallback:
        'A self-contained research note with an independently checked proof or replication. If the work becomes collaborative, a first-author paper remains a strong goal.',
    },
    {
      name: 'Prove a guarantee for a new decision algorithm',
      evidence:
        'An algorithm and a new theorem about decision regret or constraint violations, with explicit assumptions, a counterexample showing where the guarantee breaks, and experiments probing its scope.',
      ladder:
        'Start with predict-then-optimize and reproduce a published decision-loss result. Ask what changes when the deployment capacity or demand mix shifts. Search for the nearest existing guarantee, prove a special case, test the boundary cases, and have a theory reader check the proof before submitting.',
      fallback:
        'A verified counterexample or a reproducible map of when existing methods fail, with a precise statement of the conditions tested.',
    },
    {
      name: 'Build an open benchmark another lab uses',
      evidence:
        'A versioned benchmark with licensed data or a public generator, documented splits, baseline code, and a citable release. An independent paper, public evaluation, or course project demonstrates reuse.',
      ladder:
        'Reproduce an established benchmark before testing a new question, such as whether methods rank differently under tight capacity. Audit for leakage, lock the test scenarios, and get an outside team to reproduce the results and flag flaws before you release or submit it.',
      fallback:
        'A documented evaluation suite and baseline report that another student can run from a clean environment.',
    },
    {
      name: 'Run a campus decision pilot with a credible comparison',
      evidence:
        'A partner uses your system for real allocations, such as assigning rooms for student events. A written evaluation reports decision quality, constraint violations, uncertainty, and whether the partner kept using it.',
      ladder:
        'Document and reproduce the current rule, then test an allocation improvement offline. Check the study design and permissions with the partner and faculty, and run a shadow trial. If feasible, randomize across independent scheduling blocks and share the results for external critique before presenting them.',
      fallback:
        'A partner-reviewed shadow evaluation that records proposed decisions and failure cases. If the comparison cannot identify impact, report the observed outcomes and what a stronger study would need.',
    },
    {
      name: 'Win the INFORMS Undergraduate Operations Research Prize',
      evidence:
        'A published award result for an original operations research paper you led as an undergraduate. Finalist selection brings a chance to present at the INFORMS Annual Meeting.',
      ladder:
        'Replicate a result, develop an original extension, and defend the evidence at a lab talk or UNC’s Celebration of Undergraduate Research. Enter when your paper is ready and you meet that year’s rules. The 2026 rules required research during undergraduate enrollment, entrant first authorship, and a faculty reference.',
      fallback:
        'A thesis-quality report, reproducible artifact, and research presentation. Pursue a formal honors thesis when you meet the department’s requirements.',
    },
  ],
  publication: [
    {
      label: 'Choose the venue after you have a result',
      detail:
        'A new learning or optimization result can fit NeurIPS or ICML, and a new representation or generalization result may fit ICLR. Read recent accepted papers with a similar contribution. An operations research or econometrics journal may be the better audience for a result centered on allocation or identification.',
    },
    {
      label: 'Use the exact publication status',
      detail:
        'An arXiv preprint is a public manuscript. A workshop paper or talk belongs under its workshop name and may have its own proceedings. An archival main-track paper earns that description after acceptance and publication in the main conference proceedings. Track submission, acceptance, and publication as separate milestones.',
    },
    {
      label: 'Make one claim that goes beyond the closest paper',
      detail:
        'Use Elmachtoub and Grigas to study how prediction errors affect optimized decisions. Use Athey and Wager to study learning a treatment policy from observational data. Double machine learning offers tools for inference on a specified parameter. For a causal claim, state the estimand, identification assumptions, and overlap requirements where applicable.',
    },
    {
      label: 'Set author credit early and revisit it',
      detail:
        'Discuss author order and keep a contribution record as the research evolves. Include everyone who earns authorship, get each author’s approval before submission, and acknowledge other help. Mentorship and critique can improve solo work. Significant contributions can make the project collaborative.',
    },
    {
      label: 'Make the evidence rerunnable',
      detail:
        'Use time- or site-based splits when deployment calls for them. Fit preprocessing on training data, keep test sets untouched during tuning, and compare strong baselines across environments under comparable budgets. Report uncertainty, failures, solver settings, hardware, runtime, and the cost of tuning. Include dependencies and commands for the key results.',
    },
    {
      label: 'Check the submission cycle you actually enter',
      detail:
        'NeurIPS 2026 required a paper checklist, ICML 2026 encouraged reproducible code, and ICLR 2027 specified author quotas and reviewer rules. These cycles are references for planning. Check the year you enter for dates, anonymity, author-list rules, disclosures, and policies on preprints and workshops. Keep one active archival submission for substantially overlapping work.',
    },
    {
      label: 'Revise after rejection or withdrawal',
      detail:
        'If a replication fails, resolve it before building on it. If the new claim fails a decisive test, narrow the claim or document the failure. After rejection or withdrawal, address the strongest objections before resubmitting. Check the venue’s visibility policy. ICLR 2027 keeps rejected papers and post-deadline withdrawals public on OpenReview.',
    },
  ],
  sources: [
    { label: 'NeurIPS 2026 Call for Papers', href: 'https://neurips.cc/Conferences/2026/CallForPapers' },
    { label: 'NeurIPS 2026 Main Track Handbook', href: 'https://neurips.cc/Conferences/2026/MainTrackHandbook' },
    { label: 'NeurIPS Paper Checklist', href: 'https://neurips.cc/public/guides/PaperChecklist' },
    { label: 'ICML 2026 Call for Papers', href: 'https://icml.cc/Conferences/2026/CallForPapers' },
    { label: 'ICML 2026 Author Instructions', href: 'https://icml.cc/Conferences/2026/AuthorInstructions' },
    { label: 'ICML 2026 Peer Review Ethics', href: 'https://icml.cc/Conferences/2026/PeerReviewEthics' },
    { label: 'ICLR 2027 Call for Papers', href: 'https://iclr.cc/Conferences/2027/CallForPapers' },
    { label: 'ICLR 2027 Author Guidelines', href: 'https://iclr.cc/Conferences/2027/AuthorGuidelines' },
    { label: 'Elmachtoub and Grigas, Smart “Predict, then Optimize”', href: 'https://pubsonline.informs.org/doi/abs/10.1287/mnsc.2020.3922' },
    { label: 'Athey and Wager, Policy Learning With Observational Data', href: 'https://onlinelibrary.wiley.com/doi/10.3982/ECTA15732' },
    { label: 'Chernozhukov et al., Double/Debiased Machine Learning', href: 'https://academic.oup.com/ectj/article/21/1/C1/5056401' },
    { label: 'INFORMS Undergraduate Operations Research Prize eligibility', href: 'https://www.informs.org/Recognizing-Excellence/INFORMS-Prizes/Undergraduate-Operations-Research-Prize/Undergraduate-Operations-Research-Prize-Application-Process' },
    { label: 'UNC Office for Undergraduate Research', href: 'https://catalog.unc.edu/undergraduate/academic-enrichment/undergraduate-research/undergraduate-research.pdf' },
  ],
};
