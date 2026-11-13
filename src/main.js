// Fluid, flat-edged goo drawn as a signed distance field in one WebGL
// fragment shader. Shapes are fused with a polynomial smooth-min (the same
// trick @cruxgarden/plasma-ui uses for its mask pass, MIT) and then cut with a
// one-pixel antialiased threshold, so edges stay crisp in every engine instead
// of depending on a CSS blur + contrast filter.

const MAX_BLOBS = 48;
const GOO = 44; // how far apart two shapes start reaching for each other, in px
const PRESS_START = 16; // a pressed blob starts as a small drop...
const PRESS_MAX = 110; // ...and swells to this while held
const PRESS_GROWTH = 55; // px of radius per second

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define RESIDENTS 2
#define RIM_WIDTH 3.
uniform vec2 uRes;
uniform float uDpr, uGoo, uRadius;
uniform vec4 uBox;                 // card: center.xy, half-size.zw
uniform vec4 uBlobs[${MAX_BLOBS}]; // blob: center.xy, radii.zw
uniform int uCount;
uniform vec3 uBlob, uCard, uRim;

float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

// Coverage of the pixel by the region d < 0, one device pixel wide. Blended
// fields are flatter than true distances, so the edge is scaled by the field's
// own slope where the extension allows; that keeps necks as crisp as straights.
float cover(float d, float grow){
#ifdef GL_OES_standard_derivatives
  float g = max(length(vec2(dFdx(d), dFdy(d))), 1e-4);
#else
  float g = 1. / uDpr;
#endif
  return clamp(.5 + grow - d / g, 0., 1.);
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float box = sdBox(p - uBox.xy, uBox.zw, uRadius);
  float blobs = 1e4;
  float pressed = 1e4; // only the blobs made by pressing; the residents come first
  for(int i = 0; i < ${MAX_BLOBS}; i++){
    if(i >= uCount) break;
    vec4 b = uBlobs[i];
    float d = (length((p - b.xy) / b.zw) - 1.) * min(b.z, b.w);
    // Pressed drops join each other more tightly, so a dragged trail of them
    // stays a line instead of swelling into one mass.
    float k = i >= RESIDENTS ? uGoo * .35 : uGoo;
    blobs = smin(blobs, d, k);
    if(i >= RESIDENTS) pressed = smin(pressed, d, k);
  }
  float shape = smin(box, blobs, uGoo);  // whole silhouette: card fused with blobs
  // The card with the blobs melted out of it. The wider blend dissolves thin
  // leftover slivers of card, as the old blur did.
  float card = smax(box, -blobs, uGoo * 1.8);
  float a = cover(shape, 0.);
  // Nudged out a pixel so no blob color fringes the card's own outer edge.
  vec3 col = mix(uBlob, uCard, cover(card, 1.));
  // Pressed blobs carry a thin magenta outline (the old red border, as the
  // blur used to tint it), fading out where they fuse into something else.
  float rim = cover(-(shape + RIM_WIDTH), 0.) * smoothstep(uGoo * .4, 0., pressed - shape);
  col = mix(col, uRim, rim);
  gl_FragColor = vec4(col * a, a);
}`;

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (x) => 1 - Math.pow(1 - x, 1.7);
// Out and back over one period, easing out each way (a CSS `50%` keyframe).
const wave = (t, period) => {
  const ph = (t / period) % 1;
  return ph < 0.5 ? easeOut(ph * 2) : 1 - easeOut((ph - 0.5) * 2);
};

// The two resident blobs, positioned against the card's edges.
const residents = (box, t) => {
  const narrow = window.innerWidth <= 700;
  const a = wave(t, 4);
  const b = wave(t, 3);
  const A = narrow
    ? { left: lerp(100, -16, a), top: -40 }
    : { left: lerp(100, -30, a), top: lerp(-40, -20, a) };
  const B = narrow
    ? { right: lerp(0, -16, b), bottom: lerp(-16, 32, b) }
    : { right: lerp(-40, -8, b), bottom: lerp(-16, 20, b) };
  return [
    [box.left + A.left + 100, box.top + A.top + 100, 100, 100],
    [box.right - B.right - 80, box.bottom - B.bottom - 90, 80, 90],
  ];
};

const compile = (gl, type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
};

const start = () => {
  const canvas = document.querySelector('.goo');
  const card = document.querySelector('.card');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return;
  gl.getExtension('OES_standard_derivatives');

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(prog, name);
  const U = {
    res: u('uRes'),
    dpr: u('uDpr'),
    radius: u('uRadius'),
    box: u('uBox'),
    blobs: u('uBlobs'),
    count: u('uCount'),
  };
  gl.uniform3f(u('uBlob'), 0, 0, 1);
  gl.uniform3f(u('uCard'), 0, 0, 0);
  gl.uniform3f(u('uRim'), 1, 0, 1);
  gl.uniform1f(u('uGoo'), GOO);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pressed = []; // { x, y, r, born }
  const held = new Map(); // pointerId -> the blob that pointer is feeding
  let last = 0;
  const data = new Float32Array(MAX_BLOBS * 4);
  let dpr = 1;
  let queued = false;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const draw = (now) => {
    queued = false;
    resize();
    const t = reduced.matches ? 0 : now / 1000;
    const view = canvas.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const blobs = residents(box, t);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const b of held.values()) b.r = Math.min(b.r + PRESS_GROWTH * dt, PRESS_MAX);
    let settling = held.size > 0;
    for (const b of pressed) {
      // pop in with a little overshoot, like a drop landing
      const age = reduced.matches ? 9 : (now - b.born) / 1000;
      if (age < 1.2) settling = true;
      const s = Math.max(1 - Math.exp(-7 * age) * Math.cos(11 * age), 0.02);
      blobs.push([b.x, b.y, b.r * s, b.r * s]);
    }
    blobs.forEach((b, i) => data.set([b[0] - view.left, b[1] - view.top, b[2], b[3]], i * 4));

    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.dpr, dpr);
    gl.uniform1f(U.radius, parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0);
    gl.uniform4f(
      U.box,
      box.left - view.left + box.width / 2,
      box.top - view.top + box.height / 2,
      box.width / 2,
      box.height / 2
    );
    gl.uniform4fv(U.blobs, data);
    gl.uniform1i(U.count, blobs.length);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reduced.matches || settling) request();
  };
  const request = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  };

  const drop = (e) => {
    const b = { x: e.clientX, y: e.clientY, r: PRESS_START, born: performance.now() };
    pressed.push(b);
    if (pressed.length > MAX_BLOBS - 2) pressed.shift();
    held.set(e.pointerId, b);
    last = performance.now();
    request();
  };
  const release = (e) => {
    held.delete(e.pointerId);
    if (!held.size) document.documentElement.classList.remove('drawing');
  };
  // Press to place a drop, hold to swell it, drag to leave a trail of drops.
  window.addEventListener('pointerdown', (e) => {
    document.documentElement.classList.add('drawing');
    drop(e);
  });
  window.addEventListener('pointermove', (e) => {
    const b = held.get(e.pointerId);
    if (b && Math.hypot(e.clientX - b.x, e.clientY - b.y) > Math.max(b.r * 0.8, 12)) drop(e);
  });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // Let a finger draw instead of scrolling, unless the card's text really
  // needs to scroll, in which case vertical drags over it still do.
  const touch = () => {
    card.style.touchAction = card.scrollHeight > card.clientHeight + 1 ? 'pan-y' : 'none';
    request();
  };
  window.addEventListener('resize', touch);
  touch();
  reduced.addEventListener('change', request);

  // The canvas now paints the card; drop its CSS fallback background.
  document.documentElement.classList.add('goo-on');
  request();
};

try {
  start();
} catch (err) {
  console.warn('goo: falling back to the plain card', err);
}
