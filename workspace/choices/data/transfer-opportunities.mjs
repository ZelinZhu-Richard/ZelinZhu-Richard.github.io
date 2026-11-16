import { TRANSFER_AWARDS } from './transfer-awards.mjs';
import { TRANSFER_ACTIVITIES } from './transfer-activities.mjs';
import { NEAR_TERM_OLYMPIADS } from './near-term-olympiads.mjs';

export const TRANSFER_OPPORTUNITIES = {
  intro: 'Build a distinctive combination: understand a hard question, implement a credible answer, test it carefully, and explain why someone should use it. Start with USAAIO and the International Logic Olympiad in senior year, then carry those skills into ML, operations research and econometrics at UNC. Each opportunity has a concrete target, a further stretch and a short diagnostic. Choose one main pursuit and one complementary challenge; use progress to decide where to push harder.',
  foundation: 'Stanford names academic excellence as its primary criterion and values depth, contribution and intellectual curiosity. The combinations below are planning recommendations based on your interests, not a published admissions formula. Keep demanding coursework and strong grades central. No award establishes a probability of admission.',
  combinations: [
    {
      name: 'Research-led ML and operations research',
      aim: 'Lead an original policy-learning or decision-optimization study with a manuscript, strong comparisons and external critique. Pursue a first-author conference paper or an INFORMS prize when the result supports it.',
      primary: 'Make the integrated route’s flagship study the main project. Move from replication to a precise methodological contribution, a strong empirical result or a checked theorem. Use a mentored summer to make the result substantially stronger.',
      secondary: 'Choose MCM/ICM as a bounded team challenge. Consider USRESP for a qualifying statistics project and INFORMS for an original OR paper. Check each venue’s reuse and disclosure rules before submitting related work.',
      weeklyPlan: 'During term, plan 12–15 hours for one research project after coursework is stable and 3–4 hours for the chosen contest outside its event window. Use an approved summer research placement as the main full-time commitment. In a competition week, replace research hours rather than layering another full workload on top.',
      applicationEvidence: 'A contribution statement, manuscript and reproducible artifact; the actual review or award status; one external presentation or reproduction; and instructors who can explain how your reasoning improved. Aim for a first-author-caliber result even if acceptance comes later.',
    },
    {
      name: 'AI and logic competitor who builds and explains',
      aim: 'Aim for USAAIO Round 2 and ILO finalist qualification in 2027. Turn the preparation into a useful ML evaluation tool and a clear technical explanation; use contest feedback to choose the next stretch.',
      primary: 'In the first two weeks, take the official AI and Senior Logic samples without answer keys, then retest the weakest topics on fresh problems. Prepare Python, PyTorch, probability and model evaluation for USAAIO; practice formalization, deduction and counterexamples for ILO. These are two different competitions with separate eligibility and entry routes.',
      secondary: 'Use one small project to connect the skills: compare models on a logic task, investigate the failure patterns, and publish a reproducible evaluation plus an explanation someone else can follow. After arriving at UNC, develop that question with a research mentor or a small replication group; choose MCM/ICM if team modeling is a good fit.',
      weeklyPlan: 'During senior-year preparation, start with 6–8 hours a week for AI and 2–3 for logic, then shift time toward the nearest round and the gaps found in practice. Use the same notebooks for the small project. After February’s AI round, increase logic practice for April while allocating AI time according to advancement. In college, replace high-school contest preparation with the research project rather than carrying every commitment forward.',
      applicationEvidence: 'Exact rounds reached and official results; an evaluation with credible baselines and error analysis; a useful tool or workshop; and evidence that other people can reproduce or use the work. Explain your own technical contribution, what changed after feedback and how the work connects to decision science.',
    },
    {
      name: 'Econometrician who changes a real decision',
      aim: 'Produce an original empirical economics paper and a partner-approved allocation pilot with measurable outcomes. Aim for an IAES finalist result or Doing Good with Good OR recognition once the work meets their standards.',
      primary: 'Develop a credible identification strategy and a constrained allocation model around a real partner’s decision. Obtain the permissions and data access needed for a legitimate project. Start with a shadow evaluation, then pursue implementation and a credible impact comparison.',
      secondary: 'Use USRESP or an economics paper competition when the paper fits. Lead a small causal-inference reading and replication group whose public artifacts and discussions help other students contribute to the project.',
      weeklyPlan: 'Plan 10–12 hours for analysis and implementation plus 2–3 hours for partner work and the group. A summer project is the opportunity for a substantial field or implementation phase. Treat partner readiness and a valid study design as prerequisites for claiming real impact.',
      applicationEvidence: 'A paper, verified partner use, clearly measured outcomes, a documented personal contribution and a public technical explanation. A partner’s nomination or an award result is distinct from a letter praising participation.',
    },
  ],
  timeline: [
    {
      stage: 'Senior year · November 2026–summer 2027',
      action: 'Use the first two weeks for the official USAAIO and ILO diagnostics, then follow the ten-week plans in the USAAIO and International Logic Olympiad entries under Awards and competitions. Check age, enrollment and proctor requirements. USAAIO registration closes January 31 and Round 1 is February 19; ILO registration runs January 14–March 21 and preliminaries are April 17–18. Finish a small ML evaluation or optimization artifact, then use summer to develop one research question and save syllabi for placement review.',
      ready: 'Official competition results as they arrive, a runnable artifact and a specific question to investigate at UNC. The 2027 senior-year attempts are separate from undergraduate competitions; confirm any graduation-year ambiguity with the organizer before entering.',
    },
    {
      stage: 'Year 1 · fall 2027',
      action: 'Establish the academic record and work with two course instructors through office hours and substantive assignments. Form a compatible modeling team or a small ML replication group. Start a bounded faculty research task and prepare a summer proposal.',
      ready: 'A first result you can defend, a mentor or explicit independent plan, and a shortlist of eligible summer programs. An introductory email or club title is not a research result.',
    },
    {
      stage: 'Year 1 · winter and spring 2028',
      action: 'Enter the chosen contest and apply for an eligible mentored summer with a defined project. Submit to a June research-prize cycle only if the original work is already complete and strong enough by that deadline. A planned summer result cannot support a spring submission.',
      ready: 'A completed competition artifact and a concrete summer project. MCM/ICM 2028 may yield a result in time; check the actual cycle. Keep prize submissions separate from anticipated awards.',
    },
    {
      stage: 'Summer and fall 2028',
      action: 'Use the summer to produce the decisive research result. In fall, seek an outside critique, present the work, document partner use if applicable, and submit to the appropriate venue once ready. Keep developing the same intellectual question through advanced coursework.',
      ready: 'A manuscript or technical report, reproducible evidence, and any official award or competition results already released. Check late-year competition and prize notification dates before relying on them for the application.',
    },
    {
      stage: 'Before the March 2029 application',
      action: 'Request the required academic recommendations early, assemble exact evidence of your contribution and status, and explain the academic work you want to pursue next. Verify the actual 2029 application dates. Write honestly about pending review and unfinished spring work.',
      ready: 'A strong transcript, two qualifying academic letters, a specific reason for transfer and a small set of substantial completed contributions. Keep the UNC continuation plan active while admission is pending.',
    },
  ],
  rules: [
    { label: 'What Stanford says, and what this planner recommends', detail: 'The academic and depth criteria are Stanford’s published guidance. The ordering of targets and the three combinations are planning judgments. Stanford does not publish an award-to-admission conversion or a guaranteed activity list.' },
    { label: 'Recommendations come from observed work', detail: 'The current transfer rules require two academic instructors or professors who taught you in a class, including at least one college professor. A research mentor can be especially informative when they also taught you. Otherwise consider the separate optional letter only if it adds substantive new information.' },
    { label: 'Use released results, not future awards', detail: 'Participation, submission, finalist selection, acceptance, publication and winning are different statuses. A 2029 contest result released after the application deadline cannot be presented as already achieved. An update is useful only if Stanford’s then-current process accepts it.' },
    { label: 'Pick a research environment for the work', detail: 'An external institution’s name does not establish a stronger project. Compare the mentor’s availability, access to an appropriate question, your intellectual ownership, the methods you will learn and the work you can finish. The strongest UNC project can remain the primary route.' },
  ],
  awards: [...NEAR_TERM_OLYMPIADS, ...TRANSFER_AWARDS],
  activities: TRANSFER_ACTIVITIES,
  sources: [
    { label: 'Stanford holistic admission', href: 'https://admission.stanford.edu/apply/overview/index.html' },
    { label: 'Stanford transfer academic preparation', href: 'https://admission.stanford.edu/apply/transfer/credit.html' },
    { label: 'Stanford transfer recommendations', href: 'https://admission.stanford.edu/apply/transfer/evals.html' },
  ],
};
