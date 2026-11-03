import { usedSkills } from './content.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const skillsPage = `<div class="skills-page">
<header class="page-intro skills-intro">
<h1>My <em>skills.</em></h1>
<p class="lede">The AI agent skills I use, and the ones I create.</p>
<nav class="actions" aria-label="On this page"><a href="#skills-i-use">Skills I use</a><a href="#skills-i-create">Skills I create</a></nav>
</header>
<section class="skill-section" id="skills-i-use" aria-labelledby="used-heading">
<h2 id="used-heading">Skills I <em>use.</em></h2>
<ul class="skill-list">${usedSkills.map(skill => `<li id="${escape(skill.slug)}">
<div class="skill-heading"><h3><a href="#${escape(skill.slug)}" aria-label="Link to ${escape(skill.name)}">${escape(skill.name)}</a></h3><span class="skill-author">${escape(skill.author)}</span></div>
<p>${escape(skill.description)}</p>
<div class="actions"><a href="${escape(skill.repository)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(skill.name)} on GitHub (opens in a new tab)">GitHub repository <span aria-hidden="true">↗</span></a></div>
</li>`).join('')}</ul>
</section>
<section class="skill-section" id="skills-i-create" aria-labelledby="created-heading">
<h2 id="created-heading">Skills I <em>create.</em></h2>
<p class="skill-empty">My own skills will appear here, with individual pages about how I design and test them.</p>
</section>
</div>`;
