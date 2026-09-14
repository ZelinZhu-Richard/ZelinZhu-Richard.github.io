// Personal content retained from the previous site at 27e53264071e9ce9d5b690833f361e5d82e80cda.

export const LINKS = {
  email: 'richardrizzling@gmail.com',
  github: 'https://github.com/ZelinZhu-Richard',
  linkedin: 'https://www.linkedin.com/in/zelin-zhu/',
  x: 'https://x.com/zzl_richard',
  resume: '/Zelin_Zhu_CV.pdf',
};

export const ABOUT = {
  paragraphs: [
    "I'm a student at UNC Chapel Hill studying computer science and economics. I'm not just enthusiastic about AI — I'm obsessed with it, and I build my startup and my brand in public, one shipped thing at a time.",
    "I care about making my family better, my community better, and the world better — roughly in that order, and all at once. Right now that looks like machine learning research, quant experiments, and hosting events that bring people into the room.",
    "The destination: algorithm developer, trader, hedge fund manager. The route: whatever compounds fastest.",
    "Off the keyboard, you'll find me skiing, or standing in the snow at 3am watching the northern lights.",
  ],
};

export const EXPERIENCE = [
  {
    when: 'Now',
    title: 'Machine Learning Research',
    org: 'UNC PRIMES',
    desc: 'Selected for UNC\'s Program for Research in Image Processing and Machine learning for Emerging Scholars. Deep learning for neuroscience image processing — building and training models that make sense of brain imaging data.',
    tags: ['Deep Learning', 'Computer Vision', 'Neuroscience'],
  },
  {
    when: 'Nov 2025 — Present',
    title: 'Founder',
    org: 'Al9ha (Nexus Tensor Alpha)',
    desc: 'AI-native quantitative trading research: a Mixture-of-Experts forecasting stack (TFT, MAML, N-BEATS) with regime-aware gating and a multi-LLM agent layer for unstructured signals.',
    tags: ['Quant', 'AI Agents', 'Forecasting'],
  },
  {
    when: 'Sep 2025 — Present',
    title: 'Quant Developer',
    org: 'MeridianAlgo',
    desc: 'Building Apex Analysis, an open-source ML-powered stock analysis platform, on a 5-person engineering team. Model training pipelines for equity prediction and signal generation.',
    tags: ['Python', 'scikit-learn', 'Open Source'],
  },
  {
    when: '2025 — 2026',
    title: 'Team Captain',
    org: 'Duke SCAI Hackathon · Wharton HSDSC',
    desc: 'Captained the only all-high-school team to a finalist spot at Duke SCAI, against grad students and professors. Modeling lead for Wharton\'s data science competition (Pythagorean Expectation + Bradley-Terry ensemble).',
    tags: ['Leadership', 'Modeling', 'Competition'],
  },
];

export const PROJECTS = [
  {
    name: 'Nexus Tensor Alpha',
    context: 'Personal · Open Source',
    year: '2026',
    oneLiner: 'AI-native quantitative research firm.',
    desc: 'Multi-agent system for hypothesis generation, backtesting, and risk-aware portfolio construction. Designed and built solo, end to end.',
    tags: ['AI Agents', 'Quant', 'Portfolio Construction'],
    live: 'https://al9ha.vercel.app/',
    repo: 'https://github.com/ZelinZhu-Richard/Nexus-Tensor-Alpha',
  },
  {
    name: 'EqualVoice',
    context: 'Duke SCAI Hackathon · Finalist',
    year: '2026',
    oneLiner: 'Accent bias benchmark for speech-to-text models.',
    desc: 'Measured word-error-rate disparity across accent groups in ASR systems. Captain and lead developer of the only all-high-school team in the finals.',
    tags: ['AI Evaluation', 'ASR', 'Bias Benchmarking'],
    live: 'https://devpost.com/software/equalvoice-jf1y79',
    repo: 'https://github.com/ZelinZhu-Richard/SCAI-duke-2026',
  },
  {
    name: 'Apex Analysis',
    context: 'MeridianAlgo · Open Source',
    year: '2025',
    oneLiner: 'Stock trading and analysis platform.',
    desc: 'ML-powered stock analysis with interactive visualizations and trading tools, built with a nonprofit dedicated to open financial tooling. Lead developer and main contributor.',
    tags: ['Open Source', 'Trading', 'Analysis'],
    live: 'https://apexanalysis.streamlit.app/',
    repo: 'https://github.com/ZelinZhu-Richard/Apex-Analysis',
  },
];

export const SKILLS = {
  buckets: [
    { label: 'Languages', items: ['Python', 'C++', 'JavaScript', 'TypeScript'] },
    { label: 'Frameworks', items: ['React', 'Next.js', 'FastAPI'] },
    { label: 'AI & ML', items: ['PyTorch', 'TensorFlow', 'NumPy', 'pandas', 'matplotlib', 'scikit-learn', 'MCP', 'Agentic Skills'] },
    { label: 'Design', items: ['Figma', 'Claude Design'] },
    { label: 'Tooling', items: ['Git', 'Docker'] },
  ],
  languages: ['English', 'Mandarin', 'Shanghainese'],
};
