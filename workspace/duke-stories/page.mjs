const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatBeat=value=>esc(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
export function parseScript(md){
 return md.split(/^\*\*\d+\. /m).slice(1).map(part=>({
  name:part.split('\n')[0].replace(/\*\*$/,''),
  beats:part.split('\n').filter(l=>l.startsWith('> ')).map(l=>l.slice(2))
 }));
}
export const stories={
 future:{slug:'becoming-blue',title:'Becoming Blue',label:'An imagined Duke future',credit:'Becoming Blue · An imagined Duke future by Richard Zhu',cover:'future-dawn',
  ids:['edge','reason','table','workshop','little-blue','open-seat','becoming','dawn']},
 night:{slug:'the-night-duke-lost-its-blue',title:'The Night Duke Lost Its Blue',label:'A fictional campus adventure',credit:'The Night Duke Lost Its Blue · A fictional campus adventure by Richard Zhu',cover:'rescue-poster',
  ids:['midnight','assignment','noodles','chase','chapel','rescue','blue-returns','breakfast']}
};
const arrow='<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 12h26M18 3l10 9-10 9"/></svg>';
const contract='<!-- THESIS: Two illustrated journeys let a dragon grow without losing himself. OWN-WORLD: Black pauses, white Merriweather, inked Duke blues and purple galaxy wings, warm communal dawn. STORY: Choose an imagined future or a fictional adventure; scroll naturally, replay, and cross to the other story. FIRST VIEWPORT: Large serif title beside original character art; the story label and Begin action sit below. FORM: User-approved Wings extension, code-led cinematic narrative. SIGNATURE: A reversible workshop assembly and a rising Chapel rescue with a held composition. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->';
function frame(title,body,kind='selector'){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<!-- DUKE_METADATA --><meta name="theme-color" content="#050608"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/duke/assets/merriweather-roman.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/duke/style.css">${kind!=='selector'?'<script type="module" src="/duke/app.js"></script>':''}
</head><body class="duke-page ${kind}" data-ambient-background="off">${contract}
<a class="skip-link" href="#main">Skip to story</a>
<header class="story-nav"><a href="/duke/" aria-label="A Dragon at Duke — story selector">A dragon at Duke</a><a href="/work/">Richard Zhu</a></header>
${kind!=='selector'?'<button class="motion-toggle" type="button" hidden aria-pressed="false"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 3v12M12 3v12"/></svg><span>Motion off</span></button>':''}
${body}</body></html>`;
}
function assetsFactory(assets){
 return (key,alt='',cls='',eager=false,mobile=true)=>{
  const asset=assets[key];if(!asset)throw Error('Missing Duke asset '+key);
  const img=`<img class="${cls}" src="/duke/assets/${key}.webp" width="${asset.width}" height="${asset.height}" alt="${esc(alt)}" loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''}>`;
  return mobile&&asset.mobile?`<picture><source media="(max-width:700px)" srcset="/duke/assets/${asset.mobile.key}.webp" width="${asset.mobile.width}" height="${asset.mobile.height}">${img}</picture>`:img;
 };
}
export function selectorPage(assets){
 const image=assetsFactory(assets);
 return frame('A Dragon at Duke',`<main id="main" class="selector-main">
 <div class="selector-heading"><h1>A dragon<br>at Duke.</h1><p>Two illustrated stories by Richard Zhu.</p></div>
 <a class="story-choice future-choice" href="/duke/becoming-blue/"><div class="choice-art">${image('future-dawn','Richard, now a blue dragon, with the Blue Devil and fictional collaborators overlooking campus at dawn.','',true)}</div><div class="choice-copy"><h2>Becoming Blue</h2><p>An imagined Duke future</p><span class="text-action">Read the story ${arrow}</span></div></a>
 <a class="story-choice night-choice" href="/duke/the-night-duke-lost-its-blue/"><div class="choice-art">${image('rescue-poster','Richard flies above the Chapel while the Blue Devil catches the lantern cord.','',true)}</div><div class="choice-copy"><h2>The Night Duke<br>Lost Its Blue</h2><p>A fictional campus adventure</p><span class="text-action">Read the story ${arrow}</span></div></a>
 </main><footer class="selector-footer"><a href="/work/">Selected work</a><a href="/about/">About Richard</a><a href="https://aisafety.dance/conclusion/">Inspired by Nicky Case's AI Safety Dance.</a></footer>`);
}
export function storyPage(kind,script,assets){
 const story=stories[kind],sections=parseScript(script),image=assetsFactory(assets);
 if(sections.length!==8||sections.reduce((n,s)=>n+s.beats.length,0)!==(kind==='future'?21:24))throw Error('Locked Duke script count changed');
 const morph=(state=0,cls='')=>`<div class="morph ${cls}" data-transform data-static-stage="${state}" role="img" aria-label="Richard remains the same dragon: purple eyes, galaxy wings, and a crystal pendant, as black scales turn Duke blue and crescent horns become ivory devil horns.">${[0,1,2,3,4].map(n=>image('richard-'+n,'','variant variant-'+n,false,false)).join('')}<span class="pendant-light" aria-hidden="true"></span></div>`;
 const spark=(cls='')=>`<span class="spark ${cls}" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 1Q22 18 39 20Q22 22 20 39Q18 22 1 20Q18 18 20 1Z"/></svg></span>`;
 const lantern=(cls='')=>`<div class="lantern ${cls}">${image('lantern','','',false,false)}<span class="lantern-light" aria-hidden="true"></span></div>`;
 const quad=(cls='',eager=false)=>`<div class="world quad-world ${cls}">${image('quad','Duke’s stone arches, winding quad paths, and the broad Chapel tower.','environment',eager)}
 ${image('mascot','The Blue Devil approaches Richard with an open hand.','standing-mascot',eager,false)}
 ${image('richard-0','Richard, a small black dragon with purple galaxy wings and his crystal pendant.','standing-dragon',eager,false)}</div>`;
 const waves=(workshop=false)=>`<div class="wave-display ${workshop?'assembly-display':''}" aria-label="An illustrative prototype shows three different voice waveforms.">${[0,1,2].map((n)=>`<div class="voice voice-${n}" ${workshop?`data-part="${n}"`:''}><svg viewBox="0 0 200 32" role="img" aria-label="Voice ${n+1} waveform"><path d="M0 16h12l5-5 4 10 5-17 6 25 5-22 6 15 4-8 6 2h12l5-11 6 20 5-12 4 3h14l4-6 6 15 6-21 5 24 6-16 5 4h12l5-10 5 21 6-27 5 29 5-17 6 4h17"/></svg></div>`).join('')}${workshop?'<span class="assembly-component" data-part="3"><span></span><span></span><span></span></span>':''}</div>`;
 const art={
 edge:quad('',true),
 reason:`<div class="illustration prototype-art">${image('prototype','Richard unfolds a battered prototype with three microphones while the Blue Devil listens.','',true,false)}${waves()}</div>`,
 table:`<div class="illustration">${image('table','At a Brodhead table, Richard and three fictional students compare ideas while the Blue Devil makes room.','panel-art')}</div>`,
 workshop:`<div class="illustration workshop-art">${image('workshop','Richard flies to connect suspended components. The Blue Devil organizes parts while two students contribute revisions.','',false,false)}${waves(true)}<span class="revision-mark" aria-hidden="true"><svg viewBox="0 0 100 30"><path d="M5 20Q30 0 50 15T95 10M86 3l9 7-9 7"/></svg></span></div>`,
 'little-blue':`<div class="world walk-world">${image('quad','A quiet walk beneath the Chapel’s shadow.','environment')}${image('mascot','The Blue Devil walks beside Richard.','standing-mascot',false,false)}${morph(2,'walking-dragon')}</div>`,
 'open-seat':`<div class="illustration">${image('open-seat','Richard, now partly blue, pulls a chair closer for a new student with a teal backpack.','panel-art')}</div>`,
 becoming:`<div class="transformation-world">${morph(4,'becoming-dragon')}<span class="orbit" aria-hidden="true"></span></div>`,
 dawn:`<div class="illustration dawn-art">${image('future-dawn','Richard waves beside the Blue Devil and their fictional collaborators as dawn lights Duke Chapel.','panel-art')}</div>`,
 midnight:`<div class="world midnight-world">${image('quad','The familiar campus fades to gray as blue sparks lift into the night.','environment',true)}${image('mascot','The Blue Devil looks around as his own blue color fades.','midnight-mascot',true,false)}${spark('escape-spark one')}${spark('escape-spark two')}${spark('escape-spark three')}</div>`,
 assignment:quad('assignment-world',true)+lantern('offered-lantern'),
 noodles:`<div class="illustration noodles-art">${image('noodles','Richard and the Blue Devil peer into a bowl of noodles at Brodhead. An empty lantern waits beside it.','',false,false)}${spark('noodle-spark')}</div>`,
 chase:`<div class="world chase-world">${image('quad','A winding path crosses the quad beneath Duke’s Gothic arches.','environment')}${image('mascot-run','The Blue Devil runs after a wayward blue spark.','running-mascot',false,false)}${image('dragon-flight','Richard flies over the path, taking the shortcut.','flying-dragon',false,false)}${spark('chase-spark')}${lantern('chase-lantern')}</div>`,
 chapel:`<div class="world chapel-world">${image('chapel','The camera’s path leads up the exterior of Duke Chapel to its four corner pinnacles.','chapel-tower')}${image('mascot','The Blue Devil looks up from the Chapel steps.','chapel-mascot',false,false)}${image('dragon-flight','Richard spreads his galaxy wings and rises toward the final spark.','chapel-dragon',false,false)}${spark('chapel-spark')}</div>`,
 rescue:`<div class="world rescue-world">${image('chapel','','rescue-tower')}${image('ledge','','rescue-ledge',false,false)}<div class="wind" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><svg class="cord" viewBox="0 0 100 66.667" preserveAspectRatio="none" aria-hidden="true"><path d="M35.5 30.6Q46 32 50 31"/></svg>${image('mascot-catch','The Blue Devil braces on a ledge and catches the slipping lantern cord with both hands.','catching-mascot',false,false)}${image('dragon-flight','Richard reaches through the wind to catch the last blue light.','rescue-dragon',false,false)}${lantern('rescue-lantern')}${spark('rescue-spark')}<span class="catch-flash" aria-hidden="true"></span></div>`,
 'blue-returns':`<div class="world return-world">${image('quad','A wave of blue returns across the stone buildings and the quad.','environment')}<span class="blue-wave" aria-hidden="true"></span>${morph(4,'returned-dragon')}${image('mascot','The Blue Devil’s color returns beside Richard.','standing-mascot',false,false)}</div>`,
 breakfast:`<div class="illustration">${image('breakfast','At sunrise, the blue dragon checks the noodles with a fork while the Blue Devil smiles over a mug. One tiny spark peeks out of the bowl.','panel-art')}</div>`,
 };
 const scene=(id,i)=>{
  const starts=id==='rescue'?[0,.68,.88]:sections[i].beats.map((_,n)=>n/sections[i].beats.length);
  return `<section class="story-scene scene-${id}" id="${id}" data-scene="${id}" style="--scene-height:${id==='workshop'||id==='rescue'?500:300}" aria-labelledby="heading-${id}">
  <h2 class="sr-only" id="heading-${id}">${esc(sections[i].name)}</h2>
  <div class="scene-stage"><div class="scene-art">${art[id]}</div><div class="scene-copy">${sections[i].beats.map((line,n)=>`<p class="beat${n===0?' is-active':''}" data-start="${starts[n]}"><span>${formatBeat(line)}</span></p>`).join('')}
  ${id==='reason'?'<aside class="project-link"><a href="/work/#equalvoice">EqualVoice — a real starting point</a></aside>':''}</div>
  <a class="next-scene" href="#${story.ids[i+1]||'credits'}" aria-label="${i===7?'Continue to credits':'Continue to '+esc(sections[i+1].name.split(' — ')[0])}">${arrow}</a></div></section>`;
 };
 const other=stories[kind==='future'?'night':'future'];
 const body=`<main id="main" data-story="${kind}">
 <section class="title-page" id="start" aria-labelledby="story-title"><div class="title-art">${kind==='future'?quad('title-quad',true):image('rescue-poster','Richard and the Blue Devil work together above Duke Chapel.','title-illustration',true,false)}</div><div class="title-copy"><h1 id="story-title">${kind==='future'?'Becoming<br><em>Blue.</em>':'The Night Duke <br>Lost Its <em>Blue.</em>'}</h1><p class="story-label">${story.label}</p><a href="#${story.ids[0]}" class="text-action">Begin the story ${arrow}</a></div><span class="title-byline">An illustrated story by Richard Zhu</span></section>
 ${story.ids.map(scene).join('')}
 <footer class="story-credits" id="credits"><p class="credit-title">${esc(story.credit)}</p><a class="inspiration" href="https://aisafety.dance/conclusion/">Inspired by Nicky Case's AI Safety Dance.</a>
 <div class="end-actions"><a href="#start" class="replay text-action">Replay ${arrow}</a><a href="/duke/${other.slug}/" class="other-story"><span>Read the other story</span><strong>${other.title}</strong>${arrow}</a></div>
 <nav aria-label="Portfolio"><a href="/duke/">Both stories</a><a href="/work/">Selected work</a><a href="/about/">About Richard</a></nav></footer></main>`;
 return frame(story.title,body,kind);
}
