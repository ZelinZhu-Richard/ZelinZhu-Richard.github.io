// magic.js — interactive particle-text engine (three.js r141).
// Adapted from the standalone hero/ extraction: assets are now local
// (helvetiker typeface from the three package, particle sprite from /public),
// startup is explicit via createMagic() instead of DOMContentLoaded, and the
// accent hues are tuned to the site's cyan/purple palette.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import typefaceData from 'three/examples/fonts/helvetiker_bold.typeface.json';

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const HUE_BASE = 0.5;    // cyan
const HUE_ACCENT = 0.75; // purple

class Environment {
  constructor(font, particle, container, text) {
    this.font = font;
    this.particle = particle;
    this.container = container;
    this.scene = new THREE.Scene();
    this.createCamera();
    this.createRenderer();
    this.createParticles = new CreateParticles(this.scene, this.font, this.particle, this.camera, this.renderer, this.container, text);
    this.onResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  render() {
    this.createParticles.render();
    this.renderer.render(this.scene, this.camera);
  }

  createCamera() {
    this.camera = new THREE.PerspectiveCamera(65, this.container.clientWidth / this.container.clientHeight, 1, 10000);
    this.camera.position.set(0, 0, 100);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setClearAlpha(0);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.setAnimationLoop(() => this.render());
  }

  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.createParticles.dispose();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

class CreateParticles {
  constructor(scene, font, particleImg, camera, renderer, container, text) {
    this.scene = scene;
    this.font = font;
    this.particleImg = particleImg;
    this.camera = camera;
    this.renderer = renderer;
    this.container = container;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-200, 200);
    this.colorChange = new THREE.Color();
    this.buttom = false;

    this.data = {
      text,
      amount: 400,
      particleSize: 1,
      textSize: 10,
      area: 250,
      ease: 0.05,
    };

    this.setup();
    this.bindEvents();
  }

  setup() {
    const geometry = new THREE.PlaneGeometry(
      this.visibleWidthAtZDepth(100, this.camera),
      this.visibleHeightAtZDepth(100, this.camera)
    );
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
    this.planeArea = new THREE.Mesh(geometry, material);
    this.planeArea.visible = false;
    this.createText();
    this.observeMutation();
  }

  bindEvents() {
    this.handlers = {
      mousedown: this.onMouseDown.bind(this),
      mousemove: this.onMouseMove.bind(this),
      mouseup: this.onMouseUp.bind(this),
      touchstart: this.onTouchStart.bind(this),
      touchmove: this.onTouchMove.bind(this),
      touchend: this.onTouchEnd.bind(this),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) {
      document.addEventListener(ev, fn);
    }
    this.debouncedResize = debounce(this.onWindowResize.bind(this), 200);
    window.addEventListener('resize', this.debouncedResize);
  }

  dispose() {
    for (const [ev, fn] of Object.entries(this.handlers)) {
      document.removeEventListener(ev, fn);
    }
    window.removeEventListener('resize', this.debouncedResize);
    this.observer?.disconnect();
    this.scene.remove(this.particles);
  }

  observeMutation() {
    const callback = (mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          if (mutation.oldValue === null) {
            this.clearText();
          } else {
            this.calculateMobile();
            this.calculateTextSize();
            this.clearText();
            this.createText();
          }
        }
      }
    };
    this.observer = new MutationObserver(callback);
    this.observer.observe(this.container, { attributes: true, attributeOldValue: true });
  }

  onWindowResize() {
    this.calculateMobile();
    this.calculateTextSize();
    this.clearText();
    this.createText();
  }

  onMouseDown(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.buttom = true;
    this.data.ease = 0.01;
  }

  onMouseUp() {
    this.buttom = false;
    this.data.ease = 0.05;
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onTouchStart(event) {
    this.mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = (event.touches[0].clientY / window.innerHeight) * 2 + 1;
    this.buttom = true;
    this.data.ease = 0.01;
  }

  onTouchEnd() {
    this.buttom = false;
    this.data.ease = 0.05;
  }

  onTouchMove(event) {
    this.mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = (event.touches[0].clientY / window.innerHeight) * 2 + 1;
  }

  render() {
    if (!this.particles) return;
    const time = ((0.001 * performance.now()) % 12) / 12;
    const zigzagTime = (1 + Math.sin(time * 2 * Math.PI)) / 6;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.planeArea);
    if (intersects.length === 0) return;

    const pos = this.particles.geometry.attributes.position;
    const copy = this.geometryCopy.attributes.position;
    const coulors = this.particles.geometry.attributes.customColor;
    const size = this.particles.geometry.attributes.size;

    const mx = intersects[0].point.x;
    const my = intersects[0].point.y;

    for (let i = 0, l = pos.count; i < l; i++) {
      const initX = copy.getX(i);
      const initY = copy.getY(i);
      const initZ = copy.getZ(i);

      let px = pos.getX(i);
      let py = pos.getY(i);
      let pz = pos.getZ(i);

      this.colorChange.setHSL(HUE_BASE, 1, 1);
      coulors.setXYZ(i, this.colorChange.r, this.colorChange.g, this.colorChange.b);
      coulors.needsUpdate = true;

      size.array[i] = this.data.particleSize;
      size.needsUpdate = true;

      let dx = mx - px;
      let dy = my - py;

      const mouseDistance = this.distance(mx, my, px, py);
      const d = (dx = mx - px) * dx + (dy = my - py) * dy;
      const f = -this.data.area / d;

      if (this.buttom) {
        const t = Math.atan2(dy, dx);
        px -= f * Math.cos(t);
        py -= f * Math.sin(t);

        this.colorChange.setHSL(HUE_BASE + zigzagTime, 1.0, 0.5);
        coulors.setXYZ(i, this.colorChange.r, this.colorChange.g, this.colorChange.b);
        coulors.needsUpdate = true;

        if (px > initX + 70 || px < initX - 70 || py > initY + 70 || py < initY - 70) {
          this.colorChange.setHSL(HUE_ACCENT, 1.0, 0.6);
          coulors.setXYZ(i, this.colorChange.r, this.colorChange.g, this.colorChange.b);
          coulors.needsUpdate = true;
        }
      } else if (mouseDistance < this.data.area) {
        if (i % 5 === 0) {
          const t = Math.atan2(dy, dx);
          px -= 0.03 * Math.cos(t);
          py -= 0.03 * Math.sin(t);

          this.colorChange.setHSL(HUE_ACCENT, 1.0, 0.6);
          coulors.setXYZ(i, this.colorChange.r, this.colorChange.g, this.colorChange.b);
          coulors.needsUpdate = true;

          size.array[i] = this.data.particleSize / 1.2;
          size.needsUpdate = true;
        } else {
          const t = Math.atan2(dy, dx);
          px += f * Math.cos(t);
          py += f * Math.sin(t);

          pos.setXYZ(i, px, py, pz);
          pos.needsUpdate = true;

          size.array[i] = this.data.particleSize * 1.3;
          size.needsUpdate = true;
        }

        if (px > initX + 10 || px < initX - 10 || py > initY + 10 || py < initY - 10) {
          this.colorChange.setHSL(HUE_ACCENT, 1.0, 0.6);
          coulors.setXYZ(i, this.colorChange.r, this.colorChange.g, this.colorChange.b);
          coulors.needsUpdate = true;

          size.array[i] = this.data.particleSize / 1.8;
          size.needsUpdate = true;
        }
      }

      px += (initX - px) * this.data.ease;
      py += (initY - py) * this.data.ease;
      pz += (initZ - pz) * this.data.ease;

      pos.setXYZ(i, px, py, pz);
      pos.needsUpdate = true;
    }
  }

  calculateMobile() {
    const screenWidth = window.innerWidth;
    if (screenWidth > 1100) {
      this.data.amount = 400;
      this.data.particleSize = 2;
      this.data.textSize = 10;
      this.data.area = 250;
      this.data.ease = 0.05;
    } else if (screenWidth > 650) {
      this.data.amount = 300;
      this.data.particleSize = 1.25;
      this.data.textSize = 6;
      this.data.area = 100;
      this.data.ease = 0.04;
    } else {
      this.data.amount = 200;
      this.data.particleSize = 1;
      this.data.textSize = 4.5;
      this.data.area = 25;
      this.data.ease = 0.03;
    }
  }

  calculateTextSize() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const scaleFactor = 0.00390625;
    this.data.textSize = this.data.textSize + Math.min(screenWidth, screenHeight) * scaleFactor;
  }

  clearText() {
    if (this.particles) this.scene.remove(this.particles);
    if (this.geometryCopy) this.geometryCopy.clearGroups();
  }

  createText() {
    const thePoints = [];
    this.calculateMobile();
    this.calculateTextSize();
    const shapes = this.font.generateShapes(this.data.text, this.data.textSize);
    const geometry = new THREE.ShapeGeometry(shapes);
    geometry.computeBoundingBox();

    const xMid = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
    const yMid = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2.85;

    geometry.center();

    const holeShapes = [];
    for (let q = 0; q < shapes.length; q++) {
      const shape = shapes[q];
      if (shape.holes && shape.holes.length > 0) {
        for (let j = 0; j < shape.holes.length; j++) {
          holeShapes.push(shape.holes[j]);
        }
      }
    }
    shapes.push.apply(shapes, holeShapes);

    const colors = [];
    const sizes = [];
    for (let x = 0; x < shapes.length; x++) {
      const shape = shapes[x];
      const amountPoints = shape.type === 'Path' ? this.data.amount / 2 : this.data.amount;
      const points = shape.getSpacedPoints(amountPoints);
      points.forEach((element) => {
        thePoints.push(new THREE.Vector3(element.x, element.y, 0));
        colors.push(this.colorChange.r, this.colorChange.g, this.colorChange.b);
        sizes.push(1);
      });
    }

    const geoParticles = new THREE.BufferGeometry().setFromPoints(thePoints);
    geoParticles.translate(xMid, yMid, 0);
    geoParticles.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
    geoParticles.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        pointTexture: { value: this.particleImg },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        void main() {
          vColor = customColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(color * vColor, 1.0);
          gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
    });

    this.particles = new THREE.Points(geoParticles, material);
    this.scene.add(this.particles);

    this.geometryCopy = new THREE.BufferGeometry();
    this.geometryCopy.copy(this.particles.geometry);
  }

  visibleHeightAtZDepth(depth, camera) {
    const cameraOffset = camera.position.z;
    if (depth < cameraOffset) depth -= cameraOffset;
    else depth += cameraOffset;
    const vFOV = (camera.fov * Math.PI) / 180;
    return 2 * Math.tan(vFOV / 2) * Math.abs(depth);
  }

  visibleWidthAtZDepth(depth, camera) {
    return this.visibleHeightAtZDepth(depth, camera) * camera.aspect;
  }

  distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  }
}

// Instantiates the particle scene inside `container`. Returns a dispose handle.
export function createMagic(container, text) {
  const font = new FontLoader().parse(typefaceData);
  const particle = new THREE.TextureLoader().load('/particle.png');
  const env = new Environment(font, particle, container, text);
  return { dispose: () => env.dispose() };
}
