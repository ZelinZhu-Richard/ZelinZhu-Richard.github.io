export const videoPage = `<article class="film-page">
<header class="film-intro">
<div>
<p class="eyebrow">Agentic AI filmmaking · 2026</p>
<h1>Neon <em>rain.</em></h1>
</div>
<p class="film-deck">A little world,<br> ten seconds long.</p>
</header>
<figure class="film-player">
<video controls playsinline preload="none" poster="/video/assets/neon-rain-poster.jpg" width="1920" height="1080" aria-label="Neon Rain, a short film by Richard Zhu" aria-describedby="film-caption">
<source src="/video/assets/neon-rain.mp4" type="video/mp4">
Your browser does not support embedded video. <a href="/video/assets/neon-rain.mp4">Download Neon Rain</a> to watch it.
</video>
<figcaption id="film-caption">
<span>A lone figure beneath an umbrella. Neon lights reflected in a rain-soaked city.</span>
<span>Silent film · 00:10</span>
</figcaption>
</figure>
<dl class="film-specs" aria-label="Film details">
<div><dt>Made with</dt><dd>GPT Image</dd></div>
<div><dt>Duration</dt><dd>10 seconds</dd></div>
<div><dt>Sequence</dt><dd>240 frames / 24 fps</dd></div>
<div><dt>Resolution</dt><dd>1920 × 1080</dd></div>
</dl>
<section class="film-story" aria-labelledby="making-heading">
<div>
<p class="eyebrow">Behind the experiment</p>
<h2 id="making-heading">Made with<br><em>GPT Image.</em></h2>
</div>
<div class="film-copy">
<p class="project-lede">Exploring agentic AI filmmaking: orchestrating generative image models, computer graphics, and temporal validation to create cinematic video without relying on a conventional text-to-video generation pipeline.</p>
<p><em>NEON RAIN</em> is a 10-second cinematic sci-fi noir film created through an experimental, AI-orchestrated filmmaking pipeline. I used GPT Image for character and environment artwork, with GPT-6 Astra Pro and Codex as AI production partners to coordinate image generation, animation, rendering, and visual validation.</p>
<p>The workflow combined AI-generated artwork, 3D-guided motion, layered character rendering, depth-aware compositing, procedural rainfall, neon reflections, and frame-by-frame continuity validation. The aim was to turn individually designed visual assets into a coherent film.</p>
<div class="actions">
<a href="/video/assets/neon-rain.mp4" download="neon-rain.mp4">Download the film <span class="film-download-size">MP4 · 16.8 MB</span><span aria-hidden="true">↓</span></a>
</div>
</div>
</section>
<section class="film-story film-continuity" aria-labelledby="continuity-heading">
<div>
<p class="eyebrow">The engineering challenge</p>
<h2 id="continuity-heading">One world.<br><em>240 frames.</em></h2>
</div>
<div class="film-copy">
<p class="project-lede">The central challenge was maintaining a persistent visual world while the character moved.</p>
<p>The protagonist’s silver-white hair and intricate clothing, the camera perspective, the lighting, and the wet pavement all needed to stay consistent across hundreds of frames.</p>
<p>The pipeline produced a 240-frame sequence at 1920 × 1080 and 24 fps, with encoding verification, automated motion checks, and reproducible production checkpoints.</p>
<p>The current result is an experimental prototype. Facial-detail preservation and natural-motion quality remain challenges for the next iteration.</p>
<p class="film-question">Can AI agents move beyond generating individual images and become coordinated production systems capable of creating entire cinematic experiences?</p>
</div>
</section>
<dl class="film-credits">
<div><dt>My role</dt><dd>Concept development, creative direction, character and environment specifications, agentic workflow design, iterative evaluation, and production oversight.</dd></div>
<div><dt>Technologies</dt><dd>GPT Image, GPT-6 Astra Pro, Codex, generative image models, Python, ModernGL, FFmpeg, procedural animation, depth-aware compositing, and automated quality assurance.</dd></div>
</dl>
<aside class="related"><p>More things I’ve made</p><a href="/work/">Selected work <span aria-hidden="true">↗</span></a><a href="/contacts/">Let’s talk <span aria-hidden="true">↗</span></a></aside>
</article>`;
