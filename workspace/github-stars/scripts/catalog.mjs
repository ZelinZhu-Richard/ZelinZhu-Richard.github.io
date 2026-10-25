export const USERNAME = 'ZelinZhu-Richard';
export const categories = [
  { id: 'agents', label: 'AI agents & coding', description: 'Coding assistants, agent runtimes, skills, and model gateways.' },
  { id: 'models', label: 'AI models & ML', description: 'Train, run, and understand machine learning models.' },
  { id: 'quant', label: 'Finance & trading', description: 'Quantitative research, market data, backtesting, and investing.' },
  { id: 'data', label: 'Data & automation', description: 'Collect, transform, analyze, and automate data workflows.' },
  { id: 'web', label: 'Web & interfaces', description: 'Build websites, design interfaces, and explore interaction.' },
  { id: 'creative', label: 'Creative & media', description: 'Make images, video, music, animation, and visual art.' },
  { id: 'research', label: 'Research & writing', description: 'Explore science, read papers, and work with documents.' },
  { id: 'devtools', label: 'Developer tools', description: 'Languages, editors, testing tools, and programming utilities.' },
  { id: 'security', label: 'Security & privacy', description: 'Audit software, investigate systems, and protect privacy.' },
  { id: 'learning', label: 'Learning & career', description: 'Courses, study guides, interview preparation, and career resources.' },
  { id: 'productivity', label: 'Productivity & apps', description: 'Everyday apps, personal organization, and useful workflows.' },
  { id: 'systems', label: 'Systems & infrastructure', description: 'Operating systems, networking, deployment, and cloud infrastructure.' },
];
export const types = [
  { id: 'application', label: 'Application' },
  { id: 'library', label: 'Library / framework' },
  { id: 'cli', label: 'CLI / developer tool' },
  { id: 'skill', label: 'Agent skill / plugin' },
  { id: 'resource', label: 'Learning / resource' },
  { id: 'model', label: 'Model / dataset' },
  { id: 'research', label: 'Research / experiment' },
];

// A conservative fallback for new stars. Reviewed per-repository choices in
// classifications.json always take precedence and survive every refresh.
export function classify(repo) {
  const name = repo.full_name.toLowerCase();
  const topics = repo.topics.join(' ').toLowerCase();
  const text = `${name} ${topics} ${repo.description ?? ''}`.toLowerCase();
  const matches = (pattern) => pattern.test(text);
  let category = 'devtools';
  if (matches(/trading|quantitative|quant[- ]|quantaxis|backtest|stock-market|financial|finance|investing|investment|股票|量化|金融|期货/)) category = 'quant';
  else if (matches(/security|vulnerabilit|pentest|reverse.engineer|malware|privacy|hacking|prompt-injection|cyber|安全|隐私/)) category = 'security';
  else if (matches(/crawler|scrap|spider|data.engineer|data.pipeline|爬虫|采集/)) category = 'data';
  else if (matches(/image.generation|video.generation|text-to-image|text-to-video|text-to-speech|speech-to-text|voice.clon|animation|photoshop|illustration|filmmaking|music|audio|视频|绘画|艺术/)) category = 'creative';
  else if (matches(/paper|academic|scientific|science.skills|literature|latex|typesetting|pdf|zotero|research.writing|论文|科研|文献/)) category = 'research';
  else if (matches(/design|frontend|front-end|css|html|webgl|react|svelte|vue|nextjs|website|interface|ui-ux|tailwind|前端/)) category = 'web';
  else if (matches(/coding.agent|coding.assistant|harness|claude.code|codex|opencode|mcp|agent.skill|model.gateway/)) category = 'agents';
  else if (matches(/llm|machine.learning|deep.learning|neural|pytorch|tensorflow|transformer|diffusion|inference|模型|机器学习|深度学习/)) category = 'models';
  else if (matches(/agent|claude|codex|cursor|opencode|mcp|skills|copilot|prompt|智能体/)) category = 'agents';
  else if (matches(/data|scrap|crawler|spider|automation|workflow|爬虫|采集|数据/)) category = 'data';
  else if (matches(/course|tutorial|learning|interview|career|hiring|curriculum|book|awesome|guide|课程|学习|面试|求职/)) category = 'learning';
  else if (matches(/docker|kubernetes|linux|operating.system|network|cloud|server|deploy|infrastructure|数据库|操作系统/)) category = 'systems';
  else if (matches(/productivity|note.taking|bookmark|calendar|todo|personal|desktop.app|organize|笔记|效率/)) category = 'productivity';

  let type = 'library';
  if (matches(/awesome|curated.list|collection.of.*(?:resources|links)|tutorial|course|cheatsheet|reading.list|interview.questions|学习指南|教程|书籍|课程|resources/)) type = 'resource';
  else if (matches(/agent.skill|codex.skill|claude.skill|claude.code.skill|skills.for|skill.for|dsh.plugin|agent.plugin|mcp.server|提示词/)) type = 'skill';
  else if (matches(/official.*(?:paper|implementation)|paper.*implementation|experiments|research.code|论文代码/)) type = 'research';
  else if (matches(/model.weights|pretrained|pre-trained|foundation.model|dataset|模型权重|数据集/)) type = 'model';
  else if (matches(/\bcli\b|command.line|compiler|terminal|developer.tool|命令行/)) type = 'cli';
  else if (matches(/\bapp\b|application|studio|editor|dashboard|workspace|browser.extension|self-hosted|web.app|desktop|应用|工作台/)) type = 'application';
  return { category, type };
}
