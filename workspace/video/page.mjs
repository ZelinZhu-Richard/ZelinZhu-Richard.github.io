export const videoPage = `<article class="film-page">
<header class="film-intro">
<div>
<p class="eyebrow">Film experiment · 2026</p>
<h1>Neon Rain</h1>
</div>
<p class="film-deck">A ten-second noir clip. I made it from generated stills and 3D motion instead of a text-to-video model.</p>
</header>
<figure class="film-player">
<video controls playsinline preload="none" poster="/video/assets/neon-rain-poster.jpg" width="1920" height="1080" aria-label="Neon Rain, a short film by Richard Zhu" aria-describedby="film-caption">
<source src="/video/assets/neon-rain.mp4" type="video/mp4">
Your browser does not support embedded video. <a href="/video/assets/neon-rain.mp4">Download Neon Rain</a> to watch it.
</video>
<figcaption id="film-caption">
<span>A figure with an umbrella walks down a wet street lit by neon signs.</span>
<span>No sound · 0:10</span>
</figcaption>
</figure>
<dl class="film-specs" aria-label="Film details">
<div><dt>Images</dt><dd>GPT Image</dd></div>
<div><dt>Length</dt><dd>10 s</dd></div>
<div><dt>Frames</dt><dd>240 at 24 fps</dd></div>
<div><dt>Size</dt><dd>1920 × 1080</dd></div>
</dl>
<section class="film-story" aria-labelledby="making-heading">
<div>
<p class="eyebrow">How it was made</p>
<h2 id="making-heading">Stills first, then motion</h2>
</div>
<div class="film-copy">
<p class="project-lede">Text-to-video models were not consistent enough for one character across a whole shot, so I built the shot from parts.</p>
<p>GPT Image drew the character and the city. I used GPT-6 Astra Pro and Codex as assistants to coordinate the image generation, animation, rendering and checks.</p>
<p>The motion comes from 3D guides. The character is rendered in layers and composited by depth. Rain and the neon reflections on the pavement are procedural. A script checked continuity frame by frame.</p>
<div class="actions">
<a href="/video/assets/neon-rain.mp4" download="neon-rain.mp4">Download MP4 <span class="film-download-size">16.8 MB</span></a>
</div>
</div>
</section>
<section class="film-story film-continuity" aria-labelledby="continuity-heading">
<div>
<p class="eyebrow">The hard part</p>
<h2 id="continuity-heading">Keeping 240 frames consistent</h2>
</div>
<div class="film-copy">
<p class="project-lede">The character’s silver-white hair and detailed clothes, the camera angle, the light and the wet ground all had to match from frame to frame.</p>
<p>The pipeline outputs 240 frames at 1920 × 1080 and 24 fps. It checks the encoding and the motion automatically and saves checkpoints so a run can be repeated.</p>
<p>It is a prototype. Faces lose detail and the walk does not look fully natural yet. Those are the next things to fix.</p>
<p class="film-question">The question I care about: can a set of AI agents work as a production crew for a whole film, not just make single images?</p>
</div>
</section>
<dl class="film-credits">
<div><dt>What I did</dt><dd>Concept, art direction, the character and set specs, the agent workflow, reviewing each pass, and running production.</dd></div>
<div><dt>Tools</dt><dd>GPT Image, GPT-6 Astra Pro, Codex, Python, ModernGL, FFmpeg, procedural animation, depth-aware compositing, automated checks.</dd></div>
</dl>
<aside class="related"><p>More projects</p><a href="/work/">Work</a><a href="/contacts/">Contact</a></aside>
</article>`;
