// These two functions are deliberately self-contained: the offline export embeds them verbatim.
export function mountCard(host, initial) {
  const card = document.createElement('div');
  card.className = 'flash-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', 'Holographic card. Use arrow keys to move the light; Escape resets it.');
  card.innerHTML = `<div class="flash-face"><div class="flash-base"></div><div class="flash-foil"></div><div class="flash-texture"></div><div class="flash-grain"></div><div class="flash-scatter"></div><div class="flash-glare"></div><svg class="flash-edge" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke"/></svg><svg class="flash-logo" viewBox="0 0 40 40" aria-hidden="true"><path class="flash-star" d="M20 0C22 14 26 18 40 20C26 22 22 26 20 40C18 26 14 22 0 20C14 18 18 14 20 0Z"/><g class="flash-rings" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="20" cy="20" rx="18" ry="10" transform="rotate(-35 20 20)"/><ellipse cx="20" cy="20" rx="18" ry="10" transform="rotate(35 20 20)"/></g></svg><div class="flash-perforation"></div><div class="flash-copy"><div class="flash-title"></div><div class="flash-subtitle"></div><div class="flash-meta"><div><span>Cardholder</span><strong data-copy="cardholder"></strong></div><div><span>No.</span><strong data-copy="number"></strong></div><div><span>Valid thru</span><strong data-copy="valid"></strong></div></div></div></div>`;
  host.append(card);
  const face = card.querySelector('.flash-face');
  const title = card.querySelector('.flash-title');
  const subtitle = card.querySelector('.flash-subtitle');
  const texture = card.querySelector('.flash-texture');
  const edge = card.querySelector('.flash-edge');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let settings, current = { x: 0, y: 0 }, target = { x: 0, y: 0 }, frame = 0, previousTime = 0, activePointer = null;
  const uri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const cache = new Map();
  function pattern(name, embossed) {
    const key = `${name}-${embossed}`;
    if (cache.has(key)) return cache.get(key);
    let shapes = '';
    if (name === 'rosette') {
      for (const [cx, cy] of [[16, 16], [48, 16], [16, 48], [48, 48]]) {
        for (let r = 1.5; r < 22; r += 2) {
          shapes += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
        }
      }
    } else if (name === 'waves') {
      for (let y = -32; y < 96; y += 4) shapes += `<path d="M-32 ${y}Q0 ${y - 22} 32 ${y}T96 ${y}"/>`;
    } else if (name === 'lines') {
      for (let x = -64; x < 128; x += 5) shapes += `<path d="M${x} 0l64 64"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><filter id="emboss" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx=".45" dy=".6" stdDeviation="0" flood-color="#233a35" flood-opacity=".45"/></filter></defs><g fill="none" stroke="white" stroke-width=".65" opacity=".85"${embossed ? ' filter="url(#emboss)"' : ''}>${shapes}</g></svg>`;
    const result = uri(svg); cache.set(key, result); return result;
  }
  card.querySelector('.flash-grain').style.backgroundImage = uri('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="3" stitchTiles="stitch" seed="7"/></filter><rect width="100%" height="100%" opacity=".55" filter="url(#n)"/></svg>');
  function fitText() {
    for (const el of [title, subtitle, ...card.querySelectorAll('.flash-meta strong')]) {
      el.style.fontSize = '';
      if (el.scrollWidth > el.clientWidth && el.clientWidth) {
        el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * el.clientWidth / el.scrollWidth}px`;
      }
    }
  }
  function update(next) {
    settings = { ...next };
    const ratios = { original: 292 / 423, portrait: 3 / 4, square: 1, landscape: 85.6 / 54 };
    const ratio = ratios[settings.ratio];
    card.style.setProperty('--card-width', `${settings.width}px`);
    card.style.setProperty('--ratio', ratio);
    card.style.setProperty('--radius', `${settings.radius}px`);
    card.style.setProperty('--primary', settings.primary);
    card.style.setProperty('--secondary', settings.secondary);
    card.style.setProperty('--accent', settings.accent);
    card.style.setProperty('--angle', `${settings.angle}deg`);
    card.style.setProperty('--ink', settings.textColor);
    card.style.setProperty('--foil', settings.foil / 100);
    card.style.setProperty('--glare', settings.glare / 100);
    card.style.setProperty('--grain', settings.grain / 100);
    card.style.setProperty('--texture-opacity', settings.opacity / 100);
    card.style.setProperty('--texture-size', `${settings.scale / 38 * 62}px`);
    card.classList.toggle('flash-ticket', settings.ticket);
    card.classList.toggle('flash-wide', ratio >= 1);
    const h = 292 / ratio, radius = Math.min(settings.radius / settings.width * 292, h / 2);
    const tearY = ratio >= 1 ? h * .53 : h * .66;
    // One contour owns both clipping and the rim, including the ticket punches.
    const rightPunch = settings.ticket ? `V${tearY - 12}a12 12 0 0 0 0 24` : '';
    const leftPunch = settings.ticket ? `V${tearY + 12}a12 12 0 0 0 0 -24` : '';
    const outline = `M${radius} 0H${292 - radius}A${radius} ${radius} 0 0 1 292 ${radius}${rightPunch}V${h - radius}A${radius} ${radius} 0 0 1 ${292 - radius} ${h}H${radius}A${radius} ${radius} 0 0 1 0 ${h - radius}${leftPunch}V${radius}A${radius} ${radius} 0 0 1 ${radius} 0Z`;
    const mask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 292 ${h}"><path d="${outline}" fill="white"/></svg>`;
    face.style.setProperty('--card-mask', uri(mask));
    edge.setAttribute('viewBox', `0 0 292 ${h}`);
    edge.firstElementChild.setAttribute('d', outline);
    texture.style.backgroundImage = settings.texture === 'custom' && settings.image ? `url("${settings.image}")` : settings.texture === 'none' ? 'none' : pattern(settings.texture, settings.emboss);
    texture.style.mixBlendMode = settings.blend;
    title.textContent = settings.title;
    subtitle.textContent = settings.subtitle;
    for (const key of ['cardholder', 'number', 'valid']) card.querySelector(`[data-copy="${key}"]`).textContent = settings[key];
    card.querySelector('.flash-logo').style.display = settings.logo === 'none' ? 'none' : '';
    card.querySelector('.flash-star').style.display = settings.logo === 'star' ? '' : 'none';
    card.querySelector('.flash-rings').style.display = settings.logo === 'rings' ? '' : 'none';
    card.setAttribute('aria-label', `${settings.title}. ${settings.subtitle}. ${settings.cardholder}. Card ${settings.number}. Valid thru ${settings.valid}. Use arrow keys to move the light; Escape resets it.`);
    fitText(); draw();
  }
  function draw() {
    card.style.setProperty('--rx', `${media.matches ? 0 : -current.y * settings.tilt}deg`);
    card.style.setProperty('--ry', `${media.matches ? 0 : current.x * settings.tilt}deg`);
    card.style.setProperty('--px', `${50 + current.x * 42}%`);
    card.style.setProperty('--py', `${50 + current.y * 42}%`);
    card.style.setProperty('--shift-x', `${current.x * 23}%`);
    card.style.setProperty('--shift-y', `${current.y * 23}%`);
    card.style.setProperty('--hue', `${current.x * 12 - current.y * 8}deg`);
    edge.style.stroke = `rgba(255,255,255,${.46 + (current.x - current.y) * .12})`;
  }
  function tick(time) {
    const response = target.x === 0 && target.y === 0 ? 120 : 85;
    const amount = media.matches ? 1 : 1 - Math.exp(-Math.min(time - (previousTime || time - 16), 40) / response);
    previousTime = time;
    current.x += (target.x - current.x) * amount;
    current.y += (target.y - current.y) * amount;
    draw();
    if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > .001) frame = requestAnimationFrame(tick);
    else { frame = 0; previousTime = 0; }
  }
  function move(x, y) {
    target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function pointer(e) {
    const rect = host.getBoundingClientRect();
    // Measure the untransformed card so its own tilt cannot move the pointer's origin.
    const x = e.clientX - rect.left - card.offsetLeft - card.offsetWidth / 2;
    const y = e.clientY - rect.top - card.offsetTop - card.offsetHeight / 2;
    const inside = Math.abs(x) <= card.offsetWidth / 2 + 6 && Math.abs(y) <= card.offsetHeight / 2 + 6;
    if (activePointer !== null || inside) move(x / (card.offsetWidth / 2) * 1.25, y / (card.offsetHeight / 2) * 1.25);
    else release();
  }
  function trackPointer(e) { if (e.pointerType === 'mouse' || activePointer === e.pointerId) pointer(e); }
  function leaveHost() { if (activePointer === null) release(); }
  // The host never tilts, so a moving edge cannot repeatedly exit/re-enter hover.
  host.addEventListener('pointermove', trackPointer);
  host.addEventListener('pointerleave', leaveHost);
  card.addEventListener('pointerdown', e => { activePointer = e.pointerId; card.setPointerCapture(e.pointerId); pointer(e); });
  function release() { activePointer = null; move(0, 0); }
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  card.addEventListener('lostpointercapture', release);
  card.addEventListener('blur', release);
  card.addEventListener('keydown', e => {
    const directions = { ArrowLeft: [-.28, 0], ArrowRight: [.28, 0], ArrowUp: [0, -.28], ArrowDown: [0, .28] };
    if (e.key === 'Escape') { e.preventDefault(); release(); }
    if (directions[e.key]) { e.preventDefault(); const [x, y] = directions[e.key]; move(target.x + x, target.y + y); }
  });
  const observer = new ResizeObserver(fitText); observer.observe(card);
  document.fonts?.ready.then(fitText);
  media.addEventListener('change', draw);
  update(initial);
  return { update, element: card, destroy() { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', draw); host.removeEventListener('pointermove', trackPointer); host.removeEventListener('pointerleave', leaveHost); card.remove(); } };
}

export function mountAurora(canvas, enabled = true) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let gl, program, timeUniform, sizeUniform, frame = 0, active = enabled, lost = false;
  const scene = canvas.parentElement;
  try {
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL unavailable');
    function shader(type, source) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
      return s;
    }
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    const fragment = shader(gl.FRAGMENT_SHADER, `precision mediump float;
      uniform vec2 size; uniform float time;
      void main(){
        vec2 uv=gl_FragCoord.xy/size;
        float t=time*.16;
        float wave=.012*sin(uv.x*12.+t)+.009*sin(uv.x*23.-t*.7);
        float height=exp(-pow((uv.y-wave)/.10,2.));
        float pink=exp(-pow((uv.x-.28-.035*sin(t))/.19,2.));
        float cyan=exp(-pow((uv.x-.69-.045*cos(t*.8))/.2,2.));
        float blue=exp(-pow((uv.x-.52)/.46,2.));
        vec3 color=vec3(.86,.08,.68)*pink+vec3(.02,.81,.88)*cyan+vec3(.1,.13,.55)*blue*.65;
        float rays=.995+.005*sin(uv.x*140.+sin(uv.x*43.+t)*2.);
        float halo=exp(-pow(uv.y/.20,2.));
        color=color*height*rays+vec3(.055,.075,.27)*halo+vec3(.22,.21,.2)*exp(-pow((uv.x-.49)/.12,2.))*exp(-pow(uv.y/.035,2.));
        gl_FragColor=vec4(color,clamp(height*.94+halo*.4,0.,1.));
      }`);
    program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader unavailable');
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    timeUniform = gl.getUniformLocation(program, 'time'); sizeUniform = gl.getUniformLocation(program, 'size');
  } catch { gl = null; }
  function draw(time = 0) {
    frame = 0;
    if (!gl || lost || !active || document.hidden) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(sizeUniform, w, h); gl.uniform1f(timeUniform, media.matches ? 0 : time / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    scene.classList.add('flash-webgl');
    if (!media.matches) frame = requestAnimationFrame(draw);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; scene.classList.toggle('flash-aurora-off', !active); draw(); }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; cancelAnimationFrame(frame); scene.classList.remove('flash-webgl'); });
  const observer = new ResizeObserver(() => { if (media.matches) refresh(); }); observer.observe(canvas);
  media.addEventListener('change', refresh); document.addEventListener('visibilitychange', refresh);
  refresh();
  return { update(value) { active = value; refresh(); }, destroy() { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh); gl?.getExtension('WEBGL_lose_context')?.loseContext(); } };
}
