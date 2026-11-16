// A planning example based on Stanford's 2026–27 catalog and published schedules.
const math51 = 'MATH 51 · Linear Algebra, Multivariable Calculus, and Modern Applications (5 units)';
const math52 = 'MATH 52 · Integral Calculus of Several Variables (5 units)';
const math53 = 'MATH 53 · Differential Equations with Linear Algebra, Fourier Methods, and Modern Applications (5 units)';
const matrix = 'MATH 113 · Linear Algebra and Matrix Theory (4 units)';
const proofs = 'CS 103 · Mathematical Foundations of Computing (5 units)';
const programming = 'CS 106B · Programming Abstractions (5 units)';
const data = 'DATASCI 112 · Principles of Data Science (5 units)';
const probability = 'STATS 117 · Introduction to Probability Theory (3 units planned)';
const statistics = 'STATS 118 · Probability Theory for Statistical Inference (4 units planned)';
const applied = 'STATS 191 · Introduction to Applied Statistics (3 units)';
const theory = 'STATS 200 · Introduction to Theoretical Statistics (4 units)';
const stochastic = 'STATS 217 · Introduction to Stochastic Processes I (3 units)';
const learning = 'STATS 202 · Statistical Learning and Data Science (3 units)';
const optimize = 'MS&E 111DS · Introduction to Optimization: Data Science (4 units planned)';
const policy = 'CS 182 · Ethics, Public Policy, and Technological Change (5 units)';
const databases = 'CS 145 · Intro to Modern Data Systems (4 units)';
const systems = 'CS 107 · Computer Organization and Systems (5 units)';
const writing = 'PWR 2 · Writing and Rhetoric 2 (4 units; assigned quarter)';
const ce = 'Ways · Creative Expression (2 units planned)';
const breadth = 'Ways, language or approved breadth slot (3 units planned)';
const narratives = 'DATASCI 120 · Data Narratives (3 units)';
const portfolio = 'DATASCI 190 · The Data Science Experience (1 unit)';
const econ1 = 'ECON 1 · Principles of Economics (5 units)';
const econ50 = 'ECON 50 · Economic Analysis I (5 units)';
const analysis = 'MATH 115 · Functions of a Real Variable (4 units)';
const csProbability = 'CS 109 · Introduction to Probability for Computer Scientists (5 units)';
const operatingSystems = 'CS 111 · Operating Systems Principles (5 units)';
const algorithms = 'CS 161 · Design and Analysis of Algorithms (5 units)';
const engineeringMatrices = 'ENGR 108 · Introduction to Matrix Methods (5 units)';
const msProbability = 'MS&E 120 · Introduction to Probability (4 units)';
const msStochastic = 'MS&E 121 · Introduction to Stochastic Modeling (4 units)';
const msStatistics = 'MS&E 125 · Introduction to Applied Statistics (4 units)';
const organizations = 'MS&E 180 · Organizations: Theory and Management (4 units)';
const seniorProject = 'MS&E 108 · Senior Project (5 units)';
const futureWork = 'MS&E 184 · The Future of Work: What Will it Mean to Build AI-Augmented Organizations? (4 units)';
const corporateFinance = 'MS&E 146 · Corporate Financial Management (4 units)';
const investment = 'MS&E 245A · Investment Science (4 units)';
const entrepreneurship = 'ENGR 148 · Principled Entrepreneurial Decisions (3 units, by application)';
const causalData = 'MS&E 226 · Fundamentals of Data Science: Prediction, Inference, Causality (3 units)';
const socialImpact = 'MS&E 134 · Data Science for Social Impact (5 units)';
const simulation = 'MS&E 223 · Stochastic Simulation and Monte Carlo Methods (3 units)';
const gameTheory = 'MS&E 232 · Introduction to Game Theory (3 units)';
const breadth4 = 'Approved Ways, language or remaining degree requirement (4 units planned)';
const sequence = (quarters) => quarters.map(([courses, focus], index) => ({
  label: `Arrival year ${Math.floor(index / 3) + 1} · ${['Autumn', 'Winter', 'Spring'][index % 3]}`,
  courses,
  focus,
}));

export const STANFORD = {
  id: 'stanford',
  name: 'Stanford',
  summary: 'If a transfer from UNC works out, test your first choice of Management Science and Engineering plus Computer Science against a real degree audit. Compare a double major, one engineering major with depth in computing, and a single quantitative major with more room for a project.',
  assumptions: [
    'Use your reported calculus, statistics, C++, linear algebra, multivariable calculus, differential equations, discrete math, microeconomics and macroeconomics as preparation. Save official scores, transcripts and syllabi for evaluation. Ask about MATH 19–21 and 51–53, CS 106A/B and 103, ECON 1, and the specific probability requirements. An introductory statistics course and a C++ course may cover different material from the Stanford requirements.',
    'Stanford accepts up to 90 quarter units for incoming transfers and requires at least 90 units and two years of full-time enrollment at Stanford for a single bachelor’s degree. At least 180 units total are required. A course can count toward that total without satisfying a prerequisite, major or breadth requirement. Have the Registrar and the department evaluate your transcript and syllabi.',
    'The shown timelines assume WR 1 and language are already fulfilled. If either is pending, budget its approved courses or placement separately. A full language sequence may change the timeline. Take PWR 2 in the assigned quarter and confirm your Ways count. For example, 90 eligible transfer units require five distinct Ways and 75–89 require six. Count each certified course toward one Way.',
    'The engineering examples assume 10 approved units for MATH 19–21 or equivalent, an approved five-unit MATH 51 equivalent, ECON 1 equivalency and CS 106A credit or the MS&E waiver after CS 106B. Without MATH 51 preparation, take it first and replan around the autumn offering of MS&E 120. The Data Science example starts with MATH 51 and assumes preparation through MATH 21 or qualifying AP Calculus BC and CS 106A-level Python. With C++ and limited Python, ask about CS 193Q or CS 106A and rebalance the plan.',
    'The examples use 2026–27 offerings as a reference. Check later schedules, prerequisites, sections and seats. The third Stanford year shown for the double major depends on your degree audit and time-to-degree review. Stanford can limit a student to one major if pursuing several unduly delays graduation. Confirm your approved timeline with advising and both departments.',
    'If you enter Stanford as a first-year student, use year 1 for calculus, programming, COLLEGE and writing. In year 2 start systems, probability, economics and optimization. Use years 3–4 for depth, breadth and the capstone, with both engineering program sheets audited early if you pursue the double major.',
  ],
  rules: [
    'MS&E plus CS is one B.S. with two majors and a 180-unit university minimum. The Bulletin lists 95 major units for MS&E and 93 for CS Systems. Approved foundations such as CS 106B, MATH 51 and eligible shared engineering school requirements may overlap. Check both sheets with the School of Engineering. Plan separate major depth and capstones, and count each course’s units once toward 180.',
    'A secondary major generally permits overlap and appears on the transcript, with the primary major on the diploma. It still requires the full secondary curriculum and department certification. A B.A.S. and concurrent B.A. plus B.S. apply to different degree types. The two separate degrees require 225 units total and 135 at Stanford for a transfer.',
    'MS&E requires eight depth courses, with at least two each in Finance and Decision, Operations and Analytics, and Organizations, Technology and Policy. The CS Systems track requires seven depth courses and at least 25 depth units, plus the CS core, engineering and science requirements, and a senior project. Audit the prerequisites and at-Stanford requirements on both sheets.',
    'Data Science can waive its CS 106A major requirement after successful DATASCI 112 with prior Python experience. CS 182 separately requires CS 106A or accepted preparation for enrollment. If you use a Data Science or MS&E major waiver, confirm eligibility with CS. CS 139 is a winter option on the current Technology in Society and Data Science ethics lists. If you substitute it, replace the two-unit difference and recheck Ethical Reasoning credit.',
    'A transfer can apply for a coterminal master’s after two non-summer Stanford quarters, 120 completed transcript units toward graduation and declaration of a major. The two programs must overlap by at least one quarter. Admission is separate; check department requirements, tuition and aid before depending on the option.',
    'Weekly hours are planning estimates: about three hours of class and study per unit, plus a bounded project. Count coursework projects as class time. Jobs and further commitments are separate. If the schedule leaves too little time for sleep, meals or recovery, scale back the project or move a course.',
  ],
  routes: [
    {
      id: 'stretch',
      name: 'Systems engineer with operations research depth',
      degree: 'One B.S. · Management Science and Engineering + Computer Science (Systems)',
      load: '18–19 quarter units planned',
      weeklyHours: '54–57 hours/week total, with class projects included',
      goal: 'Build reliable software for AI deployment and evaluation, then use optimization and probability to decide how an operation should run. The formal track is Systems. CS 229 and an evaluation-focused senior project give you room for machine learning.',
      tradeoff: 'The first six quarters build the two cores and much of MS&E depth. The last three are a conditional third Stanford year. Stanford considers eligible students for scholarships during the first 12 enrolled college quarters, including prior enrollment. Extra quarters to pursue a second major beyond 12 are ineligible for Stanford scholarship. Other aid may be available.',
      guardrail: 'Have advising compare the one-major and double-major graduation dates as soon as transfer credit posts. If a prerequisite, capstone or required depth course pushes the schedule beyond an approved timeline, switch to one major and keep the classes that serve your career goal.',
      terms: sequence([
        [[programming, engineeringMatrices, msProbability, writing], '18 units. Confirm MATH 51 and CS placement first. MS&E 120 runs in autumn and opens MS&E 121. Move writing if assigned to a different quarter.'],
        [[systems, csProbability, optimize, futureWork], '18 units. Keep CS 109 on the CS sheet and MS&E 120 on the MS&E sheet. MS&E 184 starts the organizations depth area.'],
        [[proofs, msStatistics, organizations, math52], '18 units. Finish proofs before CS 161. Use approved MATH 51 credit and MATH 52 as the two CS math electives. Count MATH 52 as the separate MS&E math or science elective only with school approval.'],
        [[econ50, 'ENGR 40M · An Intro to Making: What is EE? (5 units)', causalData, investment, ce], '19 units. ENGR 40M is a CS engineering fundamental. MS&E 245A starts finance depth after probability, statistics and optimization.'],
        [[msStochastic, algorithms, corporateFinance, policy], '18 units. CS 161 follows CS 103, 106B and 109. Audit CS 182 for Technology in Society on both sheets and check that the school allows the overlap.'],
        [[operatingSystems, simulation, gameTheory, socialImpact, breadth], '19 units. CS 111 follows CS 107. This is the six-quarter checkpoint. Recheck the remaining MS&E capstone and CS depth, science and senior-project requirements.'],
        [[databases, 'CS 144 · Introduction to Computer Networking (4 units planned)', 'CS 154 · Introduction to the Theory of Computation (4 units planned)', 'PHYSICS 41 · Mechanics (4 units)', 'CEE 63 · Weather and Storms (3 units)'], '19 units in the extension example. CS 145 follows algorithms and CS 144 follows operating systems preparation. Take physics placement early. PHYSICS 41 is the proposed shared science course and CEE 63 is the CS science elective.'],
        [[seniorProject, entrepreneurship, 'CS 194W · Software Project (3 units)', 'CS 229 · Machine Learning (4 units planned)', breadth], '18 units. Complete separate projects and use CS 194W for a reproducible evaluation tool. CS 229 requires Python and NumPy as well as math and probability preparation. Apply early to ENGR 148 or choose another approved organizations depth course.'],
        [['CS 112 · Operating Systems Kernel Implementation Project (3 units)', 'CS 143 · Compilers (4 units planned)', 'CS 166 · Advanced Data Structures (4 units planned)', 'PHYSICS 43 · Electricity and Magnetism (4 units)', breadth], '18 units. CS science totals 11 units with PHYSICS 41, PHYSICS 43 and CEE 63. For MS&E, the 26-unit math and statistics baseline, MATH 52 and the two physics courses reach at least 39 if the school approves the proposed overlap. Budget a separate approved course if it does not. Check Ways before setting graduation.'],
      ]),
      summer: 'Choose one software internship, CURIS project or operations research project. Use it to test whether you want to build systems full time or specialize in analytical decisions.',
    },
    {
      id: 'ambitious',
      name: 'Operations or product engineer who builds software',
      degree: 'Management Science and Engineering B.S. · CS systems electives',
      load: '16–18 quarter units planned',
      weeklyHours: '52–58 hours/week total, including 4 hours for a project',
      goal: 'Study operations, finance and organizations and learn enough systems to build a tool that supports a real decision.',
      tradeoff: 'The six-quarter example needs at least 80 usable incoming units to reach 180 as written, plus a Ways audit. MATH 52 and CHEM 31A bring the 26-unit math and statistics baseline to at least 36, the school minimum. The CS electives form an informal focus. A CS minor adds CS 103, CS 109 and a second elective from a different area, such as CS 161 after its prerequisites.',
      guardrail: 'Use CS 107 and CS 111 for depth even if the minor does not fit. Decide whether to add the minor after reviewing the required courses, allowable overlap and graduation date. An approved science course can take priority over a computing elective.',
      terms: sequence([
        [[programming, engineeringMatrices, msProbability, breadth], '17 units. Check calculus, math and programming approvals. MS&E 120 is the first step toward stochastic models.'],
        [[optimize, msStochastic, futureWork, writing], '16 units. Build a queueing or inventory model. MS&E 184 fills one organizations depth course.'],
        [[msStatistics, organizations, 'MS&E 140 · Accounting for Managers and Entrepreneurs (3 units)', math52], '16 units. Start Finance and Decision depth with accounting. MATH 52 is the additional approved math elective.'],
        [[econ50, causalData, systems, 'CHEM 31A · Chemical Principles I (5 units, subject to placement)'], '18 units. CHEM 31A fills the MS&E natural science slot and may cover a Ways category. CS 107 follows CS 106B. MS&E 226 follows calculus and probability.'],
        [[seniorProject, corporateFinance, entrepreneurship, policy], '17 units. Complete the writing and capstone project and the second finance and organizations courses. Apply to ENGR 148 and confirm the CS 182 prerequisite.'],
        [[simulation, gameTheory, socialImpact, operatingSystems], '16 units. These MS&E courses complete the example Operations and Analytics selection. CS 111 adds systems depth after CS 107.'],
      ]),
      summer: 'Compare an operations analytics internship with product or software engineering. Build an optimization prototype that can explain its recommendation to a user.',
    },
    {
      id: 'balanced',
      name: 'Data science and one substantial project',
      degree: 'Data Science B.S. · Mathematics and Computation',
      load: '14–16 quarter units planned',
      weeklyHours: '46–52 hours/week total: 42–48 class and study + 4 project',
      goal: 'Finish the quantitative foundation and have room to build one research, startup or community project.',
      tradeoff: 'This six-quarter example adds up to 90 Stanford units, so it needs the full 90 units of usable incoming credit to reach 180 as written.',
      guardrail: 'Choose one project with a modest weekly commitment. If the credit audit calls for more units, plan an extra quarter or an eligible summer course with advising.',
      terms: sequence([
        [[programming, math51, probability, breadth], '16 units. Pick a certified Way outside the technical categories already covered.'],
        [[systems, math52, statistics], '14 units. CS 107 follows CS 106B. STATS 118 follows STATS 117 and MATH 51, with MATH 52 allowed concurrently.'],
        [[matrix, math53, data, ce], '16 units. MATH 113 covers matrix theory and proofs. MATH 53 fills the subplan math slot. Build a dataset and a baseline in DATASCI 112.'],
        [[applied, theory, writing, breadth4], '15 units. Join the DATASCI 190 Canvas by the autumn study-list deadline. DATASCI 120 comes after STATS 191.'],
        [[optimize, stochastic, 'CME 108 · Introduction to Scientific Computing with Machine Learning Applications (3 units)', policy], '15 units. CS 107 and CME 108 fulfill the two computation slots.'],
        [[learning, analysis, simulation, narratives, portfolio], '14 units. Use MATH 115 and MS&E 223 as technical electives and finish writing and capstone.'],
      ]),
      summer: 'Do one internship, mentored study or scoped product experiment. Keep time available to rest and confirm the final-year course plan.',
    },
  ],
  alternatives: [
    {
      name: 'Operations, product and organizations',
      degree: 'Management Science and Engineering B.S.',
      courses: [math51, engineeringMatrices, econ1, econ50, optimize, msProbability, msStochastic, msStatistics, organizations, seniorProject],
      fit: 'Choose MS&E if you want to design decisions, systems or organizations. Try operations analytics, pricing or product roles. Start MATH 51 before MS&E 120 and 111DS; MS&E 120 feeds into MS&E 121. ECON 1 comes before ECON 50. MS&E 108 is the writing and capstone project.',
      tradeoff: 'The core sequence shown is part of a 95-unit minimum major. The plan also needs engineering and science requirements, Technology in Society, programming, and eight depth courses including at least two in each of the three MS&E areas. Check fall-only MS&E 120 and winter-only MS&E 108 in your entry cycle.',
      href: 'https://bulletin.stanford.edu/programs/MGTSC-BS',
    },
    {
      name: 'Model development, reliability and evaluation',
      degree: 'Computer Science B.S. · Artificial Intelligence track',
      courses: [programming, proofs, systems, csProbability, operatingSystems, algorithms, 'CS 221 · Artificial Intelligence: Principles and Techniques (4 units planned)', 'CS 229 · Machine Learning (4 units planned)'],
      fit: 'Choose the formal AI track if model development is the priority. CS 221 follows the programming, proofs, probability and algorithms foundation. Use a senior project to study model reliability or build an evaluation suite.',
      tradeoff: 'Audit the AI track’s depth categories and 25-unit, seven-course minimum separately from the Systems example. CS 221 and CS 229 are sample depth courses. If you pair CS with MS&E, build a new approved plan for both majors.',
      href: 'https://www.cs.stanford.edu/bs-program-sheets',
    },
    {
      name: 'Human-centered AI and cognition',
      degree: 'Symbolic Systems B.S. · Human-Centered Artificial Intelligence concentration',
      courses: ['SYMSYS 1 · Minds and Machines (4 units)', math51, programming, proofs, csProbability, 'PSYCH 1 · Introduction to Psychology (5 units)', 'PHIL 80 · Mind, Matter, and Meaning (5 units)', 'CS 147 · Introduction to Human-Computer Interaction Design (5 units)', futureWork, 'SYMSYS 196 · Independent Study (3 units planned, with approval)'],
      fit: 'Choose Symbolic Systems if you want to study what people and AI systems can do together. Take SYMSYS 1 before declaring, a separate philosophy course before PHIL 80, and CS 106B before CS 147. An approved practicum can study how people use or evaluate AI.',
      tradeoff: 'The B.S. minimum is 70 major units. Audit the calculus and linear algebra requirements, all four methods areas, cross-area course, advanced seminar, five-course concentration and capstone practicum and integrative requirements. Contact the concentration adviser early because the capstone plan has a junior-year deadline.',
      href: 'https://symsys.stanford.edu/undergraduates/major-policies-requirements/core-requirements',
    },
    {
      name: 'Statistics for markets and decisions',
      degree: 'Data Science B.S. · Quantitative Finance subplan',
      courses: [math51, data, probability, statistics, theory, econ50, optimize, stochastic, 'STATS 218 · Introduction to Stochastic Processes II (3 units)', corporateFinance, 'ECON 135 · Foundations of Finance (5 units)'],
      fit: 'Choose this subplan if you want statistical modeling and finance. ECON 50 follows ECON 1 and calculus. STATS 118 follows introductory probability and leads to theory, regression and advanced stochastic processes. Build a risk or forecasting project with a defensible baseline.',
      tradeoff: 'Complete the Data Science core, ethics, writing and capstone, plus the five-course Quantitative Finance subplan. It includes economics, a time-series option, two finance courses and a technical elective. Confirm the finance timetable and prerequisites before relying on either sample elective.',
      href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs/subplans-data-science-bs',
    },
    {
      name: 'Technology policy, innovation and organizations',
      degree: 'Science, Technology & Society B.S. · Innovation and Organization concentration',
      courses: ['STS 1 · Introduction to Science, Technology & Society (4 units)', 'AMSTUD 145 · Silicon Valley (5 units)', 'HISTORY 159 · Making History in Silicon Valley (3–5 units)', programming, csProbability, optimize, 'STS 200G · Doing the History of Science and Technology (5 units)'],
      fit: 'Choose STS if you want to understand who shapes technical systems and how those systems affect organizations and communities. Pair a sequence in computing or optimization with courses on technology and society. Use STS 200G as a possible senior capstone.',
      tradeoff: 'The major requires at least 76 units. The B.S. concentration uses eight technical and four sociocultural courses, including three concentration core courses. The B.A. reverses the eight/four split. Both have a separate program core. STS must approve the concentration plan, and AP credit cannot count toward this major.',
      href: 'https://sts.stanford.edu/academics/major-requirements',
    },
    {
      name: 'Microeconomics and econometrics',
      degree: 'Economics B.A. or B.S. · B.S. course example',
      courses: [econ1, econ50, math51, probability, analysis, 'ECON 102B · Applied Econometrics (5 units)', 'ECON 102C · Advanced Topics in Econometrics (5 units)'],
      fit: 'Choose Economics if your questions start with incentives, markets or policy. ECON 1 and calculus feed into ECON 50; the B.S. uses probability before ECON 102B, then ECON 102C. MATH 115 adds analysis.',
      tradeoff: 'The B.S. has an 85-unit major minimum with at least 75 of those units at Stanford in California. It also requires intermediate micro and macro, game theory, field courses and a writing capstone. Have the department map any transfer credit early; compare the B.A. before committing.',
      href: 'https://economics.stanford.edu/undergraduate/major/economics-bs',
    },
    {
      name: 'Applied math through the Mathematics major',
      degree: 'Mathematics B.S. · Applied course choices',
      courses: [math51, math52, math53, matrix, 'MATH 171 · Fundamental Concepts of Analysis (4 units)', 'MATH 195 · Senior Exploration and Synthesis (4 units; application required)'],
      fit: 'Choose Mathematics if you want analysis, linear algebra, differential equations and mathematical modeling at the center. MATH 51 leads to the multivariable sequence and MATH 113; take proof-based linear algebra before deeper analysis.',
      tradeoff: 'The major requires eight advanced Math courses and four electives, with at least six of the eight advanced courses at Stanford. MATH 195 can cover writing and capstone. A secondary major still needs an approved course plan; the Math department limits overlap.',
      href: 'https://mathematics.stanford.edu/academics/undergraduate-students/math-major',
    },
    {
      name: 'Algorithms and computer systems',
      degree: 'Computer Science B.S. · Systems or AI track',
      courses: [programming, proofs, systems, csProbability, operatingSystems, algorithms],
      fit: 'Choose CS if you want systems, software or AI as the main subject. CS 106B feeds into CS 107 and 109; CS 107 precedes CS 111, and CS 103, CS 106B and CS 109 prepare you for CS 161.',
      tradeoff: 'This is the CS core sequence. Audit the engineering and science requirements, track depth, writing and senior project on the program sheet for your track.',
      href: 'https://bulletin.stanford.edu/programs/CS-BS',
    },
  ],
  opportunities: [
    {
      name: 'CURIS summer research',
      detail: 'A CS faculty project, poster and ten weeks of full-time summer research, about 40 hours a week.',
      eligibility: 'Stanford undergraduates who maintain undergraduate status through the summer; project matching and funding rules apply.',
      nextStep: 'Check the next winter application and matching schedule, shortlist projects and prepare a code sample.',
      href: 'https://curis.cs.stanford.edu/summer/',
    },
    {
      name: 'DataSURF',
      detail: 'Ten weeks of in-person, faculty-mentored research in statistics or data science.',
      eligibility: 'Current Stanford undergraduates in the undergraduate tuition group, subject to project and program prerequisites.',
      nextStep: 'Read the project list and prepare a small analysis or course project that shows your methods.',
      href: 'https://datasciencemajor.stanford.edu/research-impact/data-science-undergraduate-research-focus',
    },
    {
      name: 'Research during the school year',
      detail: 'CS faculty projects can be available for course credit or by arrangement with a professor.',
      eligibility: 'Depends on the project, available supervision and preparation.',
      nextStep: 'Read one lab paper, reproduce a small result and use it to ask a specific research question.',
      href: 'https://www.cs.stanford.edu/bachelors/research-opportunities',
    },
    {
      name: 'Industry internships through CareerEd',
      detail: 'Find employer events, career coaching and internship postings through Stanford Career Education and Handshake.',
      eligibility: 'CareerEd supports Stanford undergraduates; employers set eligibility and timelines for each internship.',
      nextStep: 'Start in arrival autumn. Compare software, data science and operations or risk analyst roles, then tailor one project example to the strongest fit.',
      href: 'https://careered.stanford.edu/new-students-how-connect-careered',
    },
    {
      name: 'STVP Mayfield Fellows',
      detail: 'An entrepreneurship program with coursework, mentorship and a paid Bay Area startup placement.',
      eligibility: 'Active Stanford undergraduates and coterm students who can meet the cohort’s campus and summer commitments.',
      nextStep: 'The 2027 application is closed. Check the next eligible cycle and build or test a small product in the meantime.',
      href: 'https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program',
    },
  ],
  sources: [
    { label: 'Stanford transfer credit', href: 'https://admission.stanford.edu/apply/transfer/credit.html' },
    { label: 'Transfer enrollment and residency', href: 'https://admission.stanford.edu/apply/transfer/eligibility.html' },
    { label: 'Undergraduate unit and residency requirements', href: 'https://studentservices.stanford.edu/my-academics/earn-my-degree/undergraduate-degree-progress/undergraduate-degree-requirements' },
    { label: 'Stanford Bulletin: degree and transfer residency rules', href: 'https://bulletin.stanford.edu/academic-polices/degree-requirements/baccalaureate-degree-requirements' },
    { label: 'Ways, language and writing', href: 'https://bulletin.stanford.edu/academic-polices/degree-requirements/general-education' },
    { label: 'Stanford ExploreCourses catalog', href: 'https://explorecourses.stanford.edu/' },
    { label: 'Stanford units and expected work', href: 'https://bulletin.stanford.edu/academic-polices/courses/unit-of-credit' },
    { label: 'Data Science degrees and B.A. pathways', href: 'https://datasciencemajor.stanford.edu/academics/data-science-program-overview' },
    { label: 'Data Science B.S. requirements', href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs' },
    { label: 'CS 182 enrollment prerequisite', href: 'https://bulletin.stanford.edu/courses/2213951' },
    { label: 'Data Science subplans', href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs/subplans-data-science-bs' },
    { label: 'Data Science technical electives', href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs/technical-electives-data-science-bs' },
    { label: 'Data Science capstone and WIM', href: 'https://datasciencemajor.stanford.edu/academics/data-science-bs/capstone-data-science-bs' },
    { label: 'Mathematics major and overlap rules', href: 'https://mathematics.stanford.edu/academics/undergraduate-students/math-major' },
    { label: 'Math writing and capstone', href: 'https://mathematics.stanford.edu/academics/undergraduate-students/math-major/wim-capstone' },
    { label: 'Economics B.A.', href: 'https://economics.stanford.edu/undergraduate/major/economics-ba' },
    { label: 'MS&E program and requirements', href: 'https://ughb.stanford.edu/majors-minors/management-science-and-engineering-program' },
    { label: 'CS B.S. requirements by subplan', href: 'https://bulletin.stanford.edu/programs/CS-BS' },
    { label: 'CS program sheets by track', href: 'https://www.cs.stanford.edu/bs-program-sheets' },
    { label: 'CS minor requirements', href: 'https://www.cs.stanford.edu/bachelors/cs-minor' },
    { label: 'CS 145 recommended preparation', href: 'https://bulletin.stanford.edu/courses/1056751' },
    { label: 'CS 229 preparation', href: 'https://bulletin.stanford.edu/courses/1057501' },
    { label: 'ENGR 148 application', href: 'https://web.stanford.edu/class/engr248/' },
    { label: 'Engineering approved science courses', href: 'https://ughb.stanford.edu/courses/science' },
    { label: 'Engineering Technology in Society list', href: 'https://ughb.stanford.edu/courses/tech-in-society' },
    { label: 'Financial aid for an additional year', href: 'https://financialaid.stanford.edu/aid/special/fifth_year.html' },
    { label: 'Symbolic Systems B.S. requirements', href: 'https://bulletin.stanford.edu/programs/SYMBO-BS' },
    { label: 'Symbolic Systems Human-Centered AI concentration', href: 'https://symsys.stanford.edu/undergraduates/concentrations/human-centered-artificial-intelligence-hai-concentration' },
    { label: 'STS Innovation and Organization course list', href: 'https://sts.stanford.edu/courses/innovation-and-organization' },
    { label: 'MS&E undergraduate internships and career outcomes', href: 'https://msandecareers.stanford.edu/employment-report/employment-report-bachelor-science-graduates' },
    { label: 'Double majors, secondary majors and dual degrees', href: 'https://advising.stanford.edu/current-students/advising-student-handbook/double-secondary-dual' },
    { label: 'Approved overlap across majors and minors', href: 'https://bulletin.stanford.edu/academic-polices/degree-requirements/ug-double-counting' },
    { label: 'Multiple majors and degree progress', href: 'https://bulletin.stanford.edu/academic-polices/degree-requirements/undergraduate-major' },
    { label: 'Undergraduate time-to-degree policy', href: 'https://bulletin.stanford.edu/academic-polices/academic-progress/undergrad-progress' },
    { label: 'Coterminal admissions requirements', href: 'https://bulletin.stanford.edu/academic-polices/admissions/coterminal' },
    { label: 'MS&E coterm overview', href: 'https://msande.stanford.edu/academics-admissions/graduate/ms-program/coterm-overview' },
  ],
};
