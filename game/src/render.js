// render.js — raw WebGL1 renderer for Evening Noodle House.
// No libraries, no textures, no network: every mesh is built from code
// (boxes, cylinders, spheres, cones), lit by one warm directional light
// plus ambient, with vertex colours and a few emissive accents (lanterns,
// string lights, dusk sun). The scene: an evening noodle shop — wooden
// counter, back wall with lanterns, dusk sky with sun and rooftops, a
// low-poly chef who stirs, tosses, plates and serves, and a queue of
// customers whose mood follows their patience.
//
// All animation is a pure function of (world, fx, animTime). In screenshot
// mode main.js freezes animTime, so the same seed always gives the same
// frame. The simulation itself is never touched here.
import { INGREDIENT_BY_ID } from './recipes.js';

// ---------------------------------------------------------------------------
// tiny mat4 / vec3 helpers (column-major, like gl-matrix)
// ---------------------------------------------------------------------------
function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  // returns a * b
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function mat4Translate(m, x, y, z) {
  const t = mat4Identity();
  t[12] = x; t[13] = y; t[14] = z;
  return mat4Multiply(m, t);
}

function mat4Scale(m, x, y, z) {
  const s = mat4Identity();
  s[0] = x; s[5] = y; s[10] = z;
  return mat4Multiply(m, s);
}

function mat4RotateX(m, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  return mat4Multiply(m, r);
}

function mat4RotateY(m, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return mat4Multiply(m, r);
}

function mat4RotateZ(m, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return mat4Multiply(m, r);
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

function vec3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vec3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function vec3Norm(a) {
  const l = Math.sqrt(vec3Dot(a, a)) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function mat4LookAt(eye, center, up) {
  const f = vec3Norm(vec3Sub(center, eye));
  const r = vec3Norm(vec3Cross(f, up));
  const u = vec3Cross(r, f);
  return [
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -vec3Dot(r, eye), -vec3Dot(u, eye), vec3Dot(f, eye), 1,
  ];
}

// Upper 3x3 of a model matrix — fine for normals here because models only
// use rotation and uniform scale.
function mat3FromMat4(m) {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function transformDir(m, v) {
  const out = [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
  return vec3Norm(out);
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------
// geometry builder: one Geom accumulates positions / normals / colours /
// emissive flags / indices; parts are placed with a model matrix.
// ---------------------------------------------------------------------------
class Geom {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.emis = [];
    this.idx = [];
  }

  // Append another Geom's arrays, transformed by matrix m (or identity).
  add(other, m) {
    const base = this.pos.length / 3;
    const mm = m || mat4Identity();
    for (let i = 0; i < other.pos.length; i += 3) {
      const p = transformPoint(mm, [other.pos[i], other.pos[i + 1], other.pos[i + 2]]);
      const n = transformDir(mm, [other.nor[i], other.nor[i + 1], other.nor[i + 2]]);
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(other.col[i], other.col[i + 1], other.col[i + 2]);
      this.emis.push(other.emis[i / 3]);
    }
    for (let i = 0; i < other.idx.length; i += 1) this.idx.push(other.idx[i] + base);
    return this;
  }
}

// Unit box centred on the origin, -0.5..0.5 on every axis.
function boxGeom(color, emis) {
  const g = new Geom();
  const c = hexRgb(color);
  const faces = [
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  for (const face of faces) {
    const base = g.pos.length / 3;
    for (const v of face.v) {
      g.pos.push(v[0], v[1], v[2]);
      g.nor.push(face.n[0], face.n[1], face.n[2]);
      g.col.push(c[0], c[1], c[2]);
      g.emis.push(emis || 0);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}

// Cylinder along Y, centred on the origin, height 1, radius 0.5 top/bottom.
function cylinderGeom(color, emis, rTop, rBottom, seg) {
  const g = new Geom();
  const c = hexRgb(color);
  const rt = rTop === undefined ? 0.5 : rTop;
  const rb = rBottom === undefined ? 0.5 : rBottom;
  const s = seg || 20;
  const sideBase = 0;
  for (let i = 0; i <= s; i += 1) {
    const a = (i / s) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    g.pos.push(x * rb, -0.5, z * rb);
    g.nor.push(x, 0, z);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
    g.pos.push(x * rt, 0.5, z * rt);
    g.nor.push(x, 0, z);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  for (let i = 0; i < s; i += 1) {
    const b = sideBase + i * 2;
    g.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  // Top cap fan.
  const topBase = g.pos.length / 3;
  g.pos.push(0, 0.5, 0);
  g.nor.push(0, 1, 0);
  g.col.push(c[0], c[1], c[2]);
  g.emis.push(emis || 0);
  for (let i = 0; i <= s; i += 1) {
    const a = (i / s) * Math.PI * 2;
    g.pos.push(Math.cos(a) * rt, 0.5, Math.sin(a) * rt);
    g.nor.push(0, 1, 0);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  for (let i = 0; i < s; i += 1) g.idx.push(topBase, topBase + 1 + i, topBase + 2 + i);
  // Bottom cap fan.
  const botBase = g.pos.length / 3;
  g.pos.push(0, -0.5, 0);
  g.nor.push(0, -1, 0);
  g.col.push(c[0], c[1], c[2]);
  g.emis.push(emis || 0);
  for (let i = 0; i <= s; i += 1) {
    const a = (i / s) * Math.PI * 2;
    g.pos.push(Math.cos(a) * rb, -0.5, Math.sin(a) * rb);
    g.nor.push(0, -1, 0);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  for (let i = 0; i < s; i += 1) g.idx.push(botBase, botBase + 2 + i, botBase + 1 + i);
  return g;
}

// Low-poly sphere, radius 0.5, centred on the origin.
function sphereGeom(color, emis, segW, segH) {
  const g = new Geom();
  const c = hexRgb(color);
  const w = segW || 16;
  const h = segH || 11;
  for (let j = 0; j <= h; j += 1) {
    const phi = (j / h) * Math.PI;
    for (let i = 0; i <= w; i += 1) {
      const theta = (i / w) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta) * 0.5;
      const y = Math.cos(phi) * 0.5;
      const z = Math.sin(phi) * Math.sin(theta) * 0.5;
      g.pos.push(x, y, z);
      const n = vec3Norm([x, y, z]);
      g.nor.push(n[0], n[1], n[2]);
      g.col.push(c[0], c[1], c[2]);
      g.emis.push(emis || 0);
    }
  }
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const a = j * (w + 1) + i;
      const b = a + w + 1;
      g.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return g;
}

// Cone along Y, base at -0.5, tip at +0.5.
function coneGeom(color, emis, seg) {
  const g = new Geom();
  const c = hexRgb(color);
  const s = seg || 14;
  const base = 0;
  for (let i = 0; i <= s; i += 1) {
    const a = (i / s) * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const z = Math.sin(a) * 0.5;
    g.pos.push(x, -0.5, z);
    const n = vec3Norm([x, 0.9, z]);
    g.nor.push(n[0], n[1], n[2]);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  const tip = g.pos.length / 3;
  g.pos.push(0, 0.5, 0);
  g.nor.push(0, 1, 0);
  g.col.push(c[0], c[1], c[2]);
  g.emis.push(emis || 0);
  for (let i = 0; i < s; i += 1) g.idx.push(base + i, base + i + 1, tip);
  return g;
}

// Flat disc in the XZ plane (normal +Y), radius 0.5 — blob shadows.
function discGeom(color, emis, seg) {
  const g = new Geom();
  const c = hexRgb(color);
  const s = seg || 20;
  g.pos.push(0, 0, 0);
  g.nor.push(0, 1, 0);
  g.col.push(c[0], c[1], c[2]);
  g.emis.push(emis || 0);
  for (let i = 0; i <= s; i += 1) {
    const a = (i / s) * Math.PI * 2;
    g.pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    g.nor.push(0, 1, 0);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  for (let i = 0; i < s; i += 1) g.idx.push(0, 1 + i, 2 + i);
  return g;
}

// Quad in the XY plane facing +Z, with a colour per corner (bottom-left,
// bottom-right, top-right, top-left) — used for the dusk sky gradient.
function quadGeom(corners, emis) {
  const g = new Geom();
  const vs = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]];
  for (let i = 0; i < 4; i += 1) {
    const c = hexRgb(corners[i]);
    g.pos.push(vs[i][0], vs[i][1], vs[i][2]);
    g.nor.push(0, 0, 1);
    g.col.push(c[0], c[1], c[2]);
    g.emis.push(emis || 0);
  }
  g.idx.push(0, 1, 2, 0, 2, 3);
  return g;
}

// Convenience: place a part into a Geom with translate / rotate / scale.
function place(g, part, x, y, z, rx, ry, rz, sx, sy, sz) {
  let m = mat4Identity();
  m = mat4Translate(m, x, y, z);
  if (rx) m = mat4RotateX(m, rx);
  if (ry) m = mat4RotateY(m, ry);
  if (rz) m = mat4RotateZ(m, rz);
  m = mat4Scale(m, sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
  g.add(part, m);
  return g;
}

// ---------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------
const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aEmis;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat3 uNMat;
uniform vec3 uTint;
uniform float uEmisBoost;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
varying float vEmis;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vNor = uNMat * aNormal;
  vWorld = (uModel * vec4(aPos, 1.0)).xyz;
  vCol = aColor * uTint;
  vEmis = min(1.0, aEmis + uEmisBoost);
}
`;

const FRAG_SRC = `
precision mediump float;
uniform vec3 uLightDir;
uniform vec3 uLightCol;
uniform vec3 uAmb;
uniform vec3 uCamPos;
uniform vec3 uPointPos;
uniform vec3 uPointCol;
uniform float uPointFlicker;
uniform vec3 uRimCol;
uniform float uSpec;
uniform float uAlpha;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
varying float vEmis;
void main() {
  vec3 n = normalize(vNor);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 lightTo = normalize(-uLightDir);
  float diff = max(dot(n, lightTo), 0.0);
  // Warm flickering point light over the wok (flame glow).
  vec3 pDir = uPointPos - vWorld;
  float pDist = length(pDir);
  float pDiff = max(dot(n, pDir / pDist), 0.0);
  float atten = 1.0 / (1.0 + pDist * pDist * 0.9);
  vec3 point = uPointCol * pDiff * atten * uPointFlicker;
  // Cool rim from the dusk sky: brightens silhouette edges for depth.
  float rimF = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
  vec3 rim = uRimCol * rimF * 0.35;
  // Blinn-Phong highlight (wok, bowls, plate).
  vec3 h = normalize(lightTo + v);
  float spec = pow(max(dot(n, h), 0.0), 28.0) * uSpec;
  vec3 lit = vCol * (uAmb + uLightCol * diff + point) + rim * vCol + vec3(spec);
  vec3 c = mix(lit, vCol * 1.3, vEmis);
  gl_FragColor = vec4(c, uAlpha);
}
`;

const POINT_VERT_SRC = `
attribute vec3 aPos;
attribute float aSize;
attribute float aAlpha;
uniform mat4 uMVP;
varying float vA;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = aSize;
  vA = aAlpha;
}
`;

const POINT_FRAG_SRC = `
precision mediump float;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  gl_FragColor = vec4(0.92, 0.94, 1.0, vA * (1.0 - r * 2.0));
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function makeProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function uploadMesh(gl, geom) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = 10;
  const verts = new Float32Array(geom.pos.length / 3 * stride);
  for (let i = 0; i < geom.pos.length / 3; i += 1) {
    verts[i * stride] = geom.pos[i * 3];
    verts[i * stride + 1] = geom.pos[i * 3 + 1];
    verts[i * stride + 2] = geom.pos[i * 3 + 2];
    verts[i * stride + 3] = geom.nor[i * 3];
    verts[i * stride + 4] = geom.nor[i * 3 + 1];
    verts[i * stride + 5] = geom.nor[i * 3 + 2];
    verts[i * stride + 6] = geom.col[i * 3];
    verts[i * stride + 7] = geom.col[i * 3 + 1];
    verts[i * stride + 8] = geom.col[i * 3 + 2];
    verts[i * stride + 9] = geom.emis[i];
  }
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geom.idx), gl.STATIC_DRAW);
  return { vbo, ibo, count: geom.idx.length };
}

// ---------------------------------------------------------------------------
// scene layout (world units, shared with the picking code below)
// ---------------------------------------------------------------------------
// Camera: 46° vertical fov — a touch tighter than the old 48° so the
// chef reads clearly while the counter and queue stay in frame.
const CAM_FOV = 46;

export const LAYOUT = {
  counterTopY: 1.1,
  wok: [1.1, 1.3, -0.15],
  bowl: [0.0, 1.22, -0.15],
  plate: [2.9, 1.22, 0.05],
  chef: [0.6, 0, -1.15],
  queue: [[2.9, 0, 1.5], [2.9, 0, 2.25], [2.9, 0, 3.0]],
  bins: [-4.5, -3.78, -3.06, -2.34, -1.62, -0.9].map((x) => [x, 1.24, 0.35]),
};

const SHIRT_COLORS = ['#e85d75', '#4a90d9', '#f2a541', '#7bc47f', '#9b7ede', '#e8e4d8'];
const SKIN_COLORS = ['#f2c89b', '#e8b48a', '#c98d64'];
const HAIR_COLORS = ['#2a1a12', '#4a2a18', '#6b6b6b'];
const MOOD_COLORS = { happy: '#39ff88', worried: '#ffd60a', angry: '#ff3b30' };

function buildStaticScene() {
  const g = new Geom();
  // Floor (warm wood) + a lighter worn patch under the counter.
  place(g, boxGeom('#7a5233'), 0, -0.05, 3, 0, 0, 0, 16, 0.1, 13);
  place(g, discGeom('#8a5f3a'), 0, 0.01, 1.2, 0, 0, 0, 11, 1, 5);
  // Dusk sky gradient behind everything.
  place(g, quadGeom(['#ff8a4d', '#ff8a4d', '#4a2a63', '#4a2a63'], 0.55), 0, 4, -8, 0, 0, 0, 30, 10, 1);
  // Sun.
  place(g, discGeom('#ffd97a', 1), -4.2, 3.9, -7.9, Math.PI / 2, 0, 0, 1.4, 1, 1);
  // Rooftop silhouettes.
  place(g, boxGeom('#2e2140', 0.25), -6.5, 1.8, -6.6, 0, 0, 0, 3.2, 3.6, 0.6);
  place(g, boxGeom('#2e2140', 0.25), -2.6, 2.2, -6.6, 0, 0, 0, 2.6, 4.4, 0.6);
  place(g, boxGeom('#2e2140', 0.25), 1.8, 1.6, -6.6, 0, 0, 0, 3.0, 3.2, 0.6);
  place(g, boxGeom('#2e2140', 0.25), 6.2, 2.5, -6.6, 0, 0, 0, 2.8, 5.0, 0.6);
  // Lit windows on the rooftops.
  place(g, boxGeom('#ffd97a', 1), -6.8, 2.4, -6.25, 0, 0, 0, 0.35, 0.5, 0.1);
  place(g, boxGeom('#ffd97a', 1), -2.4, 3.0, -6.25, 0, 0, 0, 0.35, 0.5, 0.1);
  place(g, boxGeom('#ffd97a', 1), 1.4, 2.0, -6.25, 0, 0, 0, 0.35, 0.5, 0.1);
  place(g, boxGeom('#ffd97a', 1), 6.0, 3.4, -6.25, 0, 0, 0, 0.35, 0.5, 0.1);
  // Back wall + plank lines.
  place(g, boxGeom('#8a5a35'), 0, 1.6, -2.5, 0, 0, 0, 12, 3.2, 0.2);
  for (let i = -5; i <= 5; i += 1) {
    place(g, boxGeom('#6e4527'), i * 1.1, 1.6, -2.38, 0, 0, 0, 0.07, 3.2, 0.05);
  }
  // String lights sagging across the wall.
  place(g, boxGeom('#3a2a1a'), 0, 3.02, -2.25, 0, 0, 0, 11, 0.04, 0.04);
  const bulbColors = ['#ffd97a', '#ff9a5c', '#ff6b6b'];
  for (let i = 0; i < 14; i += 1) {
    const x = -5.5 + i * (11 / 13);
    const y = 2.98 - 0.22 * Math.sin((i / 13) * Math.PI);
    place(g, sphereGeom(bulbColors[i % 3], 1, 8, 6), x, y, -2.2, 0, 0, 0, 0.14, 0.14, 0.14);
  }
  // Paper lanterns.
  const lanterns = [[-3.6, '#ff5a3c'], [0, '#ff7a2a'], [2.9, '#ff4d6d']];
  for (const [x, color] of lanterns) {
    place(g, boxGeom('#3a2a1a'), x, 2.75, -2.1, 0, 0, 0, 0.04, 0.5, 0.04);
    place(g, sphereGeom(color, 0.9, 14, 10), x, 2.35, -2.1, 0, 0, 0, 0.55, 0.68, 0.55);
  }
  // Menu board with chalk lines.
  place(g, boxGeom('#2a1a2e'), 4.0, 2.1, -2.38, 0, 0, 0, 1.7, 1.15, 0.06);
  place(g, boxGeom('#f5e6c8', 0.4), 4.0, 2.45, -2.34, 0, 0, 0, 1.3, 0.07, 0.02);
  place(g, boxGeom('#f5e6c8', 0.3), 4.0, 2.15, -2.34, 0, 0, 0, 1.3, 0.05, 0.02);
  place(g, boxGeom('#f5e6c8', 0.3), 4.0, 1.9, -2.34, 0, 0, 0, 1.0, 0.05, 0.02);
  // Shelf with jars.
  place(g, boxGeom('#6e4527'), -4.0, 1.9, -2.3, 0, 0, 0, 1.9, 0.08, 0.4);
  place(g, cylinderGeom('#7a9a5a', 0, 0.5, 0.5, 8), -4.5, 2.12, -2.3, 0, 0, 0, 0.28, 0.36, 0.28);
  place(g, cylinderGeom('#c98a4a', 0, 0.5, 0.5, 8), -4.0, 2.1, -2.3, 0, 0, 0, 0.24, 0.32, 0.24);
  place(g, cylinderGeom('#8a6a9a', 0, 0.5, 0.5, 8), -3.5, 2.14, -2.3, 0, 0, 0, 0.3, 0.4, 0.3);
  // Counter: top slab, front panel, plank lines, bright front edge.
  place(g, boxGeom('#a06a3c'), 0, 1.02, 0, 0, 0, 0, 10, 0.16, 1.5);
  place(g, boxGeom('#7a4e2e'), 0, 0.48, 0.72, 0, 0, 0, 10, 0.95, 0.12);
  for (let i = -4; i <= 4; i += 1) {
    place(g, boxGeom('#6b4226'), i * 1.1, 0.48, 0.79, 0, 0, 0, 0.06, 0.95, 0.02);
  }
  place(g, boxGeom('#c98a54'), 0, 1.1, 0.78, 0, 0, 0, 10, 0.04, 0.05);
  // Stove under the wok.
  place(g, boxGeom('#2a2a30'), LAYOUT.wok[0], 1.18, LAYOUT.wok[2], 0, 0, 0, 1.3, 0.16, 1.1);
  // Striped awning above the counter front — high enough that the dusk
  // sky still shows around it.
  const stripeColors = ['#c94f3d', '#f5e6c8'];
  for (let i = 0; i < 8; i += 1) {
    place(g, boxGeom(stripeColors[i % 2]), -4.375 + i * 1.25, 3.55, 0.55, -0.4, 0, 0, 1.25, 0.07, 1.2);
  }
  place(g, cylinderGeom('#3a2a1a', 0, 0.5, 0.5, 8), -4.6, 2.35, 0.9, 0, 0, 0, 0.09, 2.5, 0.09);
  place(g, cylinderGeom('#3a2a1a', 0, 0.5, 0.5, 8), 4.6, 2.35, 0.9, 0, 0, 0, 0.09, 2.5, 0.09);
  return g;
}

// ---------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------
import { INGREDIENTS } from './recipes.js';

const WHITE = [1, 1, 1];
const SKIN = '#f2c89b';
const DARK = '#1c1a20';

function compose(x, y, z, rx, ry, rz, sx, sy, sz) {
  let m = mat4Identity();
  m = mat4Translate(m, x, y, z);
  if (rx) m = mat4RotateX(m, rx);
  if (ry) m = mat4RotateY(m, ry);
  if (rz) m = mat4RotateZ(m, rz);
  m = mat4Scale(m, sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
  return m;
}

export function createRenderer(gl) {
  const prog = makeProgram(gl, VERT_SRC, FRAG_SRC);
  const pointProg = makeProgram(gl, POINT_VERT_SRC, POINT_FRAG_SRC);
  const loc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    aEmis: gl.getAttribLocation(prog, 'aEmis'),
    uMVP: gl.getUniformLocation(prog, 'uMVP'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uNMat: gl.getUniformLocation(prog, 'uNMat'),
    uTint: gl.getUniformLocation(prog, 'uTint'),
    uEmisBoost: gl.getUniformLocation(prog, 'uEmisBoost'),
    uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
    uLightCol: gl.getUniformLocation(prog, 'uLightCol'),
    uAmb: gl.getUniformLocation(prog, 'uAmb'),
    uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
    uPointPos: gl.getUniformLocation(prog, 'uPointPos'),
    uPointCol: gl.getUniformLocation(prog, 'uPointCol'),
    uPointFlicker: gl.getUniformLocation(prog, 'uPointFlicker'),
    uRimCol: gl.getUniformLocation(prog, 'uRimCol'),
    uSpec: gl.getUniformLocation(prog, 'uSpec'),
    uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
  };
  const pLoc = {
    aPos: gl.getAttribLocation(pointProg, 'aPos'),
    aSize: gl.getAttribLocation(pointProg, 'aSize'),
    aAlpha: gl.getAttribLocation(pointProg, 'aAlpha'),
    uMVP: gl.getUniformLocation(pointProg, 'uMVP'),
  };

  const staticMesh = uploadMesh(gl, buildStaticScene());
  const meshBox = uploadMesh(gl, boxGeom('#ffffff'));
  const meshSphere = uploadMesh(gl, sphereGeom('#ffffff', 0, 16, 11));
  const meshCyl = uploadMesh(gl, cylinderGeom('#ffffff', 0, 0.5, 0.5, 20));
  const meshCone = uploadMesh(gl, coneGeom('#ffffff', 0, 14));
  const meshDisc = uploadMesh(gl, discGeom('#000000'));
  // Wok: a shallow dark bowl (wide top, narrow base).
  const wokGeom = new Geom();
  place(wokGeom, cylinderGeom('#1c1c22', 0, 0.55, 0.28, 20), 0, 0, 0, 0, 0, 0, 1.1, 0.22, 1.1);
  const meshWok = uploadMesh(gl, wokGeom);
  // Chef arm: a box whose top sits at the origin (pivot = shoulder).
  const armGeom = new Geom();
  place(armGeom, boxGeom('#ffffff'), 0, -0.31, 0, 0, 0, 0, 0.16, 0.62, 0.16);
  const meshArm = uploadMesh(gl, armGeom);

  // Steam point buffer (rewritten every frame).
  const steamVbo = gl.createBuffer();
  const STEAM_N = 34;

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.1, 0.06, 0.19, 1);
  gl.viewport(0, 0, 1280, 720);

  // Per-customer visual state, keyed by ticket id. Kept out of the world
  // so the simulation stays pure; positions lerp toward queue slots.
  const custById = {};
  let departing = [];
  let prevIds = [];
  let lastServed = 0;
  let serveAnim = null; // { t } — bowl sliding to the front customer
  let lastEye = [0, 3.4, 8.2];
  let lastCenter = [0, 1.15, -0.4];

  function draw(mesh, model, tint, emisBoost, alpha, spec) {
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uMVP, false, mat4Multiply(lastVP, model));
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniformMatrix3fv(loc.uNMat, false, mat3FromMat4(model));
    gl.uniform3fv(loc.uTint, tint);
    gl.uniform1f(loc.uEmisBoost, emisBoost || 0);
    gl.uniform1f(loc.uSpec, spec || 0);
    gl.uniform1f(loc.uAlpha, alpha === undefined ? 1 : alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 40, 24);
    gl.vertexAttribPointer(loc.aEmis, 1, gl.FLOAT, false, 40, 36);
    gl.enableVertexAttribArray(loc.aPos);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.enableVertexAttribArray(loc.aColor);
    gl.enableVertexAttribArray(loc.aEmis);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  let lastVP = mat4Identity();

  function drawSteam(x, y, z, t) {
    const data = new Float32Array(STEAM_N * 5);
    for (let i = 0; i < STEAM_N; i += 1) {
      const phase = (t * 0.22 + i * 0.371) % 1;
      const px = x + Math.sin(phase * 9 + i * 2.1) * 0.17 * phase;
      const py = y + phase * 1.25;
      const pz = z + Math.cos(phase * 7 + i * 1.7) * 0.12 * phase;
      data[i * 5] = px;
      data[i * 5 + 1] = py;
      data[i * 5 + 2] = pz;
      data[i * 5 + 3] = 14 + phase * 36;
      data[i * 5 + 4] = 0.55 * (1 - phase);
    }
    gl.useProgram(pointProg);
    gl.uniformMatrix4fv(pLoc.uMVP, false, lastVP);
    gl.bindBuffer(gl.ARRAY_BUFFER, steamVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(pLoc.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(pLoc.aSize, 1, gl.FLOAT, false, 20, 12);
    gl.vertexAttribPointer(pLoc.aAlpha, 1, gl.FLOAT, false, 20, 16);
    gl.enableVertexAttribArray(pLoc.aPos);
    gl.enableVertexAttribArray(pLoc.aSize);
    gl.enableVertexAttribArray(pLoc.aAlpha);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, STEAM_N);
    gl.depthMask(true);
  }

  // The chef is the star: built in a local frame scaled 1.3x about his
  // feet (then dropped 0.4 so his torso still sits on the counter top).
  const CHEF_SCALE = 1.3;

  function drawChef(world, fx, t) {
    const [bx, , bz] = LAYOUT.chef;
    const cooking = !!(world.wok && !world.wok.done && !world.wok.burnt);
    const tossing = fx.flame > 0.05;
    const doneWaiting = !!(world.wok && world.wok.done && !world.wok.burnt);
    const hasPlate = !!world.plate;
    const bob = Math.sin(t * 1.8) * 0.02;
    const lean = cooking ? 0.08 : 0;
    const lift = 0.15; // stands a little taller so the arms clear the counter
    const chefM = compose(bx, -0.4, bz, 0, 0, 0, CHEF_SCALE, CHEF_SCALE, CHEF_SCALE);
    const part = (mesh, local, tint, emisBoost, alpha, spec) => {
      draw(mesh, mat4Multiply(chefM, local), tint, emisBoost, alpha, spec);
    };
    // Blob shadow: a soft outer halo plus a darker core.
    draw(meshDisc, compose(bx, 0.02, bz, 0, 0, 0, 2.1, 1, 2.1), [0, 0, 0], 0, 0.12);
    draw(meshDisc, compose(bx, 0.02, bz, 0, 0, 0, 1.5, 1, 1.5), [0, 0, 0], 0, 0.32);
    // Torso + apron + pocket + neckerchief.
    part(meshBox, compose(0, 1.45 + lift + bob, 0, lean, 0, 0, 0.62, 0.85, 0.36), hexRgb('#f5f0e6'), 0, 1, 0.15);
    part(meshBox, compose(0, 1.42 + lift + bob, 0.19, lean, 0, 0, 0.5, 0.7, 0.05), hexRgb('#b84a3a'), 0, 1);
    part(meshBox, compose(0.12, 1.32 + lift + bob, 0.225, lean, 0, 0, 0.18, 0.14, 0.03), hexRgb('#8a3527'), 0, 1);
    part(meshBox, compose(0, 1.88 + lift + bob, 0.19, lean, 0, 0, 0.2, 0.08, 0.06), hexRgb('#b84a3a'), 0, 1);
    // Head, eyes (+ shine), moustache, smile.
    part(meshSphere, compose(0, 2.05 + lift + bob, 0, 0, 0, 0, 0.52, 0.52, 0.52), hexRgb(SKIN), 0, 1);
    part(meshSphere, compose(-0.09, 2.08 + lift + bob, 0.22, 0, 0, 0, 0.055, 0.055, 0.055), hexRgb(DARK), 0, 1);
    part(meshSphere, compose(0.09, 2.08 + lift + bob, 0.22, 0, 0, 0, 0.055, 0.055, 0.055), hexRgb(DARK), 0, 1);
    part(meshSphere, compose(-0.105, 2.095 + lift + bob, 0.26, 0, 0, 0, 0.018, 0.018, 0.018), WHITE, 0, 1);
    part(meshSphere, compose(0.075, 2.095 + lift + bob, 0.26, 0, 0, 0, 0.018, 0.018, 0.018), WHITE, 0, 1);
    part(meshBox, compose(0, 1.97 + lift + bob, 0.23, 0, 0, 0, 0.16, 0.04, 0.03), hexRgb(DARK), 0, 1);
    part(meshSphere, compose(-0.05, 1.9 + lift + bob, 0.235, 0, 0, 0, 0.02, 0.02, 0.02), hexRgb(DARK), 0, 1);
    part(meshSphere, compose(0, 1.885 + lift + bob, 0.235, 0, 0, 0, 0.02, 0.02, 0.02), hexRgb(DARK), 0, 1);
    part(meshSphere, compose(0.05, 1.9 + lift + bob, 0.235, 0, 0, 0, 0.02, 0.02, 0.02), hexRgb(DARK), 0, 1);
    // Chef hat: band, fold ring, two puffs.
    part(meshCyl, compose(0, 2.28 + lift + bob, 0, 0, 0, 0, 0.48, 0.2, 0.48), WHITE, 0, 1, 0.1);
    part(meshCyl, compose(0, 2.22 + lift + bob, 0, 0, 0, 0, 0.53, 0.07, 0.53), WHITE, 0, 1, 0.1);
    part(meshSphere, compose(0, 2.42 + lift + bob, 0, 0, 0, 0, 0.56, 0.34, 0.56), WHITE, 0, 1, 0.1);
    part(meshSphere, compose(0.12, 2.48 + lift + bob, 0, 0, 0, 0, 0.34, 0.24, 0.34), WHITE, 0, 1, 0.1);
    // Arms: [rx, rz] per state, right arm first.
    let right = [0.15, -0.12];
    let left = [0.15, 0.12];
    if (tossing) {
      right = [-2.35, -0.35];
      left = [-2.35, 0.35];
    } else if (cooking) {
      right = [-1.0 + Math.sin(t * 7) * 0.28, 0.25 + Math.cos(t * 7) * 0.28];
      left = [0.35, 0.15];
    } else if (doneWaiting) {
      right = [0, 1.3]; // points toward the plate
      left = [0.3, 0.15];
    } else if (hasPlate) {
      right = [-0.9, -0.1]; // reaching forward over the counter
      left = [0.15, 0.12];
    }
    const shoulders = [[0.36, 1.78 + lift + bob, 0, right], [-0.36, 1.78 + lift + bob, 0, left]];
    for (const [sx, sy, sz, angles] of shoulders) {
      const armM = compose(sx, sy, sz, angles[0], 0, angles[1], 1, 1, 1);
      // Rolled-up sleeves: skin arms read against the white shirt.
      part(meshArm, armM, hexRgb(SKIN), 0, 1);
      const hand = transformPoint(armM, [0, -0.62, 0]);
      part(meshSphere, compose(hand[0], hand[1], hand[2], 0, 0, 0, 0.18, 0.18, 0.18), hexRgb(SKIN), 0, 1);
    }
  }

  function drawCustomer(c, t, alpha) {
    const hop = c.hop || 0;
    const y = c.y + hop;
    draw(meshDisc, compose(c.x, 0.02, c.z, 0, 0, 0, 1.35, 1, 1.35), [0, 0, 0], 0, 0.12 * alpha);
    draw(meshDisc, compose(c.x, 0.02, c.z, 0, 0, 0, 1.0, 1, 1.0), [0, 0, 0], 0, 0.32 * alpha);
    draw(meshBox, compose(c.x, 0.95 + y, c.z, 0, 0, 0, 0.55, 0.8, 0.34), hexRgb(c.shirt), 0, alpha);
    // Collar + two shirt buttons.
    draw(meshBox, compose(c.x, 1.36 + y, c.z + 0.17, 0, 0, 0, 0.3, 0.07, 0.05), WHITE, 0, alpha);
    draw(meshSphere, compose(c.x, 1.05 + y, c.z + 0.18, 0, 0, 0, 0.03, 0.03, 0.03), hexRgb(DARK), 0, alpha);
    draw(meshSphere, compose(c.x, 0.85 + y, c.z + 0.18, 0, 0, 0, 0.03, 0.03, 0.03), hexRgb(DARK), 0, alpha);
    draw(meshSphere, compose(c.x, 1.62 + y, c.z, 0, 0, 0, 0.48, 0.48, 0.48), hexRgb(c.skin), 0, alpha);
    // Hair, varied per customer: cap, bun, spiky, flat-top.
    const style = c.hairStyle || 0;
    if (style === 1) {
      draw(meshSphere, compose(c.x, 1.74 + y, c.z, 0, 0, 0, 0.5, 0.3, 0.5), hexRgb(c.hair), 0, alpha);
      draw(meshSphere, compose(c.x, 1.88 + y, c.z - 0.1, 0, 0, 0, 0.2, 0.2, 0.2), hexRgb(c.hair), 0, alpha);
    } else if (style === 2) {
      draw(meshSphere, compose(c.x, 1.74 + y, c.z, 0, 0, 0, 0.5, 0.3, 0.5), hexRgb(c.hair), 0, alpha);
      draw(meshCone, compose(c.x - 0.14, 1.92 + y, c.z, 0, 0, -0.3, 0.14, 0.22, 0.14), hexRgb(c.hair), 0, alpha);
      draw(meshCone, compose(c.x, 1.95 + y, c.z, 0, 0, 0, 0.14, 0.24, 0.14), hexRgb(c.hair), 0, alpha);
      draw(meshCone, compose(c.x + 0.14, 1.92 + y, c.z, 0, 0, 0.3, 0.14, 0.22, 0.14), hexRgb(c.hair), 0, alpha);
    } else if (style === 3) {
      draw(meshBox, compose(c.x, 1.8 + y, c.z, 0, 0, 0, 0.46, 0.16, 0.46), hexRgb(c.hair), 0, alpha);
    } else {
      draw(meshSphere, compose(c.x, 1.74 + y, c.z, 0, 0, 0, 0.5, 0.3, 0.5), hexRgb(c.hair), 0, alpha);
    }
    draw(meshSphere, compose(c.x - 0.08, 1.64 + y, c.z + 0.2, 0, 0, 0, 0.05, 0.05, 0.05), hexRgb(DARK), 0, alpha);
    draw(meshSphere, compose(c.x + 0.08, 1.64 + y, c.z + 0.2, 0, 0, 0, 0.05, 0.05, 0.05), hexRgb(DARK), 0, alpha);
    // Mood bubble above the head.
    const moodY = 1.98 + y + Math.sin(t * 2 + c.x) * 0.03;
    draw(meshSphere, compose(c.x, moodY, c.z, 0, 0, 0, 0.18, 0.18, 0.18), hexRgb(MOOD_COLORS[c.face] || '#39ff88'), 0.7, alpha);
  }

  function trackCustomers(world, dt) {
    const demo = world.screen === 'title';
    const tickets = demo
      ? [{ id: 'demo-1', face: 'happy' }, { id: 'demo-2', face: 'happy' }, { id: 'demo-3', face: 'happy' }]
      : world.tickets;
    const ids = tickets.map((ticket) => ticket.id);
    // Removed tickets: served ones hop, the rest walk away.
    for (const id of prevIds) {
      if (!ids.includes(id) && custById[id]) {
        const served = world.served > lastServed;
        departing.push({ ...custById[id], t: 0, kind: served ? 'served' : 'left', hop: 0 });
        delete custById[id];
      }
    }
    lastServed = world.served;
    prevIds = ids;
    tickets.forEach((ticket, i) => {
      const slot = LAYOUT.queue[i];
      if (!custById[ticket.id]) {
        const hash = [...String(ticket.id)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
        custById[ticket.id] = {
          id: ticket.id,
          x: slot[0] + ((hash % 5) - 2) * 0.12,
          z: slot[2],
          face: ticket.face,
          shirt: SHIRT_COLORS[hash % SHIRT_COLORS.length],
          skin: SKIN_COLORS[hash % SKIN_COLORS.length],
          hair: HAIR_COLORS[hash % HAIR_COLORS.length],
          hairStyle: hash % 4,
        };
      }
      const c = custById[ticket.id];
      c.face = ticket.face;
      // Time-based easing (dt = 0 in shot mode, so staged frames are
      // identical no matter how many frames ran before the capture).
      const k = dt > 0 ? 1 - Math.exp(-dt * 4) : 0;
      c.x += (slot[0] - c.x) * k;
      c.z += (slot[2] - c.z) * k;
    });
    departing = departing.filter((c) => {
      c.t += dt;
      if (c.kind === 'served') c.hop = Math.abs(Math.sin(Math.min(c.t / 0.9, 1) * Math.PI)) * 0.45;
      else c.z += dt * 1.1;
      return c.t < 0.9;
    });
  }

  function render(world, hoverId, fx, animTime, dt) {
    const t = animTime;
    const eye = [Math.sin(t * 0.25) * 0.12, 3.35 + Math.sin(t * 0.4) * 0.04, 8.2];
    const center = [0, 1.15, -0.3];
    lastEye = eye;
    lastCenter = center;
    const view = mat4LookAt(eye, center, [0, 1, 0]);
    const proj = mat4Perspective((CAM_FOV * Math.PI) / 180, 1280 / 720, 0.1, 60);
    lastVP = mat4Multiply(proj, view);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform3fv(loc.uLightDir, [0.36, -0.72, -0.54]);
    gl.uniform3fv(loc.uLightCol, [1.0, 0.85, 0.65]);
    gl.uniform3fv(loc.uAmb, [0.45, 0.38, 0.44]);
    gl.uniform3fv(loc.uCamPos, eye);
    gl.uniform3fv(loc.uPointPos, [LAYOUT.wok[0], LAYOUT.wok[1] + 1.3, LAYOUT.wok[2]]);
    gl.uniform3fv(loc.uPointCol, [1.0, 0.55, 0.2]);
    // Flame flicker — a pure function of the (frozen in shot mode) clock,
    // so staged frames stay deterministic.
    gl.uniform1f(loc.uPointFlicker, 1.5 + 0.3 * Math.sin(t * 11) + 0.2 * Math.sin(t * 23 + 1.7));
    gl.uniform3fv(loc.uRimCol, [0.55, 0.55, 0.9]);

    // Static shop.
    draw(staticMesh, mat4Identity(), WHITE, 0, 1);
    // Soft contact gradient under the counter front.
    draw(meshDisc, compose(0, 0.015, 0.95, 0, 0, 0, 11, 1, 2.2), [0, 0, 0], 0, 0.14);
    draw(meshDisc, compose(0, 0.015, 0.9, 0, 0, 0, 10, 1, 1.4), [0, 0, 0], 0, 0.26);

    // Serve animation: a bowl slides from the plate to the front customer.
    if (world.served > lastServed && !serveAnim) serveAnim = { t: 0 };
    if (serveAnim) {
      serveAnim.t += dt;
      const p = Math.min(serveAnim.t / 0.7, 1);
      const from = LAYOUT.plate;
      const to = LAYOUT.queue[0];
      const x = from[0] + (to[0] - from[0]) * p;
      const y = 1.35 + Math.sin(p * Math.PI) * 0.35;
      const z = from[2] + (to[2] - from[2]) * p;
      draw(meshCyl, compose(x, y, z, 0, 0, 0, 0.68, 0.18, 0.68), hexRgb('#f5f0e6'), 0, 1);
      draw(meshSphere, compose(x, y + 0.1, z, 0, 0, 0, 0.5, 0.16, 0.5), hexRgb('#ffd60a'), 0, 1);
      if (p >= 1) serveAnim = null;
    }

    // Ingredient bowls on the counter.
    INGREDIENTS.forEach((ing, i) => {
      const [x, y, z] = LAYOUT.bins[i];
      const hovered = hoverId === ing.id;
      const s = hovered ? 1.12 : 1;
      draw(meshCyl, compose(x, y, z, 0, 0, 0, 0.52 * s, 0.14, 0.52 * s), hexRgb('#f5f0e6'), hovered ? 0.3 : 0, 1, 0.5);
      draw(meshSphere, compose(x, y + 0.09, z, 0, 0, 0, 0.34 * s, 0.2, 0.34 * s), hexRgb(ing.color), hovered ? 0.3 : 0, 1);
    });

    // Assembly bowl + its contents.
    const [bx2, by2, bz2] = LAYOUT.bowl;
    draw(meshCyl, compose(bx2, by2, bz2, 0, 0, 0, 0.68, 0.18, 0.68), hexRgb('#f5f0e6'), 0, 1, 0.5);
    draw(meshCyl, compose(bx2, by2 + 0.09, bz2, 0, 0, 0, 0.76, 0.05, 0.76), hexRgb('#f5f0e6'), 0, 1, 0.5);
    world.bowl.forEach((id, i) => {
      const a = i * 2.4 + 0.6;
      draw(
        meshSphere,
        compose(bx2 + Math.cos(a) * 0.13, by2 + 0.13, bz2 + Math.sin(a) * 0.13, 0, 0, 0, 0.2, 0.14, 0.2),
        hexRgb(INGREDIENT_BY_ID[id].color),
        0,
        1,
      );
    });

    // Wok + noodles + steam + toss flame.
    const [wx, wy, wz] = LAYOUT.wok;
    const tossing = fx.flame > 0.05;
    const cooking = !!(world.wok && !world.wok.done && !world.wok.burnt);
    let wokY = wy;
    let wokTilt = 0;
    if (tossing) wokY += fx.flame * 0.3;
    if (cooking) wokTilt = Math.sin(t * 7) * 0.05;
    const hoverWok = hoverId === 'wok';
    draw(meshWok, compose(wx, wokY, wz, 0, 0, wokTilt, 1, 1, 1), WHITE, hoverWok ? 0.25 : 0, 1, 0.7);
    if (world.wok) {
      const burnt = world.wok.burnt;
      const noodleTint = hexRgb(burnt ? '#3a2a1a' : '#ffd60a');
      // Mounded above the rim so the noodles read from the front.
      draw(meshSphere, compose(wx, wokY + 0.16, wz, 0, 0, wokTilt, 0.62, 0.26, 0.62), noodleTint, 0, 1);
      world.wok.recipe.ingredients.forEach((id, i) => {
        const a = i * 2.4 + 0.6;
        draw(
          meshSphere,
          compose(wx + Math.cos(a) * 0.2, wokY + 0.22, wz + Math.sin(a) * 0.2, 0, 0, wokTilt, 0.12, 0.12, 0.12),
          hexRgb(INGREDIENT_BY_ID[id].color),
          0,
          1,
        );
      });
      if (!burnt) drawSteam(wx, wokY + 0.28, wz, t);
      if (tossing) {
        // Small flame licking the wok — it must never hide the chef.
        draw(meshCone, compose(wx, wokY + 0.32, wz, 0, 0, 0, 0.35 * fx.flame + 0.12, 0.5 * fx.flame + 0.12, 0.35 * fx.flame + 0.12), hexRgb('#ff7a18'), 0.85, 1);
        for (let k = 0; k < 5; k += 1) {
          const s = k / 4;
          draw(
            meshBox,
            compose(wx + (s - 0.5) * 0.7, wokY + 0.28 + Math.sin(s * Math.PI) * 0.3 * fx.flame, wz, 0, 0, s * 1.2, 0.16, 0.05, 0.16),
            hexRgb('#ffd60a'),
            0.4,
            1,
          );
        }
      }
    }

    // Serving plate (+ a glowing marker while a dish waits).
    const [px, py, pz] = LAYOUT.plate;
    const hoverPlate = hoverId === 'plate';
    draw(meshCyl, compose(px, py, pz, 0, 0, 0, 0.84, 0.06, 0.84), hexRgb('#fdfdfd'), hoverPlate ? 0.3 : 0, 1, 0.6);
    if (world.plate) {
      draw(meshSphere, compose(px, py + 0.08, pz, 0, 0, 0, 0.6, 0.2, 0.6), hexRgb('#ffd60a'), 0, 1);
      world.plate.recipe.ingredients.forEach((id, i) => {
        const a = i * 2.4 + 0.6;
        draw(
          meshSphere,
          compose(px + Math.cos(a) * 0.18, py + 0.16, pz + Math.sin(a) * 0.18, 0, 0, 0, 0.11, 0.11, 0.11),
          hexRgb(INGREDIENT_BY_ID[id].color),
          0,
          1,
        );
      });
      const pulse = 0.75 + Math.sin(t * 4) * 0.25;
      draw(meshSphere, compose(px, py + 0.55 + Math.sin(t * 2.5) * 0.06, pz, 0, 0, 0, 0.16, 0.16, 0.16), hexRgb('#39ff88'), pulse, 1);
    }

    // Chef, then customers.
    drawChef(world, fx, t);
    trackCustomers(world, dt);
    for (const id of Object.keys(custById)) {
      const c = custById[id];
      const bobY = Math.sin(t * 2 + c.x * 3) * 0.02;
      drawCustomer({ ...c, y: bobY }, t, 1);
    }
    for (const c of departing) {
      const alpha = c.kind === 'served' ? Math.max(0, 1 - Math.max(0, c.t - 0.4) / 0.5) : Math.max(0, 1 - c.t / 0.9);
      drawCustomer(c, t, alpha);
    }
  }

  function pick(ndcX, ndcY) {
    const f = vec3Norm(vec3Sub(lastCenter, lastEye));
    const r = vec3Norm(vec3Cross(f, [0, 1, 0]));
    const u = vec3Cross(r, f);
    const tanV = Math.tan((CAM_FOV * Math.PI / 180) / 2);
    const tanH = tanV * (1280 / 720);
    const dir = vec3Norm([
      f[0] + r[0] * ndcX * tanH + u[0] * ndcY * tanV,
      f[1] + r[1] * ndcX * tanH + u[1] * ndcY * tanV,
      f[2] + r[2] * ndcX * tanH + u[2] * ndcY * tanV,
    ]);
    const targets = [];
    INGREDIENTS.forEach((ing, i) => targets.push({ id: ing.id, c: LAYOUT.bins[i], r: 0.45 }));
    targets.push({ id: 'wok', c: LAYOUT.wok, r: 0.65 });
    targets.push({ id: 'plate', c: LAYOUT.plate, r: 0.55 });
    let best = null;
    let bestT = Infinity;
    for (const tg of targets) {
      const oc = vec3Sub(lastEye, tg.c);
      const b = vec3Dot(oc, dir);
      const c = vec3Dot(oc, oc) - tg.r * tg.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const tt = -b - Math.sqrt(disc);
      if (tt > 0 && tt < bestT) {
        bestT = tt;
        best = tg.id;
      }
    }
    return best;
  }

  return { render, pick };
}
