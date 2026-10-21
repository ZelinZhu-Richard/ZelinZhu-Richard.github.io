// A small Markdown subset renderer with playbook directives. No dependencies.
// Syntax contract: see ../STYLE.md. Unknown or malformed syntax throws, so mistakes fail the build.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ESC[c]);

export const REPO_TREE = 'https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io/tree/main/workspace/repolarisdm';
export const BASE = '/repolarisdm/';
const STATUS = { confirmed: 'Confirmed', reported: 'Reported', inference: 'Inference' };

export function slugify(text) {
  return String(text).toLowerCase()
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\^\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => l || t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'section';
}

export function hash(text) {
  let h = 5381;
  for (const ch of String(text)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export function parseFrontMatter(src, file = 'input') {
  const text = src.replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${file}: unclosed front matter`);
  const data = {};
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) throw new Error(`${file}: bad front matter line "${line}"`);
    let value = m[2].trim();
    if (/^".*"$/.test(value)) value = value.slice(1, -1);
    data[m[1]] = value;
  }
  return { data, body: text.slice(end + 5) };
}

export function parseAttrs(text) {
  const attrs = {};
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|(\S+))/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
}

// ---------- inline ----------

function emphasis(escaped) {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, '$1<em>$2</em>');
}

function checkUrl(url, ctx) {
  if (/^https:\/\//.test(url)) return { external: true };
  if (/^http:\/\//.test(url)) { ctx.error(`use https, not http: ${url}`); return { external: true }; }
  if (url.startsWith('#') || url.startsWith(BASE) || url === '/' || /^mailto:/.test(url)) return { external: false };
  ctx.error(`link must be https://, ${BASE}..., or #anchor (got "${url}")`);
  return { external: false };
}

function anchor(href, labelHtml, ctx, cls = '') {
  const { external } = checkUrl(href, ctx);
  if (!external && href.startsWith(BASE)) ctx.links.push(href);
  if (!external && href.startsWith('#')) ctx.links.push(`${BASE}${ctx.page}/${href}`);
  const extra = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const mark = external ? '<span class="ext" aria-hidden="true">↗</span>' : '';
  return `<a${cls ? ` class="${cls}"` : ''} href="${escapeHtml(href)}"${extra}>${labelHtml}${mark}</a>`;
}

function badge(status, url, date, ctx) {
  const label = STATUS[status];
  const title = date ? ` title="${escapeHtml(`${label}. Source checked ${date}.`)}"` : '';
  ctx.badges.push({ status, url, date });
  if (status !== 'inference' && (!url || url === '-')) ctx.error(`^[${status}] needs a source URL`);
  if (!url || url === '-') return `<span class="badge badge-${status}"${title}>${label}</span>`;
  checkUrl(url, ctx);
  return `<a class="badge badge-${status}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${title}>${label}</a>`;
}

function xref(target, label, ctx) {
  let m;
  if ((m = target.match(/^S(\d{1,2})$/))) {
    const n = Number(m[1]);
    if (n > 15) ctx.error(`no step S${n}`);
    return anchor(`${BASE}agent-patch-audit/#s${n}`, escapeHtml(label || `S${n}`), ctx, 'step-ref');
  }
  if ((m = target.match(/^M(\d{1,2})$/))) {
    const n = Number(m[1]);
    if (n < 1 || n > 10) ctx.error(`no mistake row M${n}`);
    return anchor(`${BASE}agent-patch-audit/#mistake-card`, escapeHtml(label || `M${n}`), ctx, 'step-ref');
  }
  if ((m = target.match(/^lab:(lab-[a-z])$/))) {
    const name = `Lab ${m[1].slice(4).toUpperCase()}`;
    return anchor(`${REPO_TREE}/labs/${m[1]}`, escapeHtml(label || name), ctx);
  }
  if ((m = target.match(/^([a-z0-9-]+)(?:#([\w-]+))?$/))) {
    const [, slug, id] = m;
    const page = ctx.pages?.get(slug);
    if (ctx.pages && !page) ctx.error(`unknown page [[${target}]]`);
    const href = slug === 'home' ? BASE : `${BASE}${slug}/${id ? `#${id}` : ''}`;
    return anchor(href, escapeHtml(label || page?.title || slug), ctx);
  }
  ctx.error(`bad cross-reference [[${target}]]`);
  return escapeHtml(label || target);
}

export function renderInline(text, ctx) {
  const slots = [];
  const hold = html => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/\^\[(confirmed|reported|inference)\]\(([^)\s]*)(?:\s+"([^"]*)")?\)/g, (_, st, url, date) => hold(badge(st, url, date, ctx)));
  s = s.replace(/\^\[([a-z]+)\]\(/g, (all, st) => { ctx.error(`unknown badge status "${st}"`); return all; });
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => hold(xref(target.trim(), label?.trim(), ctx)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => hold(anchor(url, emphasis(escapeHtml(label)), ctx)));
  s = s.replace(/<(https:\/\/[^>\s]+)>/g, (_, url) => hold(anchor(url, escapeHtml(url), ctx)));
  s = emphasis(escapeHtml(s));
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
  return s;
}

// ---------- blocks ----------

const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const isBlank = line => !line.trim();
const indentOf = line => line.match(/^ */)[0].length;
const isTableSep = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

function startsBlock(lines, i) {
  const line = lines[i];
  return /^:::[a-z]/.test(line) || /^```/.test(line) || /^#{2,4}\s/.test(line) || LIST_RE.test(line)
    || /^>\s?/.test(line) || /^(-{3,}|\*{3,})\s*$/.test(line)
    || (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1]));
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '', inCode = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function heading(level, raw, ctx) {
  const m = raw.match(/^(.*?)\s*(?:\{#([\w-]+)\})?\s*$/);
  const text = m[1];
  let id = m[2] || slugify(text);
  if (ctx.ids.has(id)) {
    if (m[2]) ctx.error(`duplicate heading id "${id}"`);
    let n = 2;
    while (ctx.ids.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  ctx.ids.add(id);
  const html = renderInline(text, ctx);
  if (level === 2) ctx.toc.push({ id, text: html.replace(/<a [^>]*>|<\/a>|<span class="ext"[^>]*>↗<\/span>/g, '') });
  ctx.headings.push({ level, id, text });
  return `<h${level} id="${id}">${html}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
}

function parseList(lines, i, ctx) {
  const first = lines[i].match(LIST_RE);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j >= lines.length) break;
      const next = lines[j].match(LIST_RE);
      if (indentOf(lines[j]) > base || (next && next[1].length === base && /\d/.test(next[2]) === ordered)) {
        if (items.length) items.at(-1).lines.push('');
        i = j;
        continue;
      }
      break;
    }
    const m = line.match(LIST_RE);
    if (m && m[1].length === base) {
      if (/\d/.test(m[2]) !== ordered) break;
      items.push({ text: m[3], lines: [], contentIndent: base + m[2].length + 1 });
      i++;
      continue;
    }
    if (indentOf(line) > base && items.length) {
      const item = items.at(-1);
      item.lines.push(line.slice(Math.min(indentOf(line), item.contentIndent)));
      i++;
      continue;
    }
    break;
  }
  const html = items.map(item => {
    let text = item.text;
    let task = '';
    const t = text.match(/^\[( |x|X)\]\s+(.*)$/);
    if (t) {
      text = t[2];
      const id = `task:${ctx.page}:${hash(text)}`;
      if (ctx.trackIds.has(id)) ctx.error(`duplicate checklist item "${text}"`);
      ctx.trackIds.add(id);
      task = `<input type="checkbox" data-track="${id}" aria-label="Done">`;
    }
    const rest = item.lines;
    const blockStart = rest.findIndex((l, k) => !isBlank(l) && startsBlock(rest, k));
    const para = (blockStart < 0 ? rest : rest.slice(0, blockStart)).filter(l => !isBlank(l));
    const inline = renderInline([text, ...para.map(l => l.trim())].join(' '), ctx);
    const blocks = blockStart < 0 ? '' : renderBlocks(rest.slice(blockStart), ctx);
    const body = task ? `<label class="task">${task}<span>${inline}</span></label>` : inline;
    return `<li${task ? ' class="task-item"' : ''}>${body}${blocks}</li>`;
  }).join('');
  return { html: ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`, next: i };
}

function listItems(body, ctx, name) {
  const items = [];
  for (const line of body) {
    if (isBlank(line)) continue;
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) items.push(m[1]);
    else if (items.length && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
    else ctx.error(`:::${name} may contain only "- " list items (got "${line.trim()}")`);
  }
  return items;
}

const DIRECTIVES = {
  selfcheck: (attrs, body, ctx) => checks('self', attrs, body, ctx),
  check: (attrs, body, ctx) => checks('closing', attrs, body, ctx),
  drill(attrs, body, ctx) {
    if (!attrs.id || !/^[a-z0-9-]+$/.test(attrs.id)) ctx.error(':::drill needs id="lowercase-id"');
    if (!attrs.title) ctx.error(`:::drill ${attrs.id} needs title="..."`);
    if (!attrs.time) ctx.error(`:::drill ${attrs.id} needs time="..."`);
    if (!body.some(l => /\*\*Done when:\*\*/.test(l))) ctx.error(`:::drill ${attrs.id} needs a "**Done when:**" line`);
    const id = `drill:${ctx.page}:${attrs.id}`;
    if (ctx.trackIds.has(id)) ctx.error(`duplicate drill id ${attrs.id}`);
    ctx.trackIds.add(id);
    const anchorId = `drill-${attrs.id}`;
    ctx.ids.add(anchorId);
    ctx.drills.push({ id, anchor: anchorId, title: attrs.title, time: attrs.time, page: ctx.page });
    return `<section class="drill" id="${anchorId}"><div class="drill-head"><label><input type="checkbox" data-track="${id}"><span class="drill-kicker">Drill</span><span class="drill-title">${renderInline(attrs.title, ctx)}</span></label><span class="drill-time">${escapeHtml(attrs.time)}</span></div><div class="drill-body">${renderBlocks(body, ctx)}</div></section>`;
  },
  compare(attrs, body, ctx) {
    const rows = listItems(body, ctx, 'compare').map(item => {
      const parts = item.split('||');
      if (parts.length !== 2) ctx.error(`:::compare items need "vibe coder || senior" (got "${item}")`);
      return `<tr><td>${renderInline(parts[0].trim(), ctx)}</td><td>${renderInline((parts[1] || '').trim(), ctx)}</td></tr>`;
    }).join('');
    const left = escapeHtml(attrs.left || 'Vibe coder'), right = escapeHtml(attrs.right || 'Senior engineer');
    return `<div class="table-wrap compare" role="region" aria-label="${left} versus ${right}" tabindex="0"><table><thead><tr><th scope="col">${left}</th><th scope="col">${right}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },
  note: (attrs, body, ctx) => callout('note', attrs.title || 'Note', body, ctx),
  tip: (attrs, body, ctx) => callout('tip', attrs.title || 'Tip', body, ctx),
  warn: (attrs, body, ctx) => callout('warn', attrs.title || 'Watch out', body, ctx),
  reveal(attrs, body, ctx) {
    if (!attrs.title) ctx.error(':::reveal needs title="..."');
    return `<details class="reveal"><summary>${renderInline(attrs.title || 'Show', ctx)}</summary><div class="reveal-body">${renderBlocks(body, ctx)}</div></details>`;
  },
  card(attrs, body, ctx) {
    if (!attrs.id || !attrs.title) ctx.error(':::card needs id="..." and title="..."');
    const id = `card-${attrs.id}`;
    if (ctx.ids.has(id)) ctx.error(`duplicate card ${attrs.id}`);
    ctx.ids.add(id);
    ctx.toc.push({ id, text: escapeHtml(attrs.title) });
    return `<section class="card" id="${id}"><p class="eyebrow">Card</p><h2>${renderInline(attrs.title, ctx)}</h2>${renderBlocks(body, ctx)}</section>`;
  },
  mock(attrs, body, ctx) {
    const minutes = Number(attrs.minutes);
    if (!attrs.id || !attrs.title || !(minutes > 0)) ctx.error(':::mock needs id, title and minutes');
    const key = `${ctx.page}:${attrs.id}`;
    ctx.ids.add(`mock-${attrs.id}`);
    return `<section class="mock" id="mock-${attrs.id}" data-mock="${key}" data-minutes="${minutes}"><h3>${renderInline(attrs.title, ctx)}</h3><div class="mock-timer" role="group" aria-label="Timer"><output class="mock-clock" aria-live="off">${String(minutes).padStart(2, '0')}:00</output><button type="button" data-act="start">Start</button><button type="button" data-act="pause">Pause</button><button type="button" data-act="reset">Reset</button></div>${renderBlocks(body, ctx)}<label class="mock-log"><span>Log: "the AI said … / I checked …" (saved in this browser)</span><textarea data-log="${key}" rows="6"></textarea></label></section>`;
  },
  tally(attrs, body, ctx) {
    if (!attrs.id) ctx.error(':::tally needs id="..."');
    const items = listItems(body, ctx, 'tally');
    const rows = items.map((item, n) => {
      const id = `tally:${ctx.page}:${attrs.id}:${n + 1}`;
      ctx.trackIds.add(id);
      return `<li><label class="task"><input type="checkbox" data-track="${id}"><span>${renderInline(item, ctx)}</span></label></li>`;
    }).join('');
    return `<section class="tally" data-tally="${escapeHtml(attrs.id)}"><p class="tally-title">${renderInline(attrs.title || 'Score', ctx)} <output class="tally-count">0</output> / ${items.length}</p><ol>${rows}</ol></section>`;
  },
  rubric(attrs, body, ctx) {
    if (!attrs.id) ctx.error(':::rubric needs id="..."');
    const items = listItems(body, ctx, 'rubric');
    const rows = items.map((item, n) => {
      const id = `rubric:${ctx.page}:${attrs.id}:${n + 1}`;
      const options = ['—', '1', '2', '3', '4'].map((v, k) => `<option value="${k === 0 ? '' : v}">${v}</option>`).join('');
      return `<tr><td>${renderInline(item, ctx)}</td><td><select data-score="${id}" aria-label="Score">${options}</select></td></tr>`;
    }).join('');
    return `<div class="table-wrap rubric" data-rubric="${escapeHtml(attrs.id)}" role="region" aria-label="Rubric" tabindex="0"><table><thead><tr><th scope="col">Trait</th><th scope="col">Score 1–4</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Average</td><td><output class="rubric-avg">—</output></td></tr></tfoot></table></div>`;
  },
};

function checks(kind, attrs, body, ctx) {
  const items = listItems(body, ctx, kind === 'self' ? 'selfcheck' : 'check');
  if (items.length < 2) ctx.error(`:::${kind === 'self' ? 'selfcheck' : 'check'} needs at least 2 items`);
  const id = kind === 'self' ? 'self-check' : 'closing-check';
  if (ctx.ids.has(id)) ctx.error(`only one :::${kind === 'self' ? 'selfcheck' : 'check'} per page`);
  ctx.ids.add(id);
  const title = kind === 'self' ? 'Self-check: can you skip this?' : 'Closing check';
  ctx.toc.push({ id, text: escapeHtml(kind === 'self' ? 'Self-check' : 'Closing check') });
  const rows = items.map((item, n) => {
    const [q, a] = item.split('||').map(s => s?.trim());
    const track = `${kind === 'self' ? 'sc' : 'cc'}:${ctx.page}:${n + 1}`;
    ctx.trackIds.add(track);
    if (kind === 'self') ctx.selfchecks.push({ id: track, page: ctx.page, question: q, answer: a || '' });
    const answer = a ? `<details><summary>Show the answer</summary><div>${renderInline(a, ctx)}</div></details>` : '';
    return `<li><label class="task"><input type="checkbox" data-track="${track}"><span>${renderInline(q, ctx)}</span></label>${answer}</li>`;
  }).join('');
  const hint = kind === 'self'
    ? '<p class="hint">Tick only what you can do now, without help. If you tick every item, mark the chapter as tested out and move on.</p>'
    : '<p class="hint">Tick each item when you can do it without notes.</p>';
  const button = kind === 'self' ? `<button type="button" class="testout" data-testout="${ctx.page}">I can do every item: mark this chapter as tested out</button>` : '';
  return `<section class="checks checks-${kind}" aria-labelledby="${id}"><h2 id="${id}">${title}</h2>${hint}<ol>${rows}</ol>${button}</section>`;
}

function callout(kind, title, body, ctx) {
  return `<aside class="callout callout-${kind}"><p class="callout-label">${renderInline(title, ctx)}</p>${renderBlocks(body, ctx)}</aside>`;
}

export function renderBlocks(lines, ctx) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    if ((m = line.match(/^:::([a-z]+)\s*(.*)$/))) {
      const [, name, attrText] = m;
      const body = [];
      let depth = 0;
      i++;
      while (i < lines.length) {
        if (/^:::[a-z]/.test(lines[i])) depth++;
        else if (lines[i].trim() === ':::') { if (depth === 0) break; depth--; }
        body.push(lines[i]);
        i++;
      }
      if (i >= lines.length) { ctx.error(`unclosed :::${name}`); break; }
      i++;
      const fn = DIRECTIVES[name];
      if (!fn) { ctx.error(`unknown directive :::${name}`); continue; }
      out.push(fn(parseAttrs(attrText), body, ctx));
      continue;
    }
    if ((m = line.match(/^```\s*([\w+.-]*)\s*$/))) {
      const code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i >= lines.length) ctx.error('unclosed code fence');
      i++;
      const lang = m[1] ? ` data-lang="${escapeHtml(m[1])}"` : '';
      out.push(`<pre class="code"${lang} tabindex="0"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { out.push(heading(m[1].length, m[2], ctx)); i++; continue; }
    if (/^#\s/.test(line)) { ctx.error('do not use "# " headings; the page title comes from front matter'); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      for (const r of rows) if (r.length !== head.length) ctx.error(`table row has ${r.length} cells, header has ${head.length}: ${r.join(' | ')}`);
      const th = head.map(c => `<th scope="col">${renderInline(c, ctx)}</th>`).join('');
      const tb = rows.map(r => `<tr>${r.map(c => `<td>${renderInline(c, ctx)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const inner = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) inner.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(inner, ctx)}</blockquote>`);
      continue;
    }
    if (LIST_RE.test(line)) {
      const { html, next } = parseList(lines, i, ctx);
      out.push(html);
      i = next;
      continue;
    }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines, i))) para.push(lines[i++].trim());
    out.push(`<p>${renderInline(para.join(' '), ctx)}</p>`);
  }
  return out.join('\n');
}

export function newContext(page, pages) {
  const errors = [];
  return {
    page, pages, errors,
    ids: new Set(), trackIds: new Set(), toc: [], headings: [], drills: [], selfchecks: [], badges: [], links: [],
    error(message) { errors.push(`${page}: ${message}`); },
  };
}

export function renderMarkdown(src, ctx) {
  return renderBlocks(src.replace(/\r\n?/g, '\n').split('\n'), ctx);
}
