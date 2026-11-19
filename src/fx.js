import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* textures                                                            */
/* ------------------------------------------------------------------ */

export function makeRadialTexture(size = 128, stops = null) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const s = stops || [
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(255,255,255,.72)"],
    [0.46, "rgba(255,255,255,.2)"],
    [0.75, "rgba(255,255,255,.04)"],
    [1, "rgba(255,255,255,0)"],
  ];
  for (const [p, col] of s) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeCloudTexture(size = 256, seed = 7) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const x = size * (0.18 + rnd() * 0.64);
    const y = size * (0.28 + rnd() * 0.44);
    const r = size * (0.09 + rnd() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.08 + rnd() * 0.1})`);
    g.addColorStop(0.55, `rgba(255,255,255,${0.025 + rnd() * 0.04})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* light beam                                                          */
/* ------------------------------------------------------------------ */

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uStrength;
  uniform float uSeed;
  varying vec2 vUv;

  void main() {
    float across = abs(vUv.x - 0.5) * 2.0;
    float core = exp(-pow(across * 10.0, 2.0));
    float glow = exp(-pow(across * 1.75, 2.0));
    float flow = 0.84 + 0.16 * sin(vUv.y * 30.0 - uTime * 1.8 + uSeed * 6.283);
    float mask = smoothstep(0.0, 0.045, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    float a = (core * 0.7 + glow * 0.095) * flow * mask * uStrength;
    vec3 col = mix(uColor, vec3(0.86, 0.93, 1.0), core * 0.52);
    col *= 0.86 + core * 0.95;
    gl_FragColor = vec4(col, a);
  }
`;

export class Beam {
  constructor(scene, opts = {}) {
    this.segments = opts.segments || 42;
    this.width = opts.width || 0.72;
    this.strength = opts.strength ?? 1;
    this.seed = Math.random();
    this.start = new THREE.Vector3();
    this.control = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
    this.tmpT = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
    this.tmpSide = new THREE.Vector3();

    const count = (this.segments + 1) * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const index = [];
    for (let i = 0; i < this.segments; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const uvArr = geo.attributes.uv.array;
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const u = i * 4;
      uvArr[u] = 0;
      uvArr[u + 1] = t;
      uvArr[u + 2] = 1;
      uvArr[u + 3] = t;
    }
    geo.attributes.uv.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color || 0xd7e7ff) },
        uTime: { value: 0 },
        uStrength: { value: this.strength },
        uSeed: { value: this.seed },
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  setStrength(v) {
    this.strength = v;
    this.material.uniforms.uStrength.value = v;
    this.mesh.visible = v > 0.002;
  }

  setColor(color) {
    this.material.uniforms.uColor.value.set(color);
  }

  setCurve(start, control, end) {
    this.start.copy(start);
    this.control.copy(control);
    this.end.copy(end);
  }

  setStraight(start, end, lift = 0) {
    this.start.copy(start);
    this.end.copy(end);
    this.control.copy(start).add(end).multiplyScalar(0.5);
    this.control.y += lift;
  }

  update(time, camera) {
    if (!this.mesh.visible) return;
    this.material.uniforms.uTime.value = time;
    const pos = this.geo.attributes.position.array;
    const seg = this.segments;
    const p = this.tmpP;
    const tan = this.tmpT;
    const side = this.tmpSide;
    const toCam = this.tmpC;
    const s = this.start;
    const c = this.control;
    const e = this.end;

    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const it = 1 - t;
      p.set(
        it * it * s.x + 2 * it * t * c.x + t * t * e.x,
        it * it * s.y + 2 * it * t * c.y + t * t * e.y,
        it * it * s.z + 2 * it * t * c.z + t * t * e.z
      );
      tan.set(
        2 * (it * (c.x - s.x) + t * (e.x - c.x)),
        2 * (it * (c.y - s.y) + t * (e.y - c.y)),
        2 * (it * (c.z - s.z) + t * (e.z - c.z))
      ).normalize();
      toCam.copy(camera.position).sub(p).normalize();
      side.crossVectors(tan, toCam);
      if (side.lengthSq() < 1e-6) side.set(0, 1, 0);
      else side.normalize();
      const w = this.width * (0.55 + 0.55 * Math.sin(Math.PI * t)) * 0.5;
      const a = i * 6;
      pos[a] = p.x + side.x * w;
      pos[a + 1] = p.y + side.y * w;
      pos[a + 2] = p.z + side.z * w;
      pos[a + 3] = p.x - side.x * w;
      pos[a + 4] = p.y - side.y * w;
      pos[a + 5] = p.z - side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* glow points (fireflies / dust / bursts)                             */
/* ------------------------------------------------------------------ */

const POINTS_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uDrift;
  attribute float aPhase;
  attribute float aScale;
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (uDrift > 0.0) {
      float ph = aPhase * 6.2831;
      p.x += sin(uTime * 0.23 + ph) * uDrift;
      p.y += sin(uTime * 0.41 + ph * 1.7) * uDrift * 0.35;
      p.z += cos(uTime * 0.19 + ph * 1.3) * uDrift;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float twinkle = 0.62 + 0.38 * sin(uTime * 1.6 + aPhase * 12.0);
    vAlpha = aAlpha * mix(1.0, twinkle, uDrift > 0.0 ? 1.0 : 0.2);
    gl_PointSize = uSize * aScale * uPixelRatio * (240.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float a = smoothstep(0.5, 0.06, d);
    a *= smoothstep(0.0, 0.22, vAlpha);
    gl_FragColor = vec4(uColor, a * vAlpha);
  }
`;

export class GlowPoints {
  constructor(scene, count, opts = {}) {
    this.count = count;
    this.cursor = 0;
    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.scale = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.phase[i] = Math.random();
      this.scale[i] = 0.6 + Math.random() * 0.8;
      this.alpha[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(this.phase, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(this.scale, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSize: { value: opts.size || 6 },
        uDrift: { value: opts.drift || 0 },
        uColor: { value: new THREE.Color(opts.color || 0xcfe0ff) },
      },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geo = geo;
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setPositions(spawn) {
    for (let i = 0; i < this.count; i++) {
      const p = spawn(i);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.alpha[i] = p.alpha ?? 0.7;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  burst(origin, count = 24, opts = {}) {
    const speed = opts.speed ?? 2.2;
    const life = opts.life ?? 1.6;
    const spread = opts.spread ?? 1.4;
    const color = opts.color;
    if (color) this.material.uniforms.uColor.value.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor % this.count;
      this.cursor++;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.positions[i * 3] = origin.x + Math.cos(a) * r;
      this.positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread;
      this.positions[i * 3 + 2] = origin.z + Math.sin(a) * r;
      this.vel[i * 3] = Math.cos(a) * (0.2 + Math.random() * speed);
      this.vel[i * 3 + 1] = 0.35 + Math.random() * speed * 0.7;
      this.vel[i * 3 + 2] = Math.sin(a) * (0.2 + Math.random() * speed);
      this.life[i] = life * (0.5 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i];
      this.alpha[i] = 1;
      this.scale[i] = 0.4 + Math.random() * 1.1;
      this.phase[i] = Math.random();
    }
    this.geo.attributes.aScale.needsUpdate = true;
    this.geo.attributes.aPhase.needsUpdate = true;
  }

  update(dt, time) {
    this.material.uniforms.uTime.value = time;
    let dirty = false;
    const drag = Math.pow(0.985, dt * 60);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= dt * 0.65;
      this.positions[k] += this.vel[k] * dt;
      this.positions[k + 1] += this.vel[k + 1] * dt;
      this.positions[k + 2] += this.vel[k + 2] * dt;
      this.vel[k] *= drag;
      this.vel[k + 2] *= drag;
      const lf = Math.max(0, this.life[i] / Math.max(0.0001, this.maxLife[i]));
      this.alpha[i] = Math.min(1, lf * 2.4) * (0.55 + 0.45 * Math.sin(time * 9 + this.phase[i] * 8));
      if (this.life[i] <= 0) this.alpha[i] = 0;
      dirty = true;
    }
    if (dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }
}
