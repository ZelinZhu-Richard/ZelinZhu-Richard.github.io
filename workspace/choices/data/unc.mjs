const calculusI = 'MATH 231 · Calculus of Functions of One Variable I (4)';
const calculusII = 'MATH 232 · Calculus of Functions of One Variable II (4)';
const multivariable = 'MATH 233 · Calculus of Functions of Several Variables (4)';
const linearAlgebra = 'MATH 347 · Linear Algebra for Applications (3)';
const discrete = 'MATH 381 · Discrete Mathematics (3)';
const introProgramming = 'COMP 110 · Introduction to Programming (3)';
const dataStructures = 'COMP 210 · Data Structures and Analysis (3)';
const systems = 'COMP 211 · Systems Fundamentals (3)';
const programming = 'COMP 301 · Foundations of Programming (3)';
const organization = 'COMP 311 · Computer Organization (3)';
const databases = 'COMP 421 · Files and Databases (3)';
const engineering = 'COMP 423 · Foundations of Software Engineering (3)';
const webProgramming = 'COMP 426 · Modern Web Programming (3)';
const algorithms = 'COMP 550 · Algorithms and Analysis (3)';
const computerLearning = 'COMP 562 · Introduction to Machine Learning (3)';
const mentoredCS = 'COMP 495 · Mentored Research in Computer Science, with approval (3)';
const models = 'STOR 120 · Foundations of Statistics and Data Science (4)';
const dataMethods = 'STOR 320 · Methods and Models of Data Science (4)';
const ethics = 'STOR 323I · Ethics of Machine Learning in Society (3)';
const optimization = 'STOR 415 · Introduction to Optimization (3)';
const probability = 'STOR 435 · Introduction to Probability (3)';
const stochastic = 'STOR 445 · Stochastic Modeling (3)';
const analysis = 'STOR 455 · Methods of Data Analysis (3)';
const decisions = 'STOR 543 · Dynamic Decision Analytics (3)';
const mathematicalStatistics = 'STOR 555 · Mathematical Statistics (3)';
const timeSeries = 'STOR 556 · Time Series Data Analysis (3)';
const statisticalLearning = 'STOR 565 · Machine Learning (3)';
const capstone = 'STOR 697 · Capstone (3)';
const practicum = 'DATA 481 · Data Science Practicum or approved High-Impact Experience (3)';
const economics = 'ECON 101 · Introduction to Economics (4)';
const econometricsIntro = 'ECON 400 · Introduction to Data Science and Econometrics (4)';
const writing = 'ENGL 105 · English Composition and Rhetoric (3)';
const seminar = "HIST 88 · First Year Seminar: America's Founding Documents (3)";
const thriving = 'IDST 101 · College Thriving (1)';
const literacy = 'IDST 111L · Data Literacy Lab (1)';
const spanishI = 'SPAN 101 · Elementary Spanish I (3)';
const spanishII = 'SPAN 102 · Elementary Spanish II (3)';
const spanishIII = 'SPAN 203 · Intermediate Spanish I (3)';
const biology = 'BIOL 101 + BIOL 101L · Principles of Biology and Introductory Biology Laboratory (4)';
const fitness = 'LFIT 106 · Lifetime Fitness: Beginning Jogging, or another LFIT section (1)';
const philosophy = 'PHIL 144 · Ethics of Emerging Technology (3)';
const aesthetic = 'FC-AESTH · Aesthetic and Interpretive Analysis selection (3)';
const creative = 'FC-CREATE · Creative Expression, Practice, and Production selection (3)';
const global = 'FC-GLOBAL · Global Understanding and Engagement selection (3)';
const power = 'FC-POWER · Power and Society selection (3)';

export const UNC = {
  id: 'unc',
  name: 'UNC–Chapel Hill',
  summary: 'Use computing and statistical inference to measure where AI systems fail and whether a product change helps users. The CS B.A. double major is the starting point for technical AI safety and model evaluation. Statistics with a CS minor gives product and marketing experiments more room.',
  assumptions: [
    'Uses the 2026–27 catalog as a planning baseline, with zero AP or transfer credits and placement into MATH 231. Confirm placement before registration and resequence the math chain if needed.',
    'Spanish illustrates the level 1–3 language sequence. Use your placed language and start the sequence early. Select current sections for the listed breadth slots.',
    'Credit totals are schedule estimates. Weekly hours are planning estimates that include class, labs, study, and any listed research or build time.',
  ],
  rules: [
    'UNC normally permits 18 credits in fall or spring after registration waves. An overload requires dean approval. The university minimum is 120 semester hours.',
    'The CS department runs major admissions each semester. Apply while taking or after completing COMP 210 plus COMP 283, MATH 381, or STOR 315. Both courses require C or better for admission. The sample plans use MATH 381 and apply in Year 2 fall.',
    'The baseline takes COMP 110 after a qualifying math or statistics course. COMP 210 also requires MATH 231 and permits concurrent discrete math. If a core course slips, move its dependent courses together.',
    'The CS minor is available without applying to the major. The department reserves upper-division seats for majors during initial registration, then releases available seats during open enrollment.',
    'UNC allows up to two majors and a minor, or one major and two minors. More than half of each major or minor core must be exclusive by courses and credits. These plans choose separate upper-level electives for CS and statistics.',
    'UNC awards one degree and one diploma for multiple majors. The route labels identify the two curricula. Confirm the degree designation for a B.A. and B.S. pairing with advising.',
    'Verify your degree audit with advising, including course availability, disciplinary distribution, nine Focus Capacities and the lab, Foundations of American Democracy, Interdisciplinary, Communication Beyond Carolina, research and high-impact credit, and Campus Life Experience. Check HIST 88 tagging and adjust breadth slots if that seminar is unavailable.',
  ],
  routes: [
    {
      id: 'stretch',
      name: 'Systems and statistics',
      degree: 'Computer Science B.S. + Statistics and Analytics B.S. double major',
      load: '16–18 credits per term, 140 planned',
      weeklyHours: '55–63 hours in active weeks, including 6–8 for research and 3–4 for a small build',
      goal: 'Build a systems and statistics foundation, then use it to deliver a reproducible model evaluation and a small tool for inspecting the results.',
      tradeoff: 'The CS B.S. adds two sciences and a longer computing sequence. Several terms combine five technical courses, so the research and product have to share a narrow scope.',
      guardrail: 'Add the research and build hours after the core grades stabilize. During project-heavy or exam weeks, pause the product work first and protect sleep.',
      terms: [
        {
          label: 'Year 1 · Fall',
          courses: [calculusI, models, writing, thriving, seminar, spanishI],
          focus: 'Settle into calculus and statistics, start language, and complete the seminar and writing foundations.',
        },
        {
          label: 'Year 1 · Spring',
          courses: [calculusII, introProgramming, spanishII, biology, literacy, aesthetic],
          focus: 'Get the programming gateway and first approved science with lab on record.',
        },
        {
          label: 'Year 2 · Fall',
          courses: [multivariable, linearAlgebra, dataStructures, discrete, spanishIII, fitness],
          focus: 'Apply to the CS major while taking data structures and discrete math. Complete language level 3.',
        },
        {
          label: 'Year 2 · Spring',
          courses: [systems, programming, probability, optimization, analysis, power],
          focus: 'Complete the CS gateway pair and establish the probability and optimization prerequisites.',
        },
        {
          label: 'Year 3 · Fall',
          courses: [organization, databases, algorithms, dataMethods, 'EMES 101 + EMES 101L · Planet Earth and Planet Earth Laboratory (4)'],
          focus: 'Complete the second approved science and prepare a reproducible data pipeline for a lab.',
        },
        {
          label: 'Year 3 · Spring',
          courses: ['COMP 455 · Models of Languages and Computation (3)', engineering, computerLearning, stochastic, mathematicalStatistics, global],
          focus: 'Use machine learning and inference to compare a baseline and a mitigation on one model failure mode.',
        },
        {
          label: 'Year 4 · Fall',
          courses: ['COMP 530 · Operating Systems (3)', mentoredCS, statisticalLearning, decisions, ethics, creative],
          focus: 'Use COMP 495 for the supervised benchmark if approved. If the contract falls through, move COMP 426 here and reserve its spring slot for approved research credit.',
        },
        {
          label: 'Year 4 · Spring',
          courses: [webProgramming, capstone, practicum, philosophy, economics],
          focus: 'Present the benchmark and give a small pilot group a usable interface. Use the audit to confirm the remaining breadth and experience credits.',
        },
      ],
      summer: 'After Year 1, publish a small public-data replication. After Year 2, pursue a mentored research project or technical internship. After Year 3, choose one full-time commitment, such as model evaluation research or Launch Chapel Hill if an eligible team has a prototype and customer evidence.',
    },
    {
      id: 'ambitious',
      name: 'Research with a double major',
      degree: 'Computer Science B.A. + Statistics and Analytics B.S. double major',
      load: '15–16 credits per term, 123 planned',
      weeklyHours: '47–55 hours in active weeks, including 6–8 for research or a build',
      goal: 'Use algorithms, software engineering, and statistical inference to study a language model failure under faculty supervision. Finish with reproducible evaluation code and a poster or technical report.',
      tradeoff: 'The B.A. leaves room for more consistent lab time. Operating systems and the B.S. science sequence fall outside this schedule.',
      guardrail: 'Use one major extracurricular commitment per term. Make the Year 4 practicum and research serve the same subject if feasible, with distinct work for each course.',
      terms: [
        {
          label: 'Year 1 · Fall',
          courses: [calculusI, models, writing, thriving, seminar],
          focus: 'Use the first term to establish study habits and build a small analysis from a public dataset.',
        },
        {
          label: 'Year 1 · Spring',
          courses: [calculusII, introProgramming, spanishI, biology, literacy],
          focus: 'Finish first-year foundations, start language, and learn to test and document code.',
        },
        {
          label: 'Year 2 · Fall',
          courses: [multivariable, discrete, dataStructures, spanishII, power],
          focus: 'Apply to CS and choose two labs whose work you can explain from a recent paper.',
        },
        {
          label: 'Year 2 · Spring',
          courses: [linearAlgebra, systems, programming, probability, spanishIII, fitness],
          focus: 'Build the prerequisites for upper-level computing and find a bounded lab assignment.',
        },
        {
          label: 'Year 3 · Fall',
          courses: [organization, databases, dataMethods, analysis, aesthetic],
          focus: 'Own a dataset, metric, or test harness for one lab project. Record where the evaluation data came from and how the scoring works.',
        },
        {
          label: 'Year 3 · Spring',
          courses: [algorithms, engineering, optimization, stochastic, global],
          focus: 'Develop a research proposal with a measurable result and a feasible summer plan.',
        },
        {
          label: 'Year 4 · Fall',
          courses: [computerLearning, webProgramming, mathematicalStatistics, decisions, ethics],
          focus: 'Run the main experiments and document the baseline, uncertainty, and representative failure cases.',
        },
        {
          label: 'Year 4 · Spring',
          courses: [mentoredCS, timeSeries, creative, philosophy, practicum],
          focus: 'Turn results into a poster or software release. If COMP 495 is unavailable, use COMP 455 for the CS elective and plan an approved Research and Discovery course with advising.',
        },
      ],
      summer: 'After Year 1, reproduce a published benchmark result on a small sample. After Year 2, apply for SURF if you have a faculty mentor and a feasible question. After Year 3, seek a lab placement or evaluation internship where you can own one metric, dataset, or tool.',
    },
    {
      id: 'balanced',
      name: 'Statistics and a substantial build',
      degree: 'Statistics and Analytics B.S. + Computer Science minor',
      load: '14–16 credits per term, 122 planned',
      weeklyHours: '42–49 hours in active weeks, including 4–6 for one project or lab commitment',
      goal: 'Build depth in probability, inference, and optimization. Use it to design a consumer or product experiment and make a defensible decision from the results.',
      tradeoff: 'The CS minor covers programming, systems, and databases. Use the larger project to practice engineering beyond those six courses.',
      guardrail: 'Keep one main project at a time. When the practicum, research course, or capstone supplies that project, fold its time into the course workload.',
      terms: [
        {
          label: 'Year 1 · Fall',
          courses: [calculusI, models, writing, thriving, seminar],
          focus: 'Work through an end-to-end data analysis and write up what the data can support.',
        },
        {
          label: 'Year 1 · Spring',
          courses: [calculusII, introProgramming, spanishI, biology, literacy],
          focus: 'Learn programming and join a campus data challenge if the term has room.',
        },
        {
          label: 'Year 2 · Fall',
          courses: [multivariable, discrete, dataStructures, spanishII, power],
          focus: 'Complete discrete math and data structures. Check minor enrollment and plan an open-enrollment backup for COMP 421.',
        },
        {
          label: 'Year 2 · Spring',
          courses: [linearAlgebra, systems, probability, spanishIII, aesthetic],
          focus: 'Learn to reason about uncertainty and build one prototype with a small dataset.',
        },
        {
          label: 'Year 3 · Fall',
          courses: [programming, dataMethods, optimization, analysis, global],
          focus: 'Build a reproducible model and explain its decisions with clear diagnostics.',
        },
        {
          label: 'Year 3 · Spring',
          courses: [organization, stochastic, mathematicalStatistics, ethics, practicum],
          focus: 'Use the practicum as the main applied project. If the partner brief fits, define one product outcome and document how it can be measured responsibly.',
        },
        {
          label: 'Year 4 · Fall',
          courses: [databases, statisticalLearning, 'STOR 496 · Undergraduate Reading and Research in Statistics and Operations Research, with approval (3)', philosophy, economics],
          focus: 'Work with a faculty mentor on one question. Use an approved Research and Discovery course if STOR 496 is unavailable. For the minor elective, COMP 423 or COMP 426 can substitute if seats allow.',
        },
        {
          label: 'Year 4 · Spring',
          courses: [capstone, econometricsIntro, creative, 'MATH 383 · First Course in Differential Equations (3)', fitness],
          focus: 'Finish the capstone and demonstrate the result to a research or product audience.',
        },
      ],
      summer: 'After Year 1, write a customer discovery brief with feedback from 1789. In a later summer, use Carolina Innovators Connect to look for a startup internship where you can own one research or measurement task. Consider the student accelerator if you have a team and a product to validate.',
    },
  ],
  focusTracks: [
    {
      id: 'ai-safety-evaluation',
      name: 'Technical AI safety and model evaluation',
      aim: 'Build a reproducible test for one language model failure, such as confident factual errors or sensitivity to wording. Estimate uncertainty and test whether a specific mitigation improves the result.',
      degreeFit: 'Start with the ambitious CS B.A. and Statistics and Analytics B.S. double major. COMP 562 and the planned statistics courses support the methods, and COMP 495 can anchor the senior project. For deeper language-model work, ask advising to approve COMP 586 in the COMP 426 elective slot and check the effect on breadth. Keep the base schedule if the section or substitution is unavailable.',
      coursePlan: [
        {
          course: 'STOR 455 · Methods of Data Analysis (3)',
          purpose: 'Use regression and diagnostics to test which characteristics predict failures and check how sensitive results are to the analysis choices.',
          access: 'Requires STOR 120 or STOR 155. Already in the base routes.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'STOR 555 · Mathematical Statistics (3)',
          purpose: 'Use sampling distributions, interval estimates, and hypothesis tests to quantify how much confidence to place in model comparisons.',
          access: 'Requires STOR 435 or STOR 535. Already in the base routes.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'COMP 562 · Introduction to Machine Learning (3)',
          purpose: 'Compare simple baselines and learned models with controlled data splits and fixed scoring. Add calibration checks in the project when the model exposes comparable confidence scores.',
          access: 'The planned prerequisite path requires C or better in COMP 211, COMP 301, MATH 233, MATH 347, and STOR 435. CS majors have initial registration priority for upper-division courses.',
          href: 'https://catalog.unc.edu/courses/comp/',
        },
        {
          course: 'COMP 586 · Natural Language Processing (3)',
          purpose: 'Study text classification and language modeling, then test a model on paired prompts that preserve the question while changing its wording.',
          access: 'Requires C or better in COMP 301 and COMP 311. Check upper-division seat access and have advising confirm the CS elective substitution.',
          href: 'https://catalog.unc.edu/courses/comp/',
        },
        {
          course: 'STOR 323I · Ethics of Machine Learning in Society (3)',
          purpose: 'Translate privacy, transparency, and bias concerns into a short evaluation plan with a clear statement of who could be affected by errors.',
          access: 'Requires STOR 120 or STOR 320. The catalog lists FC-VALUES and Interdisciplinary credit.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'STOR 565 · Machine Learning (3)',
          purpose: 'Build a statistical baseline and use cross-validation to separate improvements from overfitting.',
          access: 'The planned prerequisite path is MATH 381 plus STOR 435. This is already in the very ambitious and balanced routes and gives the CS-minor route a statistics-side ML anchor.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'COMP 495 · Mentored Research in Computer Science (3)',
          purpose: 'Get faculty feedback on one evaluation protocol and produce code, a short report, and a poster suitable for a research audience.',
          access: 'CS majors only. Requires a supervising CS faculty member, instructor permission, and an approved learning contract.',
          href: 'https://cs.unc.edu/undergraduate/learning-contracts/',
        },
      ],
      timeline: [
        {
          stage: 'Year 1',
          courses: 'Fall — STOR 120 and MATH 231 for distributions and sampling. Spring — COMP 110 and MATH 232 for the first scripted analysis.',
          activity: 'Use the Office for Undergraduate Research to find an introductory event. Try scoring a small public TruthfulQA multiple-choice sample against a simple baseline.',
          output: 'A runnable notebook with a dataset citation, a scoring check, and a short description of the errors you saw.',
        },
        {
          stage: 'Year 2',
          courses: 'Fall — COMP 210, MATH 381, and MATH 233. Apply to the CS major. Spring — COMP 211, COMP 301, MATH 347, and STOR 435.',
          activity: 'Read a MURGe-Lab or UNITES Lab paper on factuality, calibration, or evaluation. Reproduce one table on a small subset, then ask about a specific contribution if a mentor has capacity. Explore SURF with that mentor.',
          output: 'One reproduction with model and dataset versions, a baseline, and an error interval.',
        },
        {
          stage: 'Year 3',
          courses: 'Fall — COMP 311 and STOR 455. Spring — COMP 423 and COMP 550 on the ambitious route. Once COMP 311 is complete, COMP 586 becomes an optional elective if advising approves a swap.',
          activity: 'Take one lab or independent project. Use HELM as a methods reference and test prompt wording or factuality with public benchmarks and models you are authorized to run.',
          output: 'A versioned evaluation script, a development and test split, a scoring rubric, and a small pilot report.',
        },
        {
          stage: 'Year 4',
          courses: 'Fall — COMP 562, STOR 555, and STOR 323I. Spring — COMP 495 if approved, using the base route’s backup when a contract is unavailable.',
          activity: 'Run the fixed protocol on two models or two configurations. Compare results on matched examples, review failures, and submit a poster to UNC’s Celebration of Undergraduate Research if eligible.',
          output: 'A reproducible evaluation release with uncertainty intervals, failure examples, a mitigation comparison, and a clear account of benchmark limitations.',
        },
      ],
      workload: {
        stretch: 'Use the existing COMP 562, STOR 565, and COMP 495 sequence for one evaluation. Fold a simple results viewer into the build already budgeted and save any broader model comparison for summer.',
        ambitious: 'Reserve the existing 6–8 project hours for one lab relationship and one benchmark. Bring the research question into COMP 495 and keep any practicum deliverable distinct.',
        balanced: 'Use STOR 565 with STOR 496 if approved, or use the practicum or a suitable STOR 697 project. Spend the existing 4–6 project hours on one failure mode and one baseline comparison.',
      },
      capstone: 'Evaluate factual accuracy for an assistant answering questions about a public product help center. Compare a simple baseline with retrieval from the help documents, using a fixed set of questions and paired paraphrases. Publish aggregate scores, uncertainty, and representative failures with reproducible code and a short recommendation about when to abstain.',
      sources: [
        { label: 'UNC CS B.A. electives and AI coursework', href: 'https://catalog.unc.edu/undergraduate/programs-study/computer-science-major-ba/' },
        { label: 'UNC CS seat priority and registration', href: 'https://cs.unc.edu/undergraduate/undergraduate-program-faq/' },
        { label: 'MURGe-Lab research on language model reliability', href: 'https://murgelab.cs.unc.edu/' },
        { label: 'UNITES Lab trustworthy AI and evaluation research', href: 'https://unites-lab.github.io/' },
        { label: 'UNC undergraduate research, SURF, and research showcase', href: 'https://catalog.unc.edu/undergraduate/academic-enrichment/undergraduate-research/' },
        { label: 'Stanford HELM evaluation framework', href: 'https://crfm.stanford.edu/helm/index.html' },
        { label: 'TruthfulQA benchmark and scoring data', href: 'https://github.com/sylinrl/TruthfulQA' },
      ],
    },
    {
      id: 'marketing-experimentation',
      name: 'Marketing, consumer insights, and product experimentation',
      aim: 'Connect customer discovery, positioning, and audience research to a measurable product decision. Use controlled experiments to estimate whether a change improves activation or retention, with trust and privacy guardrails.',
      degreeFit: 'Start with the balanced Statistics and Analytics B.S. and CS minor. STOR 455, the practicum, and the capstone supply the quantitative and applied work. Look for one marketing course sequence if seats and the degree audit allow. Use adviser-approved elective or breadth substitutions and keep the planned credit load, major and minor requirements, and general education coverage intact.',
      coursePlan: [
        {
          course: 'BUSI 406 · Marketing (3)',
          purpose: 'Frame a market, identify a customer segment, and develop a positioning or channel hypothesis you can test.',
          access: 'Upper-level BUSI enrollment starts after Year 1. Non-business students can enroll in up to one BUSI course per term and five total, subject to eligible sections and space at open enrollment. Check ConnectCarolina section notes.',
          href: 'https://catalog.unc.edu/courses/busi/',
        },
        {
          course: 'BUSI 565 · Marketing Research Design and Analysis (3)',
          purpose: 'Develop a research brief with a sampling plan, a survey or experiment, and a decision the findings will inform.',
          access: 'Requires BUSI 406. Non-business open-enrollment rules apply. The catalog lists Research and Discovery credit. Ask advising whether it can fill that slot in your schedule.',
          href: 'https://catalog.unc.edu/courses/busi/',
        },
        {
          course: 'MEJO 137 · Principles of Advertising and Public Relations (3)',
          purpose: 'Learn how to connect a message and campaign to a specific audience and an outcome you can measure.',
          access: 'Check the section with Hussman before counting on a seat. Many MEJO sections restrict enrollment, and Hussman’s advertising and public relations minor has a separate application.',
          href: 'https://catalog.unc.edu/courses/mejo/',
        },
        {
          course: 'MEJO 379 · Advertising and Public Relations Research (3)',
          purpose: 'Combine interview findings and quantitative results to assess a campaign, audience, or message.',
          access: 'Requires MEJO 137. Verify section access with Hussman. The catalog lists FC-QUANT and Research and Discovery credit.',
          href: 'https://catalog.unc.edu/courses/mejo/',
        },
        {
          course: 'STOR 455 · Methods of Data Analysis (3)',
          purpose: 'Use two-sample comparisons and regression diagnostics to analyze a test. Track the assignment mechanism before making causal claims.',
          access: 'Requires STOR 120 or STOR 155. Already in the base routes.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'STOR 557 · Advanced Methods of Data Analysis (3)',
          purpose: 'Use generalized linear models to analyze binary outcomes such as signup or activation, and use random effects when measurements are grouped.',
          access: 'Requires STOR 455 and STOR 435 or STOR 535. It is a Statistics and Analytics Group A option. Ask advising about swapping it for STOR 555 in the balanced route.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
        {
          course: 'STOR 697 · Capstone (3)',
          purpose: 'Use a partner project to practice explaining effect size, uncertainty, and the next decision to stakeholders.',
          access: 'For Statistics and Analytics majors. Students are expected to have completed at least 75% of the major core. Project topics depend on participating partners.',
          href: 'https://catalog.unc.edu/courses/stor/',
        },
      ],
      timeline: [
        {
          stage: 'Year 1',
          courses: 'Fall — STOR 120 for measurement and sampling. Spring — COMP 110 for a small funnel analysis using public or synthetic data.',
          activity: 'Take one question about a campus service or student product to a 1789 mentoring session. Sketch the intended audience and one action the product should help them complete.',
          output: 'A one-page audience and positioning brief with a funnel, a primary metric, and a clear denominator.',
        },
        {
          stage: 'Year 2',
          courses: 'Fall — COMP 210 and MATH 381. Spring — STOR 435 and MATH 347. Consider MEJO 137 in an approved elective slot if a section permits enrollment.',
          activity: 'Use 1789 mentoring to refine a customer discovery script. For an authorized discovery project, work with a small set of consenting users. For human-subjects research, check UNC’s IRB process with a faculty mentor before recruiting or collecting data.',
          output: 'A brief with audience assumptions, consented or public evidence, and two messages to compare.',
        },
        {
          stage: 'Year 3',
          courses: 'Fall — STOR 455 and STOR 320, with BUSI 406 if a qualifying seat and approved slot open. Spring — DATA 481 or approved High-Impact Experience. After STOR 455 and probability, consider STOR 557 as an approved same-credit substitution in a term when it is offered.',
          activity: 'Use the practicum if its client brief fits. Otherwise, build an experiment plan using synthetic logs and ask for feedback through 1789. Look for one summer customer insights or growth analytics role through Carolina Innovators Connect.',
          output: 'An experiment plan with randomized assignment, a primary outcome, a minimum detectable effect, a fixed stopping rule, and a privacy guardrail.',
        },
        {
          stage: 'Year 4',
          courses: 'Fall — COMP 421 and ECON 101. If the prerequisite and seat work out, ask whether BUSI 565 or MEJO 379 can fill the Research and Discovery slot. Spring — STOR 697 and ECON 400 on the balanced route.',
          activity: 'Analyze an authorized partner experiment, a public randomized dataset, or a clearly labeled simulation. Review the result with the capstone sponsor if assigned, or with a 1789 mentor.',
          output: 'An experiment readout with effect size, uncertainty, trust guardrails, and a decision to launch, revise, or gather more evidence.',
        },
      ],
      workload: {
        stretch: 'Use the existing build to test positioning or onboarding for the evaluation tool. Choose one bounded 1789 session or a summer pilot, with marketing courses only if an approved substitution fits.',
        ambitious: 'Keep one term project. If the research question has a user-facing application, use a separate practicum brief to study how to communicate its results. Choose one marketing course when the audit and seats allow.',
        balanced: 'Start with one elective path, BUSI 406 then BUSI 565 or MEJO 137 then MEJO 379, subject to access and approved slots. If neither sequence fits, use STOR 455, the practicum, and 1789 to run the same project within the existing 4–6 hour project budget.',
      },
      capstone: 'Test whether an AI-assisted onboarding flow helps users complete a first task. Define activation before the test and pair it with incorrect guidance, opt-out, and user trust measures. Use a partner-approved pilot if available or demonstrate the analysis with public randomized data or a labeled simulation. Deliver a decision memo and a reproducible analysis.',
      sources: [
        { label: 'Kenan–Flagler enrollment for non-business students', href: 'https://www.kenan-flagler.unc.edu/programs/undergraduate-business/academics/non-major-business-course-request/' },
        { label: 'Hussman admission and course restrictions', href: 'https://catalog.unc.edu/undergraduate/schools-college/media-journalism/' },
        { label: 'Hussman advertising and public relations minor admission', href: 'https://catalog.unc.edu/undergraduate/programs-study/media-journalism-minor/' },
        { label: 'Statistics and Analytics elective groups and capstone', href: 'https://catalog.unc.edu/undergraduate/programs-study/statistics-analytics-majors-bs/' },
        { label: 'UNC 1789 student venture mentorship', href: 'https://1789hub.com/get-to-know-us/' },
        { label: 'Carolina Innovators Connect and startup internships', href: 'https://1789hub.com/startup-jobs-and-internships/' },
        { label: 'UNC IRB guidance for student research and class projects', href: 'https://www.med.unc.edu/healthsciences/research/wp-content/uploads/sites/888/2018/10/irb-guidelines-for-students.pdf' },
      ],
    },
  ],
  alternatives: [
    {
      name: 'Applied mathematics and economics',
      degree: 'Mathematics B.S., Applied Option + Economics B.A. or B.S.',
      courses: [
        'MATH 231 → MATH 232 → MATH 233, then MATH 383 First Course in Differential Equations (3). Take MATH 347 after MATH 232 and MATH 381 after MATH 232 or a B in MATH 231.',
        'MATH 521 Advanced Calculus I (3) follows MATH 233 and MATH 381. Take MATH 560 Optimization with Applications in Machine Learning (3) after MATH 233, MATH 347, and COMP 110.',
        'ECON 101 Introduction to Economics (4) + MATH 231 unlock ECON 400 Introduction to Data Science and Econometrics (4) and ECON 410 Intermediate Microeconomics (4), subject to their grade requirements.',
        'After ECON 410, take ECON 420 Intermediate Macroeconomics (3). After ECON 400 and ECON 410, take ECON 470 Econometrics (3), then ECON 573I Machine Learning and Econometrics (3).',
      ],
      fit: 'Choose this emphasis for mathematical modeling, economic research, or policy analysis with stronger theory.',
      tradeoff: 'The Applied Option also requires physics and advanced electives. The economics B.S. adds econometrics and more advanced electives than the B.A. Use the catalog to audit both majors and map any computing electives separately.',
      href: 'https://catalog.unc.edu/undergraduate/programs-study/mathematics-major-bs/#requirementstext',
    },
    {
      name: 'Data science and applied machine learning',
      degree: 'Data Science B.S.',
      courses: [
        'DATA 110 Introduction to Data Science (3), MATH 231 → 232 → 233, MATH 347, one discrete math course, and one approved statistics or programming gateway form the admissions course set.',
        'DATA 215 Computational Doing (3) can accompany DATA 110. Take DATA 441 Statistical and Mathematical Foundations of Data Science (3) after MATH 347 and STOR 435 or an approved probability option.',
        'Take STOR 415 Introduction to Optimization (3) after linear algebra and discrete math, and STOR 565 Machine Learning (3) after MATH 381 or STOR 315 and probability.',
      ],
      fit: 'Choose this emphasis for machine learning, data communication, and a technical portfolio focused on working with data.',
      tradeoff: 'The major has separate admissions and a published 3.0 cumulative GPA minimum. Confirm the application cycle and how it treats outstanding prerequisites. Use the course audit to map remaining core and concentration requirements.',
      href: 'https://catalog.unc.edu/undergraduate/programs-study/data-science-major-bs/',
    },
  ],
  opportunities: [
    {
      name: 'UNC Computer Science mentored research',
      detail: 'COMP 495 gives research credit for work directly supervised by CS faculty. The department also points students to openings for paid, volunteer, and course-credit research.',
      eligibility: 'COMP 495 is for CS majors and requires instructor permission and an approved learning contract.',
      nextStep: 'Read a recent lab paper, reproduce one result, and propose a small task to the faculty mentor.',
      href: 'https://cs.unc.edu/undergraduate/learning-contracts/',
    },
    {
      name: 'STOR research and senior honors thesis',
      detail: 'STOR 496 offers 1–3 credits for supervised reading or research. STOR 691H and STOR 692H form a two-semester senior honors thesis sequence.',
      eligibility: 'STOR 496 needs director approval. Honors requires program approval and at least 3.3 overall and in statistics and analytics courses by the semester before graduation.',
      nextStep: 'Ask about a project after probability or optimization. For a thesis, secure a mentor and map the two-course sequence before senior year.',
      href: 'https://catalog.unc.edu/undergraduate/programs-study/statistics-analytics-majors-bs/',
    },
    {
      name: 'Office for Undergraduate Research and SURF',
      detail: 'The office maintains an opportunities database, advises students, and administers competitive Summer Undergraduate Research Fellowships and the spring research showcase.',
      eligibility: 'The office supports UNC undergraduates across disciplines. Check the current fellowship application for cycle-specific eligibility and funding terms.',
      nextStep: 'Find a faculty mentor in fall, outline a summer question and deliverables, and confirm the next SURF deadline.',
      href: 'https://catalog.unc.edu/undergraduate/academic-enrichment/undergraduate-research/',
    },
    {
      name: 'UNC VisuaLab',
      detail: 'The lab works on visualization, graphics, and human-centered analytics. Its student opportunities page describes ways to contribute to research.',
      eligibility: 'The lab invites inquiries from bachelor’s students. Specific project openings depend on faculty and graduate mentor capacity.',
      nextStep: 'Choose a current research theme and make a small interactive visualization before asking about an opening.',
      href: 'https://unc-visualab.org/positions.html',
    },
    {
      name: 'Carolina Analytics and Data Science',
      detail: 'The student group runs the Carolina Data Challenge, a weekend hackathon for testing an analysis or prototype with a team.',
      eligibility: 'Check the next event’s registration and participation rules.',
      nextStep: 'Join a team and leave the event with a documented model, reproducible dataset, and short demo.',
      href: 'https://github.com/CarolinaDataScience',
    },
    {
      name: '1789 Student Innovation Community',
      detail: 'UNC’s student entrepreneurship hub offers mentor office hours, competitions, and opportunities to apply for early venture funding.',
      eligibility: 'UNC students can join the community. Funding and competitions have their own applications.',
      nextStep: 'Bring interview notes and a prototype to an office hour, then agree on one test you can run with users.',
      href: 'https://1789hub.com/',
    },
    {
      name: 'Launch Chapel Hill student accelerators',
      detail: 'Student venture teams can apply to a summer accelerator for customer discovery, product validation, mentorship, and pitch practice.',
      eligibility: 'The student accelerator requires a current undergraduate or graduate student founder. Check the next cycle’s team and stage criteria.',
      nextStep: 'Interview users, test a wireframe or MVP, and apply when you can show what you learned.',
      href: 'https://www.launchchapelhill.com/summer-student-accelerators-1',
    },
  ],
  sources: [
    { label: 'CS major admissions and current eligibility', href: 'https://cs.unc.edu/undergraduate/cs-admissions/' },
    { label: 'Computer Science B.S.', href: 'https://catalog.unc.edu/undergraduate/programs-study/computer-science-major-bs/' },
    { label: 'Computer Science B.A.', href: 'https://catalog.unc.edu/undergraduate/programs-study/computer-science-major-ba/' },
    { label: 'Computer Science minor', href: 'https://catalog.unc.edu/undergraduate/programs-study/computer-science-minor/' },
    { label: 'CS minor enrollment and seat priority', href: 'https://cs.unc.edu/undergraduate/undergraduate-program-faq/' },
    { label: 'Statistics and Analytics B.S.', href: 'https://catalog.unc.edu/undergraduate/programs-study/statistics-analytics-majors-bs/' },
    { label: 'Mathematics B.S. and Applied Option', href: 'https://catalog.unc.edu/undergraduate/programs-study/mathematics-major-bs/' },
    { label: 'Economics B.A.', href: 'https://catalog.unc.edu/undergraduate/programs-study/economics-major-ba/' },
    { label: 'Economics B.S.', href: 'https://catalog.unc.edu/undergraduate/programs-study/economics-major-bs/' },
    { label: 'Data Science B.S. and admission requirements', href: 'https://catalog.unc.edu/undergraduate/programs-study/data-science-major-bs/' },
    { label: 'COMP course titles and prerequisites', href: 'https://catalog.unc.edu/courses/comp/' },
    { label: 'STOR course titles and prerequisites', href: 'https://catalog.unc.edu/courses/stor/' },
    { label: 'MATH course titles and prerequisites', href: 'https://catalog.unc.edu/courses/math/' },
    { label: 'ECON course titles and prerequisites', href: 'https://catalog.unc.edu/courses/econ/' },
    { label: 'DATA course titles and prerequisites', href: 'https://catalog.unc.edu/courses/data/' },
    { label: 'IDEAs in Action general education', href: 'https://catalog.unc.edu/undergraduate/ideas-in-action/' },
    { label: 'Degree requirements and major overlap', href: 'https://catalog.unc.edu/undergraduate/degree-requirements/' },
    { label: 'Registrar credit limits', href: 'https://registrar.unc.edu/registration-guidelines/' },
  ],
};
