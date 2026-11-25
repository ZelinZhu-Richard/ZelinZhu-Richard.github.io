// Turns content.mjs text into structure the templates render without v-html.
// Format: `\n` line break, `*words*` italic, `\n\n` between blocks; when there are
// several blocks the first is a heading.

/**
 * @typedef {{ text: string, em: boolean }} Segment
 * @typedef {Segment[]} Line
 * @typedef {{ heading: Line[] | null, paragraphs: Line[][] }} Blocks
 */

/**
 * @param {string} line one line without `\n`
 * @returns {Line}
 */
export function inline(line) {
  return line.split('*').map((text, index) => ({ text, em: index % 2 === 1 })).filter(segment => segment.text);
}

/**
 * @param {string} text
 * @returns {Line[]}
 */
export function lines(text) {
  return text.split('\n').map(inline);
}

/**
 * @param {string} text
 * @returns {Blocks}
 */
export function blocks(text) {
  const parts = text.split('\n\n').map(lines);
  return parts.length > 1 ? { heading: parts[0], paragraphs: parts.slice(1) } : { heading: null, paragraphs: parts };
}

/**
 * True for a chapter that is one big word ("Learn", "Build", "Repeat").
 * @param {string} text
 */
export function isWord(text) {
  return !/\s/.test(text.trim());
}
