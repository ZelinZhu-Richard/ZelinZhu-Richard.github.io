import { PARTS, stoneHash } from '../workspace/stones/parts.mjs';
// Copy for the retired captured homepage, whose runtime in public/_nuxt/ imported it as /story.js.
// Nothing that ships uses it now: the live homepage's words are in workspace/home/content.mjs.
// No build step or test imports it any more; it stays as the record of that page's copy, so
// nothing here should claim something that is no longer true.
const p = (body, classes = 'lg:text-sans-50 xs:text-sans-30 text-center') => `<p class="${classes}">${body}</p>`;
const italic = text => `<i class="lg:text-serif-50 xs:text-serif-30">${text}</i>`;
// Seven stones, one for each part of the site (workspace/stones/parts.mjs).
const cards = PARTS.map(part => [part.title, part.subtitle, stoneHash(part)]);
export const story = {
  cards: cards.map(([title, subtitle, href], index) => ({
    href,
    html: `<span class="flex xs:items-center lg:items-start gap-0 flex-col xs:relative lg:absolute h-full lg:-top-12 ${index % 2 ? 'lg:right-80' : 'lg:left-80'}"><span class="xs:text-sans-26 lg:text-sans-50 relative z-2">${title}</span><br><span class="text-sans-18 -mt-10 relative z-2">${subtitle}</span></span>`,
  })),
  scenes: [
    p(`A student of<br>${italic('what comes next.')}`),
    p(`High school senior.<br>Computer science.<br>Economics.<br>${italic('Curiosity.')}`),
    p(`Good questions<br>become ${italic('experiments.')}`),
    p('building.', 'xs:text-serif-80 lg:text-serif-200 text-center gradient-text'),
    p('Learn', 'xs:text-serif-100 lg:text-serif-200 text-center gradient-text'),
    p('Build', 'xs:text-serif-100 lg:text-serif-200 text-center gradient-text'),
    p('Repeat', 'xs:text-serif-100 lg:text-serif-200 text-center gradient-text'),
    p(`Making my family,<br>my community,<br>and the ${italic('world')}<br>a little better.`),
    p('Machine learning. Quant experiments.<br>Things built in public.', 'xs:text-sans-18 lg:text-sans-26 text-center'),
    p(`From an idea<br>to something ${italic('real.')}`),
    p(`Wake up.<br>Ship. Learn. ${italic('Repeat.')}`),
    p(`What am I<br>${italic('working on?')}`),
    p('<span class="xs:text-sans-26 lg:text-sans-38">Learning from images</span><br><br>At UNC PRIMES, I work on<br>deep learning for neuroscience<br>image processing.', 'xs:text-sans-18 lg:text-sans-26 text-left'),
    p('<span class="xs:text-sans-26 lg:text-sans-38">Building ZeroMind</span><br><br>One agent on every frontier model,<br>one memory of your whole life,<br>better at it every week.', 'xs:text-sans-18 lg:text-sans-26 text-right'),
    p('<span class="xs:text-sans-26 lg:text-sans-38">Building in the open</span><br><br>From Apex Analysis to EqualVoice,<br>I turn questions into code,<br>then learn from the results.', 'xs:text-sans-18 lg:text-sans-26 text-left'),
    p('<span class="xs:text-sans-26 lg:text-sans-38">Bringing people together</span><br><br>I lead teams and host events.<br>Off the keyboard: skiing,<br>snow, and the northern lights.', 'xs:text-sans-18 lg:text-sans-26 text-right'),
    p(`Explore the work.<br>${italic('Follow the curiosity.')}`),
  ],
};
