const requirements = { label: 'Stanford transfer requirements and deadlines', href: 'https://admission.stanford.edu/apply/transfer/' };
const eligibility = { label: 'Stanford transfer eligibility', href: 'https://admission.stanford.edu/apply/transfer/eligibility.html' };
const credit = { label: 'Stanford academic preparation and transfer credit', href: 'https://admission.stanford.edu/apply/transfer/credit.html' };
const csAdmission = { label: 'UNC Computer Science major admission', href: 'https://cs.unc.edu/undergraduate/cs-admissions/' };
const uncStats = { label: 'UNC Statistics and Analytics B.S.', href: 'https://catalog.unc.edu/undergraduate/programs-study/statistics-analytics-majors-bs/' };
const uncStor = { label: 'UNC statistics and operations research courses', href: 'https://catalog.unc.edu/courses/stor/' };
const uncComp = { label: 'UNC computer science courses', href: 'https://catalog.unc.edu/courses/comp/' };
const uncEcon = { label: 'UNC economics courses', href: 'https://catalog.unc.edu/courses/econ/' };
const uncInls = { label: 'UNC information science courses', href: 'https://catalog.unc.edu/courses/inls/' };
const mse = { label: 'Stanford MS&E B.S. and application areas', href: 'https://bulletin.stanford.edu/programs/MGTSC-BS' };
const csTracks = { label: 'Stanford CS B.S. tracks', href: 'https://www.cs.stanford.edu/academics-overview/academics-bachelors-program' };
const symsys = { label: 'Stanford Symbolic Systems concentrations', href: 'https://symsys.stanford.edu/undergraduates/concentrations' };
const dataScience = { label: 'Stanford Data Science B.S.', href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs' };
const ventureMentoring = { label: 'UNC 1789 student venture mentoring', href: 'https://1789hub.com/' };

export const TRANSFER = {
  assumption: 'Assumes you start UNC–Chapel Hill in fall 2027. Your calculus, statistics, C++, linear algebra, multivariable calculus, differential equations, discrete math, microeconomics and macroeconomics give you a head start on the material. The sequences assume placement into MATH 231 and zero posted credit until UNC confirms your exam scores, college transcripts and placement. They list courses central to each path. Fill the rest of each term with UNC writing, first-year requirements, language and breadth according to your degree audit.',
  framing: 'Start with the integrated machine learning, operations research and econometrics route if you want to estimate what an intervention changes and decide how to allocate limited resources. Use its flagship project to connect all three methods. The other paths let you isolate a different interest: optimization, AI evaluation, human-centered products, causal marketing or governance. Stanford reviews transfers for admission to the university as a whole and specifies no required courses for admission. Each direction should give you a project and a viable UNC degree plan.',
  timings: [
    {
      id: 'apply-year-one',
      name: 'Apply during UNC Year 1',
      timing: 'Plan for March 2028 submission and fall 2028 entry. Stanford currently lists March 15 at 11:59 p.m. local time, April missing-document notices, decisions by mid-May and a June 1 reply date. The 2028 cycle dates are still unconfirmed.',
      whenItFits: 'Stanford permits first-year college applicants and sets no minimum college credits or years. Under this schedule, your first UNC fall is typically the only completed college semester from UNC by submission. This path is worth considering if you can already explain a specific academic objective and two instructors can describe substantive work they have observed.',
      uncPlan: 'Fall 2027 is the time to set a course baseline, attend office hours with draft work and finish a small project. Over winter break, review your fall record and decide whether your evidence and reasons for transferring are ready. Register for your normal UNC sophomore sequence while the application is pending.',
      decisionGate: 'By January 2028, identify a college professor and a second academic instructor, one finished piece of work and two Stanford curricular resources that directly support your next question. If the evidence still depends on spring outcomes, reassess for March 2029. An early application uses one of Stanford’s three total undergraduate application attempts.',
    },
    {
      id: 'apply-year-two',
      name: 'Apply during UNC Year 2',
      timing: 'Plan for March 2029 submission and fall 2029 entry, using Stanford’s current March 15 deadline as a placeholder. The 2029 cycle dates and requirements are still unconfirmed.',
      whenItFits: 'Stanford describes a typical well-prepared applicant as applying in their second full-time, in-person year and having about two years of college coursework by entry. This schedule gives you three completed UNC terms by submission and lets you build a larger piece of work and stronger instructor relationships.',
      uncPlan: 'Use Year 1 to test two directions. Spend summer 2028 on one compact extension, such as cleaning the transit feed pipeline or rerunning an evaluation with a fixed protocol. By the end of fall 2028, complete the core analysis, ask two instructors about letters and have UNC advising review your degree progress.',
      decisionGate: 'By January 2029, check whether you can show a result, the revision it prompted and a specific academic next step at Stanford. By March, distinguish finished work from Year 2 spring plans. If admitted, compare the official aid offer and remaining Stanford requirements with your UNC degree audit before deciding.',
    },
  ],
  checklist: [
    {
      label: 'Confirm the cycle and your application count',
      detail: 'Stanford’s published rules were checked on November 10, 2026. Recheck when your application opens, including the fall-only entry schedule. The current checklist includes the Transfer Common Application, Stanford questions and a $100 fee or waiver request. Stanford caps undergraduate applications at three across first-year and transfer cycles combined.',
      href: requirements.href,
    },
    {
      label: 'Confirm UNC placement and seat access',
      detail: 'Ask UNC to check credit by exam, college transcripts and placement separately. Move MATH 231 → 232 → 233 forward only as officially cleared. After COMP 110 and MATH 231 are satisfied, plan COMP 210 with an approved discrete course. To pursue the CS major, apply while taking or after completing COMP 210 and COMP 283, MATH 381 or STOR 315, with C or better in both gateway courses. Ask about seat access for COMP 211 and 301 and use the CS minor or statistics-side courses if necessary.',
      href: csAdmission.href,
    },
    {
      label: 'Plan ACT or SAT testing',
      detail: 'Stanford currently requires either the ACT or SAT and accepts self-reported scores at application. Its latest listed sittings are December for SAT and February for ACT. It recommends scores from the past five years. If you enroll, send official reports for the sittings you reported. Self-report all AP scores if you sat for AP exams.',
      href: 'https://admission.stanford.edu/apply/transfer/testing.html',
    },
    {
      label: 'Arrange transcripts and the College Report',
      detail: 'Request the official high school transcript with graduation date and official transcripts from every college you attended, including any college that awarded dual-enrollment credit. Ask UNC advising who can complete the Common App College Report on your academic standing. The current transfer checklist does not require a midterm report. Verify receipt in the Stanford portal.',
      href: 'https://admission.stanford.edu/apply/transfer/transcripts.html',
    },
    {
      label: 'Choose two academic recommenders',
      detail: 'Stanford requires two academic instructor letters, with at least one from a college professor. Work with instructors who can point to a specific contribution. Bring your analysis to office hours, act on feedback and ask several weeks ahead with your course work, what you revised and the submission instructions.',
      href: 'https://admission.stanford.edu/apply/transfer/evals.html',
    },
    {
      label: 'Draft from work you actually did',
      detail: 'Keep a short log of the question, your contribution, a result and what changed your mind. Use it to explain why you want to transfer and what you hope to do next. Check the live Common App questions for your cycle. The projects in this planner give you material to discuss in the application.',
      href: 'https://admission.stanford.edu/apply/transfer/apply.html',
    },
    {
      label: 'Keep syllabi for the credit review',
      detail: 'Save official syllabi, reading lists and representative assignments. After admission, Stanford evaluates credit and departments decide how it applies to major or minor requirements. The current external-credit cap for transfers is 90 quarter units and Stanford requires at least two years of full-time enrollment. Ask advising about total units, prerequisites, major requirements, Ways, writing and language before using any six-quarter plan to make a decision.',
      href: 'https://studentservices.stanford.edu/my-academics/earn-my-degree/undergraduate-degree-progress/test-transfer-credit/undergraduate',
    },
    {
      label: 'Price the full remaining degree',
      detail: 'Check the transfer aid forms and deadlines for your citizenship or eligibility category. Current priority filing is March 15. International applicants who need aid should indicate that on the admission application. Compare the actual Stanford offer and the number of quarters you expect to need with the remaining UNC cost, including housing and travel.',
      href: 'https://financialaid.stanford.edu/undergrad/apply/',
    },
  ],
  paths: [
    {
      id: 'optimization',
      name: 'Decision science and optimization',
      question: 'How would you allocate a fixed number of bus service hours to make a few common weekend trips easier?',
      stanford: 'Start with MS&E and use the Operations and Analytics area for depth. Pair it with CS for algorithms and implementation. Use the Stanford degree plans to compare a CS minor with the full double major after the transfer-credit and graduation audit.',
      uncAnchor: 'Statistics and Analytics B.S. with the CS B.A. if admitted, or a CS minor subject to course access. The first two years build toward STOR 415 and STOR 435 alongside the computing sequence.',
      courseSequence: [
        {
          stage: 'UNC Year 1 · Fall',
          courses: 'MATH 231, STOR 120 and ECON 101. If UNC clears the calculus gateway, start with the next course in your placement sequence.',
          activity: 'Use Chapel Hill Transit’s public schedule feed. Pick two Saturday trip windows and measure scheduled wait and transfer time from three starting stops.',
          output: 'A notebook that regenerates the baseline and a short note on what schedules can show about service access.',
        },
        {
          stage: 'UNC Year 1 · Spring',
          courses: 'MATH 232, COMP 110 after a qualifying course and STOR 455 after STOR 120. If COMP 110 and MATH 231 are already cleared, move to COMP 210 with COMP 283 and apply to the CS major in that term.',
          activity: 'Write a simple greedy rule for shifting a fixed number of hypothetical service minutes across two routes. Ask a course instructor to critique how you define improvement.',
          output: 'A baseline versus greedy-rule table with service-hour totals, transfer waits and affected stops.',
        },
        {
          stage: 'UNC Year 2 · Fall',
          courses: 'MATH 233, MATH 347 and COMP 210 with MATH 381, or continue with COMP 211 and 301 if you completed the gateways and can enroll. Apply to the CS major when eligible.',
          activity: 'Translate the rule into a linear or integer model with a fixed service budget and a minimum service constraint for each route. Write tests for invalid schedules.',
          output: 'A small solver with a reproducible input fixture, a feasible schedule and a comparison to the greedy rule.',
        },
        {
          stage: 'UNC Year 2 · Spring',
          courses: 'STOR 415 after MATH 347 and discrete math, and STOR 435 after multivariable calculus and discrete math. Add COMP 211 and 301 if still due and seats allow, or use one remaining slot for degree breadth.',
          activity: 'Stress-test the schedule under alternative transfer windows and demand assumptions. If a campus or town reviewer is interested, ask which constraints are missing and rerun one scenario.',
          output: 'A comparison tool and a one-page decision memo with tradeoffs, scenario sensitivity and an explanation of what a real pilot would require.',
        },
      ],
      portfolio: 'A transit scheduling demo with a reproducible data snapshot, readable constraint definitions and one clear recommendation about the next scenario to investigate.',
      tradeoff: 'This path puts the most time into modeling and implementation. Choose the AI evaluation path if measuring model behavior consistently is the work you would rather do each week.',
      stay: 'Finish Statistics and Analytics and continue the project through a later approved STOR capstone or DATA 481 practicum if a suitable brief is available. Seek a partner who can supply realistic constraints or shift to a second public scheduling problem.',
      sources: [mse, uncStats, uncStor, csAdmission, { label: 'GoTriangle regional GTFS feeds', href: 'https://gotriangle.org/developer-resources/' }],
    },
    { ...INTEGRATED_RESEARCH_PATH, ambitions: RESEARCH_AMBITIONS, opportunities: TRANSFER_OPPORTUNITIES },
    {
      id: 'ai-evaluation',
      name: 'Technical AI safety and evaluation',
      question: 'When a question is rephrased, how often does a language model switch from a supported answer to a false claim expressed without uncertainty?',
      stanford: 'Consider the CS B.S. Artificial Intelligence track for model building, or Data Science B.S. for statistical measurement. Symbolic Systems is a fit if your question shifts toward language, cognition or human interpretation of model output. See the Stanford plans for the courses and tradeoffs.',
      uncAnchor: 'Statistics and Analytics B.S. with a CS B.A. if admitted. The CS minor with STOR 565 is a path to statistical machine learning if upper-division CS seats are difficult to get.',
      courseSequence: [
        {
          stage: 'UNC Year 1 · Fall',
          courses: 'MATH 231 at placement and STOR 120. Use approved calculus placement to move forward while keeping the statistics foundation.',
          activity: 'Read the TruthfulQA paper and score a small set of outputs from one model. Record correctness and whether the answer expresses uncertainty as separate fields. Keep examples that are hard to score.',
          output: 'A first scoring rubric, a labeled set and a short note explaining two ambiguous cases.',
        },
        {
          stage: 'UNC Year 1 · Spring',
          courses: 'MATH 232, COMP 110 after a qualifying course and STOR 455 after STOR 120. With both COMP 110 and MATH 231 cleared, use COMP 210 and COMP 283 instead of COMP 110.',
          activity: 'Write a script to score original and paraphrased versions of the same questions. Keep question-level pairs together and use the same scoring rules for both versions.',
          output: 'A reproducible test run with a paired error table and a record of the model version, prompt and scoring choices.',
        },
        {
          stage: 'UNC Year 2 · Fall',
          courses: 'MATH 233, MATH 347 and COMP 210 with MATH 381, or COMP 211 and 301 if the gateways are complete and seats allow. Apply to the CS major when eligible.',
          activity: 'Read a recent paper from UNC’s UNITES Lab, then ask about a bounded replication task if the work fits. Independently run your evaluation on a fixed set of question pairs.',
          output: 'A one-command evaluation, an uncertainty interval from resampling by question and examples showing where the scoring rubric still breaks down.',
        },
        {
          stage: 'UNC Year 2 · Spring',
          courses: 'STOR 435 after multivariable calculus and discrete math, STOR 323I after STOR 120 and COMP 211 and 301 if due and accessible. With probability already complete, ask about STOR 565 after MATH 381 or another listed discrete prerequisite.',
          activity: 'Compare one intervention, such as offering the model an explicit abstention option. Measure false answers and how many questions still receive answers.',
          output: 'An evaluation report with a baseline, one intervention, uncertainty, representative failures and the cost of extra abstentions.',
        },
      ],
      portfolio: 'A reproducible benchmark package and a short technical report on one failure mode. Include scorer disagreement if a second scorer is available and discuss the implications of evaluating on a public dataset.',
      tradeoff: 'This direction emphasizes evaluation design, statistical judgment and tooling. A research role depends on mentor fit and availability, and you can complete the public benchmark independently.',
      stay: 'Move to COMP 562 once its systems, programming, calculus, linear algebra and probability prerequisites are complete and a seat is available. STOR 565 can carry the ML depth on the statistics side. Pursue COMP 495 later only if admitted to the CS major and approved for faculty supervision.',
      sources: [csTracks, dataScience, symsys, uncComp, uncStor, { label: 'UNC UNITES Lab research', href: 'https://unites-lab.github.io/' }, { label: 'TruthfulQA benchmark paper', href: 'https://aclanthology.org/2022.acl-long.229/' }],
    },
    {
      id: 'human-centered-ai',
      name: 'Human-centered AI and product',
      question: 'Can an evidence-first interface help students decide when to trust an AI answer about a campus service?',
      stanford: 'Symbolic Systems with Human-Computer Interaction gives you cognition and design alongside computing. The CS B.S. HCI track is the more software-intensive route. Use the Stanford degree plans to decide where you want the depth.',
      uncAnchor: 'Information Science B.S. if admitted, with psychology and computing electives. Statistics and Analytics plus the CS minor and selected INLS or PSYC courses offers an alternate UNC route. Confirm admissions and registration restrictions before counting on INLS 318.',
      courseSequence: [
        {
          stage: 'UNC Year 1 · Fall',
          courses: 'INLS 161, PSYC 101 and STOR 120. Add INLS 201 if it fits alongside first-year requirements.',
          activity: 'Pick one task, such as finding the current operating hours for a service. Sketch a plain search result and an AI response with a visible citation and timestamp.',
          output: 'Two low-fidelity prototypes and a five-task script for checking whether users can locate and verify the answer.',
        },
        {
          stage: 'UNC Year 1 · Spring',
          courses: 'INLS 382 after or with INLS 161, COMP 110 after STOR 120 if the grade qualifies, and MATH 231 unless placement clears it. Take INLS 201 here if still due. Check the Information Science application window.',
          activity: 'Build the two interface versions from a fixed set of public campus pages and get scope feedback from 1789 or a course instructor.',
          output: 'A clickable prototype and a test plan that records task completion, citation checking and misplaced confidence.',
        },
        {
          stage: 'UNC Year 2 · Fall',
          courses: 'INLS 318 after INLS 382 if a seat is available, PSYC 270 after PSYC 101, MATH 232 and COMP 283 after MATH 231. If INLS 318 is unavailable, use PSYC 270 and a faculty walkthrough to refine the study plan.',
          activity: 'Run an instructor-guided usability pilot where appropriate, or use expert walkthroughs and scripted tasks. If you plan human-subjects research, seek UNC guidance before recruiting.',
          output: 'A study protocol, an issue list and a documented change to source display or uncertainty language.',
        },
        {
          stage: 'UNC Year 2 · Spring',
          courses: 'COMP 210 after COMP 110 and MATH 231 with discrete math satisfied, and STOR 455 after STOR 120. Use MATH 233 after MATH 232 if pursuing Statistics and Analytics, or ECON 125 for an entrepreneurship elective if space allows.',
          activity: 'Retest the revised interface on the same tasks. Ask a 1789 mentor to critique a one-sentence product positioning statement and a realistic first customer segment.',
          output: 'A before-and-after usability case study with one metric, observed failure cases and a product decision about where the tool belongs.',
        },
      ],
      portfolio: 'A tested prototype with a compact research plan, changes traced to feedback and a clear explanation of when users could verify the result.',
      tradeoff: 'The interface and study work competes with advanced systems courses. Preserve COMP 210 and a discrete course if you want to keep the CS route open. If access to INLS courses slips, keep the prototype small and continue through psychology or statistics.',
      stay: 'Continue the Information Science degree if admitted, or use the statistics and computing route and develop the tool with a permitted campus partner. Use 1789 to test demand before committing to a larger venture.',
      sources: [symsys, csTracks, uncInls, { label: 'UNC Information Science B.S. and admission', href: 'https://catalog.unc.edu/undergraduate/programs-study/information-science-major-bs/' }, { label: 'UNC psychology courses', href: 'https://catalog.unc.edu/courses/psyc/' }, { label: 'UNC Office of Human Research Ethics', href: 'https://research.unc.edu/human-research-ethics/' }, ventureMentoring],
    },
    {
      id: 'causal-economics',
      name: 'Computational economics and causal marketing',
      question: 'Did a marketing email cause more purchases or revenue, and which customer groups should receive the next campaign?',
      stanford: 'Look at Data Science & Social Systems B.A. if the economic question leads and Data Science B.S. if inference and computation lead. MS&E remains a fit when you want to turn estimates into an allocation or business decision. Compare those degree plans before deciding.',
      uncAnchor: 'Economics B.S. for the econometrics sequence and quantitative depth, or Statistics and Analytics with selected ECON courses. Prior micro and macro help with ECON 101 material. Move beyond it when UNC confirms the course credit or equivalent prerequisite.',
      courseSequence: [
        {
          stage: 'UNC Year 1 · Fall',
          courses: 'ECON 101, MATH 231 at placement and STOR 120. If ECON 101 and qualifying calculus are already posted, ask whether ECON 400 can move forward.',
          activity: 'Use the published MineThatData randomized email study. The scikit-uplift fetch_hillstrom loader gives you the three arms and outcomes. Define the purchase and revenue comparisons before looking at subgroup results.',
          output: 'A data dictionary and one-page analysis plan that identifies the comparison, unit of analysis and decision.',
        },
        {
          stage: 'UNC Year 1 · Spring',
          courses: 'ECON 400 after ECON 101 and qualifying calculus, MATH 232 and COMP 110 after a qualifying course. If ECON 400 is already complete and your prerequisites are posted, use ECON 410.',
          activity: 'Estimate each email arm’s difference from the no-email group in conversion and dollars per assigned customer. Calculate uncertainty and check balance on pre-campaign characteristics.',
          output: 'A reproducible notebook with two treatment comparisons, confidence intervals and a short explanation of what random assignment supports.',
        },
        {
          stage: 'UNC Year 2 · Fall',
          courses: 'ECON 410 after ECON 101 and qualifying calculus, or ECON 470 if ECON 400 and 410 are already complete at C or better. Take MATH 233 and MATH 381 after MATH 232. Add COMP 210 with MATH 381 if eligible and the workload fits.',
          activity: 'Estimate effects for two pre-specified customer groups, then model the campaign decision under a few send-cost assumptions. Ask an economics instructor to review the claim and assumptions.',
          output: 'A chart of average and group effects, plus a sensitivity table showing when the campaign decision changes.',
        },
        {
          stage: 'UNC Year 2 · Spring',
          courses: 'ECON 470 after C or better in ECON 400 and 410, or ECON 420 after ECON 410 if ECON 470 is complete. Take STOR 435 after multivariable calculus and discrete math, and MATH 347 after MATH 232 if still needed. Add COMP 210 if eligible and the term fits.',
          activity: 'Use a fixed analysis sample to explore a targeting rule and check its performance on a separate sample. Compare with treating everyone and treating no one under the same cost assumptions.',
          output: 'An econometrics replication and a two-page campaign memo stating who the evidence applies to and where a new experiment is needed.',
        },
      ],
      portfolio: 'A causal analysis someone else can rerun, with a transparent decision threshold and a proposed follow-up experiment for a product team or startup.',
      tradeoff: 'Intermediate microeconomics and econometrics consume slots that a CS-heavy plan uses for systems. This route is strongest when you want to reason about incentives, experimental evidence and who benefits.',
      stay: 'Complete UNC’s Economics B.S. or quantitative statistics route. Continue through research in economics or an approved practicum and pursue a marketing analytics project with an authorized experiment or public data.',
      sources: [uncEcon, { label: 'UNC Economics B.S.', href: 'https://catalog.unc.edu/undergraduate/programs-study/economics-major-bs/' }, dataScience, { label: 'Stanford Data Science & Social Systems B.A.', href: 'https://datasciencemajor.stanford.edu/academics/data-science-social-systems-ba' }, { label: 'Original MineThatData experiment', href: 'https://blog.minethatdata.com/2008/03/minethatdata-e-mail-analytics-and-data.html' }, { label: 'scikit-uplift Hillstrom dataset loader', href: 'https://www.uplift-modeling.com/en/latest/api/datasets/fetch_hillstrom.html' }],
    },
    {
      id: 'technology-governance',
      name: 'Technology governance with technical depth',
      question: 'What evidence and oversight should a campus team require before adopting an AI tool that answers questions about institutional policy?',
      stanford: 'Consider Science, Technology & Society and its Politics and Policy or Social Dynamics of Data and Information concentration. Choose the B.A. or B.S. based on the methods you want to emphasize and the degree audit. MS&E’s Organizations, Technology, and Policy area fits if you want more engineering and decision analysis.',
      uncAnchor: 'Public Policy B.A. with computing or statistics depth, or Statistics and Analytics with policy and ethics electives. Information Science is another fit if admitted. Use PLCY 101 and INLS 201 to see whether policy analysis or information governance holds your attention.',
      courseSequence: [
        {
          stage: 'UNC Year 1 · Fall',
          courses: 'PLCY 101, INLS 201 and STOR 120. Fit MATH 231 here if you want the CS route and placement calls for it, or keep it for spring.',
          activity: 'Pick a hypothetical campus policy assistant. Map who owns the source documents, who relies on answers and who handles corrections. Read the NIST generative AI risk profile.',
          output: 'A one-page workflow and risk register with specific examples of stale, unsupported and sensitive responses.',
        },
        {
          stage: 'UNC Year 1 · Spring',
          courses: 'PLCY 210, COMP 110 after a qualifying course and MATH 231 or the next calculus course at placement. Add INLS 384 after INLS 201 if a seat is available, or defer it to fall.',
          activity: 'Create a small set of scripted scenarios using public policies and synthetic inputs. Define how a correct citation, refusal or escalation should look for each case.',
          output: 'A test matrix with pass criteria and a written comparison of human-only, AI-assisted and more automated workflows.',
        },
        {
          stage: 'UNC Year 2 · Fall',
          courses: 'COMP 210 with COMP 283 once COMP 110 and MATH 231 are cleared, STOR 455 after STOR 120 and INLS 384 if still due and accessible. Use STOR 323I after STOR 120 if the INLS course is unavailable.',
          activity: 'Run the scripted cases against a local prototype or fixed outputs. Measure where source verification or escalation succeeds and trace failures to a missing control.',
          output: 'An audit worksheet linking test results to concrete controls, with evidence someone else can review.',
        },
        {
          stage: 'UNC Year 2 · Spring',
          courses: 'ECON 101 if still needed for the policy major’s economics sequence, or PLCY 310 after ECON 101. Add COMP 211 or 301 if eligible and a seat is available, or STOR 323I if still due.',
          activity: 'Compare a limited pilot with continuing the existing workflow. Define which failures would stop a pilot, who would review reports and how users would reach a person.',
          output: 'A policy brief and technical appendix with a recommendation, decision criteria and a monitoring and escalation plan.',
        },
      ],
      portfolio: 'An inspectable system audit that connects measured failures to institutional responsibilities and a specific deployment decision.',
      tradeoff: 'This path puts the decision process and institutional incentives in the foreground. Stanford STS considers transfer courses for concentration credit by petition after the Registrar’s review. Budget Stanford time for the STS core and keep computing and statistics in the plan if you want to run your own audits.',
      stay: 'Finish the Public Policy or Statistics and Analytics degree and build on the case with a faculty advisor. Seek an appropriate policy or research placement where you can evaluate a concrete workflow and explain the evidence behind the recommendation.',
      sources: [{ label: 'Stanford Science, Technology & Society concentrations', href: 'https://sts.stanford.edu/' }, { label: 'Stanford STS transfer credit policy', href: 'https://sts.stanford.edu/academics/transfer-credit' }, mse, { label: 'UNC public policy courses', href: 'https://catalog.unc.edu/courses/plcy/' }, uncInls, uncStor, { label: 'NIST generative AI risk management profile', href: 'https://doi.org/10.6028/NIST.AI.600-1' }],
    },
  ],
  sources: [
    requirements,
    eligibility,
    credit,
    { label: 'Stanford transfer advising', href: 'https://advising.stanford.edu/incoming-students/transfer-students' },
    { label: 'UNC credit by exam and placement', href: 'https://catalog.unc.edu/policies-procedures/credit-evaluation/' },
    { label: 'UNC mathematics prerequisites', href: 'https://catalog.unc.edu/courses/math/' },
    { label: 'UNC undergraduate research resources', href: 'https://catalog.unc.edu/undergraduate/academic-enrichment/undergraduate-research/' },
  ],
};
import { INTEGRATED_RESEARCH_PATH } from './research-route.mjs';
import { RESEARCH_AMBITIONS } from './research-ambitions.mjs';
import { TRANSFER_OPPORTUNITIES } from './transfer-opportunities.mjs';
