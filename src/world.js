import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Beam, GlowPoints, makeRadialTexture, makeCloudTexture } from "./fx.js";

const V3 = THREE.Vector3;
const BASE = import.meta.env.BASE_URL || "/";
const glbUrl = (name) => `${BASE}models/${name}.glb`;
const DEG = Math.PI / 180;
const TMP_WIN_COLOR = new THREE.Color(0xffb468);
const TMP_V1 = new V3();
const TMP_V2 = new V3();

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function dampAngle(cur, target, lambda, dt) {
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-lambda * dt));
}

function smootherstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function easeInOutSine(x) {
  const t = Math.max(0, Math.min(1, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/* ------------------------------------------------------------------ */
/* deterministic random + procedural textures                          */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeEarthTexture() {
  const rnd = mulberry32(9173);
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = "#6d6d64";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 1 + rnd() * 24;
      const v = 60 + Math.floor(rnd() * 64);
      ctx.fillStyle = `rgba(${v},${v + 3},${v - 3},${0.03 + rnd() * 0.09})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(28,30,21,${0.04 + rnd() * 0.09})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) ctx.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 30);
      ctx.stroke();
    }
  }, 18);
}

function makeStoneTexture() {
  const rnd = mulberry32(441);
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = "#888b86";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) {
      const v = 80 + Math.floor(rnd() * 90);
      ctx.fillStyle = `rgba(${v},${v + 2},${v - 4},${0.04 + rnd() * 0.12})`;
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(40,42,38,${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 0.5 + rnd();
      ctx.beginPath();
      let x = rnd() * s;
      let y = rnd() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (rnd() - 0.5) * 44;
        y += (rnd() - 0.5) * 44;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = `rgba(52,66,44,${0.03 + rnd() * 0.08})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 3);
}

function makeWoodTexture() {
  const rnd = mulberry32(771);
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = "#8a735c";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 240; i++) {
      const x = rnd() * s;
      const w = 0.5 + rnd() * 2.4;
      const v = 60 + rnd() * 80;
      ctx.fillStyle = `rgba(${v},${v - 7},${v - 18},${0.04 + rnd() * 0.12})`;
      ctx.fillRect(x, 0, w, s);
    }
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(38,28,20,${0.08 + rnd() * 0.12})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const y = rnd() * s;
      ctx.ellipse(rnd() * s, y, 4 + rnd() * 14, 2 + rnd() * 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, 2);
}

function makeRoofTexture() {
  const rnd = mulberry32(902);
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = "#76808a";
    ctx.fillRect(0, 0, s, s);
    const rows = 16;
    for (let y = 0; y < rows; y++) {
      const h = s / rows;
      ctx.fillStyle = `rgba(30,38,46,${0.18 + rnd() * 0.1})`;
      ctx.fillRect(0, y * h, s, 2);
      for (let x = 0; x < 14; x++) {
        ctx.fillStyle = `rgba(44,54,62,${0.06 + rnd() * 0.12})`;
        ctx.fillRect(x * (s / 14) + (y % 2) * (s / 28), y * h + 3, 2, h - 3);
      }
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(160,170,170,${rnd() * 0.05})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 8, 1);
    }
  }, 2);
}

function makeRingTexture(size = 160) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const r = size * 0.32;
  const glow = ctx.createRadialGradient(cx, cx, r * 0.5, cx, cx, r * 1.7);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.58, "rgba(200,224,255,0.22)");
  glow.addColorStop(0.72, "rgba(190,216,248,0.06)");
  glow.addColorStop(1, "rgba(150,190,240,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(235,245,255,0.92)";
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(200,224,255,0.3)";
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.stroke();
  // four tiny ticks
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.strokeStyle = "rgba(237,246,255,0.8)";
    ctx.lineWidth = size * 0.01;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.08, cx + Math.sin(a) * r * 1.08);
    ctx.lineTo(cx + Math.cos(a) * r * 1.3, cx + Math.sin(a) * r * 1.3);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* small geometry helpers                                              */
/* ------------------------------------------------------------------ */

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function ribbonGeometry(curve, widthFn, segments = 160, y = 0) {
  const pos = [];
  const uv = [];
  const idx = [];
  const l = new V3();
  const r = new V3();
  const n = new V3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    n.set(-tan.z, 0, tan.x).normalize();
    const w = widthFn(t) * 0.5;
    l.copy(p).addScaledVector(n, -w);
    r.copy(p).addScaledVector(n, w);
    pos.push(l.x, y, l.z, r.x, y, r.z);
    uv.push(0, t, 1, t);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function makeRidge(points, z, color, baseY = -8) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], baseY);
  for (const [x, y] of points) shape.lineTo(x, y);
  shape.lineTo(points[points.length - 1][0], baseY);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const low = new THREE.Color(color).multiplyScalar(0.48);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLow: { value: low },
      uHigh: { value: new THREE.Color(color).multiplyScalar(1.25) },
      uFog: { value: new THREE.Color(0x08121a) },
      uFogDensity: { value: 0.0065 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLow;
      uniform vec3 uHigh;
      uniform vec3 uFog;
      uniform float uFogDensity;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        float t = clamp((vWorld.y + 8.0) / 32.0, 0.0, 1.0);
        vec3 col = mix(uLow, uHigh, pow(t, 0.72));
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFog, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* model fitting                                                       */
/* ------------------------------------------------------------------ */

function tintMaterial(mat, opts) {
  const m = mat.clone();
  if (opts.clearRoughnessMap) {
    m.roughnessMap = null;
    m.metalnessMap = null;
  }
  if (opts.tint && m.color) m.color.multiply(new THREE.Color(opts.tint));
  if (opts.roughness != null) m.roughness = opts.roughness;
  if (opts.metalness != null) m.metalness = opts.metalness;
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    if (!m.emissiveMap && m.map && opts.emissiveFromMap) m.emissiveMap = m.map;
  }
  if (opts.opacity != null) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  if (opts.depthWrite != null) m.depthWrite = opts.depthWrite;
  if (opts.envMapIntensity != null) m.envMapIntensity = opts.envMapIntensity;
  m.needsUpdate = true;
  return m;
}

function fitModel(gltf, opts) {
  // Each placement gets its own copy: the same GLTF scene may be used for
  // several trees, braziers or mountain layers, and fitModel mutates transforms.
  const root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new V3());
  const center = bbox.getCenter(new V3());
  const scale = opts.height / Math.max(size.y, 0.0001);
  const sx = scale * (opts.widthScale ?? 1);
  const sy = scale * (opts.heightScale ?? 1);
  const sz = scale * (opts.depthScale ?? 1);
  root.scale.set(sx, sy, sz);
  root.position.set(-center.x * sx, -bbox.min.y * sy, -center.z * sz);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = opts.castShadow ?? true;
    o.receiveShadow = opts.receiveShadow ?? true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const tinted = mats.map((m) => (m ? tintMaterial(m, opts) : m));
    o.material = Array.isArray(o.material) ? tinted : tinted[0];
  });
  const wrap = new THREE.Group();
  wrap.add(root);
  if (opts.rotate) wrap.rotation.set(...opts.rotate);
  if (opts.position) wrap.position.set(...opts.position);
  wrap.userData.size = size;
  wrap.userData.triangles = (() => {
    let tris = 0;
    root.traverse((o) => {
      if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return tris;
  })();
  return wrap;
}

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */

export const ANCHORS = {
  source: new THREE.Vector3(-8.5, 13.4, -32),
  dockU: [0.405, 0.575, 0.7],
  targetCount: 3,
};

export async function buildWorld({ scene, renderer, camera, onProgress, onNote }) {
  const root = new THREE.Group();
  scene.add(root);

  const rnd = mulberry32(20261114);
  const interactives = [];
  const radial = makeRadialTexture(128);
  const ringTex = makeRingTexture(160);
  const softCloud = makeCloudTexture(256, 12);

  const texEarth = makeEarthTexture();
  const texStone = makeStoneTexture();
  const texWood = makeWoodTexture();
  const texRoof = makeRoofTexture();

  const matEarth = new THREE.MeshStandardMaterial({
    map: texEarth, color: 0x6e786a, roughness: 1, metalness: 0, bumpMap: texEarth, bumpScale: 0.08,
  });
  const matStone = new THREE.MeshStandardMaterial({
    map: texStone, color: 0x9da9ac, roughness: 0.9, metalness: 0.04, bumpMap: texStone, bumpScale: 0.03,
  });
  const matDarkStone = new THREE.MeshStandardMaterial({
    map: texStone, color: 0x7c8b90, roughness: 0.92, metalness: 0.03,
  });
  const matWood = new THREE.MeshStandardMaterial({
    map: texWood, color: 0x8d7a63, roughness: 0.82, metalness: 0.02, bumpMap: texWood, bumpScale: 0.02,
  });
  const matDarkWood = new THREE.MeshStandardMaterial({
    map: texWood, color: 0x5d4d3e, roughness: 0.78, metalness: 0.02,
  });
  const matRoof = new THREE.MeshStandardMaterial({
    map: texRoof, color: 0x788690, roughness: 0.72, metalness: 0.08,
  });
  const matPlaster = new THREE.MeshStandardMaterial({
    map: texStone, color: 0xb2b2a6, roughness: 0.94, metalness: 0.0,
  });
  const matBronze = new THREE.MeshStandardMaterial({
    color: 0xb1884f, roughness: 0.28, metalness: 0.96, envMapIntensity: 1.7,
  });
  const matDarkBronze = new THREE.MeshStandardMaterial({
    color: 0x72532f, roughness: 0.45, metalness: 0.85, envMapIntensity: 1.1,
  });
  const matMirror = new THREE.MeshStandardMaterial({
    color: 0xd7e6f7, roughness: 0.045, metalness: 1, envMapIntensity: 2.6,
    emissive: 0x18324f, emissiveIntensity: 0.55,
  });
  const matGlowWarm = new THREE.MeshBasicMaterial({ color: 0xffb768 });
  const matGlowPalewarm = new THREE.MeshBasicMaterial({ color: 0xffd9a1 });
  const matChar = new THREE.MeshBasicMaterial({ color: 0x060505 });

  /* ---------------------------------------------------------------- */
  /* environment map                                                  */
  /* ---------------------------------------------------------------- */

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x060b12);
  const envSky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x0b1520, side: THREE.BackSide })
  );
  envScene.add(envSky);
  const envMoon = new THREE.Mesh(
    new THREE.SphereGeometry(7, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xcfe2ff })
  );
  envMoon.position.set(-22, 24, -30);
  envScene.add(envMoon);
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa35a })
    );
    lamp.position.set(-20 + i * 15, 3, 18 - i * 8);
    envScene.add(lamp);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(envScene, 0.06).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.36;

  /* ---------------------------------------------------------------- */
  /* sky, stars, ridges                                               */
  /* ---------------------------------------------------------------- */

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x02050a) },
      uHorizon: { value: new THREE.Color(0x0b1a23) },
      uGlow: { value: new THREE.Color(0x3a5b74) },
      uGlowDir: { value: new THREE.Vector3(-0.28, 0, -0.96).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uGlowDir;
      varying vec3 vWorld;
      void main() {
        vec3 d = normalize(vWorld);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
        col += vec3(0.012, 0.014, 0.028) * (1.0 - smoothstep(0.0, 0.45, h));
        vec2 flatd = normalize(d.xz + vec2(0.00001));
        float az = max(dot(flatd, normalize(uGlowDir.xz)), 0.0);
        float glow = pow(az, 5.0) * (1.0 - smoothstep(0.0, 0.66, h)) * 0.42;
        col += uGlow * glow;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 40, 24), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // stars
  {
    const count = 1300;
    const positions = [];
    const sizes = [];
    const phases = [];
    const rr = mulberry32(500);
    for (let i = 0; i < count; i++) {
      const az = rr() * Math.PI * 2;
      const el = Math.asin(rr() * 0.92 + 0.045);
      const rad = 135 + rr() * 25;
      positions.push(Math.cos(az) * Math.cos(el) * rad, Math.sin(el) * rad, Math.sin(az) * Math.cos(el) * rad);
      sizes.push(0.45 + Math.pow(rr(), 2.3) * 2.4);
      phases.push(rr());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aPhase;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (330.0 / max(1.0, -mv.z));
          vAlpha = 0.5 + 0.5 * sin(uTime * 0.65 + aPhase * 32.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float a = smoothstep(0.5, 0.03, d);
          gl_FragColor = vec4(vec3(0.72, 0.82, 0.98) * (0.65 + vAlpha * 0.55), a * (0.38 + vAlpha * 0.62));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const stars = new THREE.Points(geo, mat);
    stars.renderOrder = -8;
    scene.add(stars);
    root.userData.stars = mat;
  }

  // distant ridges: two painted layers behind the valley
  root.add(makeRidge([
    [-110, 2], [-94, 15], [-81, 9], [-68, 22], [-55, 13], [-43, 20], [-33, 12], [-20, 25],
    [-10, 17], [3, 23], [14, 15], [27, 26], [38, 16], [51, 23], [63, 11], [78, 19], [95, 6], [110, 2],
  ], -86, 0x0a151e));
  // the ridge that keeps the moon hidden until the last act
  root.add(makeRidge([
    [-110, 0], [-95, 10], [-85, 6], [-70, 17], [-57, 8], [-43, 14], [-30, 8], [-18, 18],
    [-6, 10], [7, 16], [22, 7], [34, 17], [48, 9], [62, 15], [74, 6], [90, 12], [110, 0],
  ], -74, 0x0c1b24));

  // cloud bands
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({
      map: softCloud, color: 0x445c72, transparent: true, opacity: 0.13 + rnd() * 0.08,
      depthWrite: false, fog: false, blending: THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(-70 + rnd() * 140, 17 + rnd() * 18, -63 - rnd() * 20);
    s.scale.set(50 + rnd() * 40, 18 + rnd() * 10, 1);
    scene.add(s);
  }

  /* ---------------------------------------------------------------- */
  /* ground, banks, river, rocks, reeds                               */
  /* ---------------------------------------------------------------- */

  const groundGeo = new THREE.PlaneGeometry(190, 150, 72, 56);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = Math.max(0, Math.abs(x) - 28) + Math.max(0, Math.abs(z + 3) - 24);
      const n = Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.1) * Math.cos(z * 0.13 - x * 0.05);
      pos.setY(i, -0.34 + n * 0.13 + Math.min(1, d * 0.008) * n * 0.5);
    }
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, matEarth);
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  root.add(ground);

  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-40, 0.03, -9),
    new THREE.Vector3(-28, 0.03, -4),
    new THREE.Vector3(-18, 0.03, -1.1),
    new THREE.Vector3(-8, 0.03, 0.4),
    new THREE.Vector3(2, 0.03, 1.7),
    new THREE.Vector3(11, 0.03, 1.2),
    new THREE.Vector3(19, 0.03, -1.5),
    new THREE.Vector3(29, 0.03, -6.5),
    new THREE.Vector3(42, 0.03, -13),
  ]);

  const bankMat = new THREE.MeshStandardMaterial({ color: 0x202720, roughness: 1, metalness: 0 });
  const bank = new THREE.Mesh(ribbonGeometry(riverCurve, (t) => 8.4 + Math.sin(t * Math.PI * 3) * 0.8, 120, 0.02), bankMat);
  bank.position.y = 0.045;
  bank.receiveShadow = true;
  root.add(bank);

  const waterUniforms = {
    uTime: { value: 0 },
    uFog: { value: new THREE.Color(0x0a141c) },
    uFogDensity: { value: 0.0085 },
    uMoonBoost: { value: 1 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFog;
      uniform float uFogDensity;
      uniform float uMoonBoost;
      varying vec2 vUv;
      varying float vDepth;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        vec2 uv = vUv;
        float w1 = sin(uv.y * 44.0 - uTime * 1.15 + sin(uv.x * 8.0) * 1.4);
        float w2 = sin(uv.y * 71.0 + uTime * 0.7 - uv.x * 12.0);
        float w3 = sin(uv.y * 138.0 - uTime * 1.8 + noise(uv * vec2(6.0, 16.0)) * 4.0);
        float ripple = w1 * 0.42 + w2 * 0.34 + w3 * 0.24;
        float shimmer = smoothstep(0.48, 0.98, ripple * 0.5 + 0.5);
        float edge = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.84, uv.x);

        vec3 deep = vec3(0.004, 0.016, 0.028);
        vec3 shallow = vec3(0.018, 0.062, 0.082);
        vec3 col = mix(deep, shallow, ripple * 0.42 + 0.42);
        col += vec3(0.05, 0.11, 0.16) * shimmer * 0.34;

        float moonBand = exp(-pow((uv.y - 0.34) * 3.8, 2.0));
        float glint = pow(max(0.0, sin(uv.y * 55.0 - uTime * 0.85 + sin(uv.y * 8.0) * 2.0)), 12.0);
        col += vec3(0.30, 0.45, 0.62) * moonBand * (0.18 + glint * 0.6) * uMoonBoost;
        float moonPath = exp(-pow((uv.x - 0.5) * 5.2, 2.0));
        col += vec3(0.26, 0.39, 0.54) * moonPath * glint * 0.28 * uMoonBoost;
        col += vec3(0.34, 0.48, 0.6) * pow(max(0.0, w3), 20.0) * edge * 0.18;

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFog, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, edge * 0.97);
      }
    `,
  });
  const river = new THREE.Mesh(
    ribbonGeometry(riverCurve, (t) => 6.5 + Math.sin(t * Math.PI * 2.2) * 1.5, 180, 0.055),
    waterMat
  );
  river.receiveShadow = true;
  root.add(river);

  // dark stone waterlines give the river a readable edge
  {
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x26332b, roughness: 0.98, metalness: 0.0 });
    for (const side of [-1, 1]) {
      const pts = [];
      const samples = 64;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const p = riverCurve.getPointAt(t);
        const tan = riverCurve.getTangentAt(t);
        const off = (3.15 + Math.sin(t * Math.PI * 2.2) * 0.72) * side;
        pts.push(new THREE.Vector3(p.x - tan.z * off, 0.075, p.z + tan.x * off));
      }
      const edgeCurve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 90, 0.16, 5, false), edgeMat);
      tube.receiveShadow = true;
      root.add(tube);
    }
  }

  // warm pools of lantern light on the water near the bridge
  const waterGlows = [];
  function waterGlow(x, z, sx, sz, color, opacity, phase) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sz),
      new THREE.MeshBasicMaterial({ map: radial, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.075, z);
    m.renderOrder = 2;
    root.add(m);
    waterGlows.push({ mesh: m, base: opacity, phase });
  }
  waterGlow(12.4, 3.4, 1.7, 4.4, 0xff9a54, 0.16, 0.7);
  waterGlow(12.4, -1.4, 1.7, 4.0, 0xff9a54, 0.14, 2.3);
  waterGlow(9.4, 0.6, 1.2, 2.6, 0xffb36c, 0.08, 4.1);
  // stretched silver path on the river, as if the hidden moon is already looking down
  waterGlow(-9.2, 1.2, 2.6, 11.5, 0x9fc5ea, 0.085, 1.4);
  root.userData.waterGlows = waterGlows;

  // soft rings around the boat make the river read as water
  const boatRipples = [];
  const rippleGeo = new THREE.RingGeometry(0.84, 1.0, 48);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(
      rippleGeo,
      new THREE.MeshBasicMaterial({ color: 0xa9c8e4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.092;
    m.renderOrder = 2;
    m.visible = false;
    root.add(m);
    boatRipples.push({ mesh: m, age: 0, maxAge: 2.8, active: false });
  }
  root.userData.boatRipples = boatRipples;

  // a deeper, darker riverbed
  const bed = new THREE.Mesh(ribbonGeometry(riverCurve, (t) => 7.4 + Math.sin(t * Math.PI * 2.2) * 1.5, 120, 0.005), new THREE.MeshStandardMaterial({ color: 0x0a1114, roughness: 1 }));
  bed.position.y = -0.04;
  root.add(bed);

  // rocks
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4d5b62, roughness: 0.92, metalness: 0.02, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 86);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 86; i++) {
      let x;
      let z;
      if (i < 46) {
        const t = rnd();
        const p = riverCurve.getPointAt(t);
        const tan = riverCurve.getTangentAt(t);
        const side = rnd() > 0.5 ? 1 : -1;
        const off = 4.0 + rnd() * 2.4;
        x = p.x - tan.z * off * side;
        z = p.z + tan.x * off * side;
      } else {
        x = (rnd() - 0.5) * 70;
        z = -18 + rnd() * 42;
        if (Math.abs(x) < 18 && z > -3 && z < 11) {
          x += x > 0 ? 17 : -17;
        }
      }
      dummy.position.set(x, -0.06 + rnd() * 0.22, z);
      dummy.rotation.set(rnd() * 0.7, rnd() * 6.28, rnd() * 0.5);
      dummy.scale.set(0.14 + Math.pow(rnd(), 2) * 1.55, 0.12 + Math.pow(rnd(), 2) * 0.9, 0.15 + Math.pow(rnd(), 2) * 1.2);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    root.add(rocks);
  }

  // reeds on the banks
  {
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.035, 1.6, 3);
    reedGeo.translate(0, 0.8, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x3c4c3d, roughness: 1 });
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 260);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 260; i++) {
      const t = rnd();
      const p = riverCurve.getPointAt(t);
      const tan = riverCurve.getTangentAt(t);
      const side = rnd() > 0.5 ? 1 : -1;
      const off = 3.8 + rnd() * 1.8;
      dummy.position.set(p.x - tan.z * off * side, 0, p.z + tan.x * off * side);
      dummy.rotation.set((rnd() - 0.5) * 0.18, rnd() * 6.28, (rnd() - 0.5) * 0.22);
      const h = 0.45 + rnd() * 1.25;
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      reeds.setMatrixAt(i, dummy.matrix);
    }
    reeds.instanceMatrix.needsUpdate = true;
    root.add(reeds);
  }

  // stone path
  const pathPoints = [
    new THREE.Vector3(-11.5, 0.02, 9.0),
    new THREE.Vector3(-6.6, 0.02, 12.6),
    new THREE.Vector3(-0.5, 0.02, 9.4),
    new THREE.Vector3(5.2, 0.02, 7.2),
    new THREE.Vector3(10.8, 0.02, 6.5),
  ];
  const pathCurve = new THREE.CatmullRomCurve3(pathPoints);
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const p = pathCurve.getPointAt(t);
    const tan = pathCurve.getTangentAt(t);
    const slab = box(0.9 + rnd() * 0.55, 0.09, 0.5 + rnd() * 0.35, matStone, p.x, 0.055, p.z);
    slab.castShadow = false;
    slab.rotation.y = Math.atan2(tan.x, tan.z) + (rnd() - 0.5) * 0.4;
    slab.rotation.z = (rnd() - 0.5) * 0.05;
    root.add(slab);
  }

  /* ---------------------------------------------------------------- */
  /* model loading                                                    */
  /* ---------------------------------------------------------------- */

  let loaded = 0;
  const totalAssets = 5;
  const manager = new THREE.LoadingManager();
  manager.onProgress = () => {};
  const loader = new GLTFLoader(manager);
  const names = ["shan", "shui", "huo", "mu", "yue"];
  const gltfs = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        gltfs[name] = await loader.loadAsync(glbUrl(name));
      } catch (err) {
        console.warn(`model ${name} failed`, err?.message || err);
        gltfs[name] = null;
      } finally {
        loaded++;
        onProgress?.(loaded / totalAssets);
        onNote?.(loaded < totalAssets ? "山把月亮藏了起来" : "夜色已备，铜镜正冷");
      }
    })
  );

  /* ---------------------------------------------------------------- */
  /* mountains                                                        */
  /* ---------------------------------------------------------------- */

  const mountains = [];
  if (gltfs.shan) {
    const m1 = fitModel(gltfs.shan, {
      height: 26, widthScale: 1.15, depthScale: 1.9,
      position: [-24, -0.7, -44], rotate: [0.02, 0.62, -0.02],
      tint: 0x849d93, clearRoughnessMap: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.14, emissive: 0x0a1515, emissiveIntensity: 0.35,
      castShadow: false, receiveShadow: true,
    });
    const m2 = fitModel(gltfs.shan.scene ? gltfs.shan : gltfs.shan, {
      height: 28, widthScale: 1.0, depthScale: 1.7,
      position: [23, -0.7, -48], rotate: [0.03, -0.88, 0.015],
      tint: 0x69827b, clearRoughnessMap: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.14, emissive: 0x071212, emissiveIntensity: 0.3,
      castShadow: false, receiveShadow: true,
    });
    const m3 = fitModel(gltfs.shan, {
      height: 18, widthScale: 1.3, depthScale: 1.3,
      position: [-50, -0.8, -58], rotate: [0.02, 1.25, 0],
      tint: 0x4e6661, clearRoughnessMap: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.14, emissive: 0x061010, emissiveIntensity: 0.25,
      castShadow: false, receiveShadow: false,
    });
    mountains.push(m1, m2, m3);
    m1.renderOrder = 0;
    root.add(m1, m2, m3);
  } else {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(
        new THREE.ConeGeometry(16, 28, 7),
        new THREE.MeshStandardMaterial({ color: 0x263638, roughness: 0.95, flatShading: true })
      );
      g.position.set(-28 + i * 26, 12, -34 - i * 4);
      root.add(g);
      mountains.push(g);
    }
  }

  // Break up the calligraphic models with irregular natural rock forms.
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x344b49, roughness: 1, metalness: 0, flatShading: true,
  });
  for (const [x, y, z, sx, sy, sz, angle] of [
    [-33, 5, -43, 8, 8, 5, 0.3], [-17, 5, -43, 7, 10, 5, -0.4],
    [14, 5, -47, 8, 9, 6, 0.5], [31, 4, -46, 8, 7, 5, -0.3],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMaterial);
    rock.position.set(x, y, z);
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(0.08, angle, angle * 0.18);
    rock.receiveShadow = true;
    root.add(rock);
  }

  // a near dark ridge guarantees the moon stays hidden until the finale
  const blocker = makeRidge([
    [-66, 2], [-58, 5], [-50, 3.4], [-42, 7], [-34, 4.2], [-27, 8], [-21, 5.2], [-15, 8],
    [-9, 4.4], [-3, 7], [3, 4], [9, 6], [16, 3.2], [23, 6], [31, 2.4], [39, 5], [48, 2], [58, 4], [68, 1],
  ], -53, 0x0d1c22);
  root.add(blocker);

  // near-hill framing masses
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x35443d, roughness: 1, metalness: 0, flatShading: true });
  for (const [x, z, sx, sy, sz] of [
    [-32, -12, 9, 5, 7], [-37, 6, 8, 4, 8], [34, -16, 12, 6, 9], [37, 8, 9, 3.5, 7], [-27, -24, 11, 7, 8], [30, -27, 10, 8, 8],
  ]) {
    const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), hillMat);
    hill.position.set(x, -1.4, z);
    hill.scale.set(sx, sy, sz);
    hill.rotation.set(rnd(), rnd() * 6, rnd() * 0.3);
    hill.castShadow = false;
    hill.receiveShadow = true;
    root.add(hill);
  }

  /* ---------------------------------------------------------------- */
  /* moon                                                             */
  /* ---------------------------------------------------------------- */

  const moonGroup = new THREE.Group();
  const moonStart = new THREE.Vector3(-14.0, 3.2, -60);
  const moonEnd = new THREE.Vector3(-12.0, 30.5, -62);
  moonGroup.position.copy(moonStart);
  scene.add(moonGroup);

  const haloTex = makeRadialTexture(256, [
    [0, "rgba(255,255,255,0.9)"],
    [0.12, "rgba(217,235,255,0.5)"],
    [0.4, "rgba(160,198,245,0.13)"],
    [0.72, "rgba(110,150,205,0.035)"],
    [1, "rgba(60,100,160,0)"],
  ]);
  const haloBig = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0x92b7e8, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  haloBig.scale.set(44, 44, 1);
  const haloMid = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0xc4dcfa, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  haloMid.scale.set(20, 20, 1);
  const haloCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0xe8f2ff, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  haloCore.scale.set(9, 9, 1);
  const moonHot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  moonHot.scale.set(7.2, 7.2, 1);
  moonGroup.add(haloBig, haloMid, haloCore, moonHot);
  moonGroup.userData.moonHot = moonHot;

  // A softly lit crescent reads as moonlight before it reads as a symbol.
  // Two curved edges meet at tapered tips.
  const crescent = new THREE.Shape();
  crescent.moveTo(-1.7, 5.0);
  crescent.bezierCurveTo(4.8, 5.2, 5.8, -3.6, -1.7, -5.0);
  crescent.bezierCurveTo(1.2, -2.5, 1.5, 2.5, -1.7, 5.0);
  const moonMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(crescent, 48),
    new THREE.MeshBasicMaterial({ color: 0xd8e5ee, side: THREE.DoubleSide })
  );
  moonGroup.add(moonMesh);

  // small fixed star sparkles around the moon group (drift with it)
  const moonDust = new GlowPoints(scene, 36, { size: 1.9, color: 0xbcd8ff, drift: 0 });
  moonDust.setPositions((i) => {
    const a = rnd() * Math.PI * 2;
    const r = 5 + rnd() * 9;
    return {
      x: Math.cos(a) * r, y: (rnd() - 0.5) * 9, z: -4 + rnd() * 5, alpha: 0.08 + rnd() * 0.16,
    };
  });
  moonGroup.add(moonDust.points);
  root.userData.moonDust = moonDust;

  /* ---------------------------------------------------------------- */
  /* trees                                                            */
  /* ---------------------------------------------------------------- */

  const trees = [];
  if (gltfs.mu) {
    const spots = [
      { h: 9.5, p: [-22.5, 0, 3.5], r: [0, 0.85, 0.015], tint: 0xa0aa80 },
      { h: 7.2, p: [21.5, 0, 3.2], r: [0, -0.65, -0.02], tint: 0x87977a },
      { h: 11, p: [27, 0, -22], r: [0, 0.5, 0.03], tint: 0x738575 },
      { h: 6.4, p: [-29, 0, -16], r: [0, -1.1, 0], tint: 0x697c65 },
    ];
    for (const s of spots) {
      const t = fitModel(gltfs.mu, {
        height: s.h, widthScale: 0.95, depthScale: 0.75,
        position: s.p, rotate: s.r,
        tint: s.tint, roughness: 0.82, metalness: 0.01, envMapIntensity: 0.3,
        castShadow: false, receiveShadow: true,
      });
      const foliage = new THREE.MeshStandardMaterial({ color: s.tint, roughness: 1, flatShading: true });
      for (const [x, y, z, size] of [[-0.34, 0.73, 0.05, 0.17], [0.28, 0.83, -0.06, 0.16], [0.03, 0.96, 0.03, 0.14]]) {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), foliage);
        leaves.position.set(s.p[0] + x * s.h, y * s.h, s.p[2] + z * s.h);
        leaves.scale.set(size * s.h * 1.35, size * s.h * 0.62, size * s.h);
        leaves.rotation.y = s.r[1];
        root.add(leaves);
      }
      root.add(t);
      trees.push(t);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 7, 5), matDarkWood);
      g.position.set(-22 + i * 22, 3.5, -3);
      root.add(g);
      trees.push(g);
    }
  }

  /* ---------------------------------------------------------------- */
  /* water spirit (shui)                                              */
  /* ---------------------------------------------------------------- */

  const waterSpiritPos = new THREE.Vector3(-25.5, 0.28, -3.2);
  if (gltfs.shui) {
    const ws = fitModel(gltfs.shui, {
      height: 7.4, widthScale: 1.28, depthScale: 0.9,
      position: [waterSpiritPos.x, 0.3, waterSpiritPos.z],
      rotate: [-1.16, 0.55, 0.06],
      tint: 0x8fb9d8, roughness: 0.18, metalness: 0.24,
      emissive: 0x1d4b7d, emissiveIntensity: 0.75, emissiveFromMap: true,
      opacity: 0.94, envMapIntensity: 1.5,
      castShadow: false, receiveShadow: true,
    });
    ws.userData.phase = rnd() * 6;
    root.add(ws);
    root.userData.waterSpirit = ws;

    const waterGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radial, color: 0x5f97c9, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    waterGlow.position.set(waterSpiritPos.x, 2.4, waterSpiritPos.z);
    waterGlow.scale.set(14, 9, 1);
    root.add(waterGlow);
    root.userData.waterGlow = waterGlow;

    const blueLight = new THREE.PointLight(0x5f9ed4, 20, 20, 2);
    blueLight.position.set(waterSpiritPos.x, 2.1, waterSpiritPos.z);
    root.add(blueLight);
    root.userData.blueLight = blueLight;
  }

  // low mist along the river
  const mists = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: softCloud, color: 0x8098ad, transparent: true,
      opacity: 0.018 + rnd() * 0.034, depthWrite: false, fog: true, blending: THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    const t = rnd();
    const p = riverCurve.getPointAt(t);
    s.position.set(p.x + (rnd() - 0.5) * 10, 0.8 + rnd() * 3.4, p.z + (rnd() - 0.5) * 8);
    s.scale.set(12 + rnd() * 14, 4 + rnd() * 6, 1);
    s.userData.baseX = s.position.x;
    s.userData.speed = 0.06 + rnd() * 0.11;
    s.userData.phase = rnd() * 10;
    root.add(s);
    mists.push(s);
  }

  /* ---------------------------------------------------------------- */
  /* targets: three houses and their windows                          */
  /* ---------------------------------------------------------------- */

  const targets = [];

  function buildWindow(parent, opts) {
    const g = new THREE.Group();
    g.position.set(opts.x, opts.y, opts.z);
    parent.add(g);
    const w = opts.w;
    const h = opts.h;
    const glowTex = radial;

    const well = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.04, h * 1.04), new THREE.MeshStandardMaterial({ color: 0x0a0907, roughness: 1 }));
    well.position.z = 0.026;
    g.add(well);

    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb46a).multiplyScalar(0.028) });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat);
    glow.position.z = 0.045;
    g.add(glow);

    // warm paper texture lines inside the window
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x2b1a0b, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.95, 0.015), innerMat);
      line.position.set(0, -h * 0.18 + i * h * 0.36, 0.05);
      g.add(line);
    }

    // silhouette of a person, facing out
    const charMat = matChar.clone();
    const sil = new THREE.Group();
    sil.position.set(opts.personX ?? 0, 0.1, 0.08);
    const bodyH = h * 0.44;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.115, bodyH, 4, 10), charMat);
    body.position.y = -h * 0.13;
    const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.095, 16, 12), charMat);
    head.position.y = -h * 0.13 + bodyH * 0.5 + w * 0.1;
    const bun = new THREE.Mesh(new THREE.SphereGeometry(w * 0.037, 10, 8), charMat);
    bun.position.set(0, head.position.y + w * 0.083, -0.015);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.032, bodyH * 0.42, 3, 8), charMat);
    arm.position.set(w * 0.12, -h * 0.1, 0.012);
    arm.rotation.z = 0.24;
    sil.add(body, head, bun, arm);
    sil.scale.setScalar(1);
    sil.visible = false;
    g.add(sil);
    const personMaterials = [charMat];

    // frame
    const frameMat = matDarkWood;
    const fw = w + 0.22;
    const fh = h + 0.22;
    g.add(box(fw, 0.1, 0.14, frameMat, 0, h / 2 + 0.03, 0.08));
    g.add(box(fw, 0.12, 0.16, frameMat, 0, -h / 2 - 0.03, 0.08));
    g.add(box(0.1, fh, 0.14, frameMat, -w / 2 - 0.06, 0, 0.08));
    g.add(box(0.1, fh, 0.14, frameMat, w / 2 + 0.06, 0, 0.08));
    const latticeMat = matDarkWood;
    for (let i = -1; i <= 1; i++) {
      const bar = box(0.025, h, 0.05, latticeMat, i * w * 0.27, 0, 0.095);
      bar.castShadow = false;
      g.add(bar);
    }
    for (let i = -1; i <= 1; i++) {
      const bar = box(w, 0.024, 0.05, latticeMat, 0, i * h * 0.26, 0.095);
      bar.castShadow = false;
      g.add(bar);
    }
    // little eave over the window
    const eave = box(w + 0.7, 0.08, 0.4, matRoof, 0, h / 2 + 0.22, 0.16);
    eave.rotation.x = -0.18;
    g.add(eave);

    const light = new THREE.PointLight(0xffa75f, 0, 9, 2);
    light.position.set(0, 0.1, 1.15);
    g.add(light);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffb76b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.set(0, 0, 0.4);
    halo.scale.set(5.6, 5.6, 1);
    g.add(halo);

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd7a2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    flash.position.set(0, 0, 0.5);
    flash.scale.set(1, 1, 1);
    g.add(flash);

    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTex, color: 0xd1e4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    marker.position.set(0, h * 0.5 + 0.48, 0.35);
    marker.scale.set(1.2, 1.2, 1);
    g.add(marker);

    const proxy = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2.0, h * 2.0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
    );
    proxy.position.z = 0.6;
    g.add(proxy);

    const win = {
      group: g,
      glowMat,
      light,
      halo,
      flash,
      marker,
      silhouette: sil,
      personMaterials,
      lit: false,
      litAmount: 0,
      flashAge: 99,
      active: false,
      center: new V3(),
      proxy,
    };
    proxy.userData.interact = { type: "window", target: win };
    interactives.push(proxy);
    return win;
  }

  function buildHouse({ x, z, rot = 0, w = 6.4, d = 4.8, h = 4.4, roofH = 2.2, windowPos, windowScale = 1, personX = 0, tint = 0x999a92, shrine = false }) {
    const house = new THREE.Group();
    house.position.set(x, shrine ? 8.0 : 0, z);
    house.rotation.y = rot;
    root.add(house);

    const wallMat = matPlaster.clone();
    wallMat.color = new THREE.Color(tint);
    const base = box(w * 1.1, 0.5, d * 1.1, matStone, 0, 0.25, 0);
    house.add(base);
    const walls = box(w, h, d, wallMat, 0, h / 2 + 0.4, 0);
    house.add(walls);

    // timber details
    const t = 0.1;
    house.add(box(t, h, t, matDarkWood, -w / 2 + 0.08, h / 2 + 0.4, d / 2 + 0.01));
    house.add(box(t, h, t, matDarkWood, w / 2 - 0.08, h / 2 + 0.4, d / 2 + 0.01));
    house.add(box(w + 0.15, 0.1, t, matDarkWood, 0, h + 0.34, d / 2 + 0.03));
    house.add(box(w + 0.15, 0.1, t, matDarkWood, 0, 1.35, d / 2 + 0.03));
    // door
    house.add(box(1.0, 2.1, 0.1, matDarkWood, -w * 0.22, 1.45, d / 2 + 0.04));
    const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.14), new THREE.MeshBasicMaterial({ color: 0x2a1a0c }));
    doorLight.position.set(-w * 0.22, 2.2, d / 2 + 0.1);
    house.add(doorLight);

    // roof
    const ang = Math.atan2(roofH, w / 2);
    const slabW = Math.sqrt((w / 2) ** 2 + roofH ** 2) * 1.05;
    const roofDepth = d * 1.16;
    const r1 = box(slabW, 0.16, roofDepth, matRoof, -w / 4, h + roofH / 2 + 0.4, 0);
    r1.rotation.z = ang;
    const r2 = box(slabW, 0.16, roofDepth, matRoof, w / 4, h + roofH / 2 + 0.4, 0);
    r2.rotation.z = -ang;
    house.add(r1, r2);
    house.add(box(w * 0.12, 0.18, roofDepth + 0.15, matDarkWood, 0, h + roofH + 0.43, 0));
    // upturned eave tips
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), matDarkWood);
        tip.position.set(sx * (w / 2 + 0.16), h + 0.48, sz * (d / 2 + 0.3));
        tip.rotation.z = sx * -0.7;
        tip.rotation.x = sz * -0.35;
        house.add(tip);
      }
    }

    // dangling lantern under eave
    const lampGroup = new THREE.Group();
    lampGroup.position.set(w * 0.35, h + 0.08, d / 2 + 0.36);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), matDarkWood);
    string.position.y = 0.25;
    lampGroup.add(string);
    const lampBody = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), matGlowWarm);
    lampBody.scale.set(0.9, 1.15, 0.9);
    lampGroup.add(lampBody);
    const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa25c, transparent: true, opacity: 0.36, depthWrite: false, blending: THREE.AdditiveBlending }));
    lampGlow.scale.set(1.5, 1.5, 1);
    lampGroup.add(lampGlow);
    house.add(lampGroup);

    const win = buildWindow(house, {
      x: windowPos[0], y: windowPos[1], z: d / 2 + 0.06, w: 1.7 * windowScale, h: 2.1 * windowScale, personX,
    });
    return { house, win };
  }

  const h1 = buildHouse({
    x: -13.0, z: 6.4, rot: 0.1, w: 7.2, d: 5.4, h: 5.6, roofH: 2.3,
    windowPos: [1.25, 4.0], windowScale: 1.1, personX: 0.06, tint: 0xb2b0a2,
  });
  const h2 = buildHouse({
    x: 16.4, z: -8.0, rot: -0.32, w: 6.4, d: 4.6, h: 5.2, roofH: 2.1,
    windowPos: [-1.1, 3.9], windowScale: 1.0, personX: -0.05, tint: 0xa4a69a,
  });

  const shrineCrag = new THREE.Group();
  shrineCrag.position.set(-2.0, 0, -19.4);
  root.add(shrineCrag);
  {
    const cragMat = new THREE.MeshStandardMaterial({ color: 0x485853, roughness: 0.95, metalness: 0.02, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), cragMat);
      r.position.set((rnd() - 0.5) * 6.4, 0.9 + rnd() * 2.8, -0.6 - rnd() * 3.2);
      r.scale.set(2.0 + rnd() * 2.2, 1.8 + rnd() * 2.2, 2.0 + rnd() * 2.1);
      r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      r.castShadow = true;
      r.receiveShadow = true;
      shrineCrag.add(r);
    }
  }
  const h3 = buildHouse({
    x: 0, z: 0.3, rot: 0.05, w: 4.9, d: 3.7, h: 3.2, roofH: 1.9,
    windowPos: [0.1, 2.15], windowScale: 0.82, personX: 0, tint: 0xa0a093, shrine: true,
  });
  h3.house.parent.remove(h3.house);
  h3.house.position.set(-2.0, 6.7, -18.0);
  h3.house.rotation.y = 0.06;
  root.add(h3.house);
  // roof finial + second eave give the shrine a pagoda silhouette
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 5), matDarkBronze);
  finial.position.set(-2.0, 11.3, -18.0);
  finial.castShadow = true;
  root.add(finial);
  const upperEave = box(6.4, 0.14, 4.6, matRoof, -2.0, 9.6, -18.0);
  upperEave.castShadow = true;
  root.add(upperEave);

  // a small basin and steps for the shrine
  const shrineStep = box(5.7, 0.3, 4.4, matStone, -2.0, 6.65, -18.0);
  root.add(shrineStep);
  const shrineBase = box(5.0, 0.35, 3.9, matStone, -2.0, 6.4, -18.0);
  root.add(shrineBase);
  const shrineLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffad68, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  shrineLamp.position.set(-5.6, 10.4, -17.6);
  shrineLamp.scale.set(1.2, 1.2, 1);
  shrineLamp.material.opacity = 0.2;
  root.add(shrineLamp);

  targets.push(h1.win, h2.win, h3.win);
  targets[0].id = "w1";
  targets[0].name = "东窗";
  targets[0].poem = "东窗亮了。有人抬起头。";
  targets[1].id = "w2";
  targets[1].name = "对岸";
  targets[1].poem = "对岸的窗，也认出了月亮。";
  targets[2].id = "w3";
  targets[2].name = "山寺";
  targets[2].poem = "山寺的人，看见了同一轮月。";

  // background village silhouettes
  const hutData = [
    { x: 6.5, z: -15.5, r: -0.3, s: 0.48 },
    { x: -24.5, z: -10.5, r: 0.6, s: 0.65 },
    { x: 24.5, z: -13.5, r: -0.7, s: 0.52 },
    { x: -28.5, z: -3.5, r: 0.9, s: 0.48 },
    { x: 10.5, z: -18.5, r: 0.1, s: 0.42 },
    { x: -16.5, z: -19.5, r: 0.4, s: 0.5 },
  ];
  for (const hd of hutData) {
    const g = new THREE.Group();
    g.position.set(hd.x, 0, hd.z);
    g.rotation.y = hd.r;
    const s = hd.s;
    g.add(box(4.2 * s, 2.6 * s, 3.2 * s, matPlaster, 0, 1.3 * s, 0));
    const ang = Math.atan2(1.2, 2.1);
    const slabW = Math.sqrt(2.1 ** 2 + 1.2 ** 2) * 1.1;
    const r1 = box(slabW * s, 0.1, 3.9 * s, matRoof, -1.05 * s, 2.6 * s + 0.6 * s, 0);
    r1.rotation.z = ang;
    const r2 = box(slabW * s, 0.1, 3.9 * s, matRoof, 1.05 * s, 2.6 * s + 0.6 * s, 0);
    r2.rotation.z = -ang;
    g.add(r1, r2);
    const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * s, 0.62 * s), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa95e).multiplyScalar(0.42) }));
    dot.position.set(0.5 * s, 1.55 * s, 1.62 * s);
    g.add(dot);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa45c, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.copy(dot.position);
    glow.position.z += 0.1;
    glow.scale.set(1.4, 1.4, 1);
    g.add(glow);
    root.add(g);
  }

  /* ---------------------------------------------------------------- */
  /* bridge                                                           */
  /* ---------------------------------------------------------------- */

  const bridge = new THREE.Group();
  bridge.position.set(13.2, 0, 0.2);
  root.add(bridge);
  const deckSegs = 16;
  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.9, -7.5),
    new THREE.Vector3(0, 2.2, 0),
    new THREE.Vector3(0, 0.9, 7.5),
  ]);
  for (let i = 0; i < deckSegs; i++) {
    const t0 = i / deckSegs;
    const t1 = (i + 1) / deckSegs;
    const p0 = bridgeCurve.getPointAt(t0);
    const p1 = bridgeCurve.getPointAt(t1);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1);
    const ang = Math.atan2(p1.y - p0.y, p1.z - p0.z);
    const slab = box(3.4, 0.22, len + 0.06, matStone, mid.x, mid.y, mid.z);
    slab.rotation.x = -ang;
    bridge.add(slab);
    // side stones
    for (const side of [-1, 1]) {
      const sideStone = box(0.48, 0.5, len + 0.08, matDarkStone, side * 1.66, mid.y - 0.05, mid.z);
      sideStone.rotation.x = -ang;
      bridge.add(sideStone);
    }
  }
  // rails + posts
  for (const side of [-1, 1]) {
    const railCurve = new THREE.CatmullRomCurve3(
      bridgeCurve.points.map((p) => new THREE.Vector3(p.x + side * 1.62, p.y + 1.05, p.z))
    );
    const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 24, 0.055, 5, false), matDarkWood);
    rail.castShadow = true;
    bridge.add(rail);
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const p = bridgeCurve.getPointAt(t);
      const post = box(0.11, 1.15, 0.11, matDarkWood, side * 1.62, p.y + 0.55, p.z);
      bridge.add(post);
      if (i === 1 || i === 6) {
        const lg = new THREE.Group();
        lg.position.set(side * 1.62, p.y + 1.18, p.z);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), matGlowWarm);
        lamp.scale.set(0.95, 1.25, 0.95);
        lg.add(lamp);
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa35c, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
        gl.scale.set(1.8, 1.8, 1);
        lg.add(gl);
        bridge.add(lg);
      }
    }
  }
  // bridge ends ramps
  const rampN = box(3.4, 0.18, 2.2, matStone, 0, 0.5, 8.2);
  rampN.rotation.x = -0.23;
  const rampS = box(3.4, 0.18, 2.2, matStone, 0, 0.5, -8.2);
  rampS.rotation.x = 0.23;
  bridge.add(rampN, rampS);

  const bridgeLight = new THREE.PointLight(0xff9b51, 11, 16, 2);
  bridgeLight.position.set(13.2, 4.0, 0.2);
  root.add(bridgeLight);
  root.userData.bridgeLight = bridgeLight;


  // floating river lanterns + soft reflections
  const floaters = [];
  const petalMat = new THREE.MeshStandardMaterial({ color: 0x7c5c42, roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const u0 = 0.2 + i * 0.14 + rnd() * 0.025;
    const p = riverCurve.getPointAt(u0);
    const g = new THREE.Group();
    g.position.set(p.x, 0.12, p.z);
    root.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.31, 0.09, 12), matDarkWood);
    base.position.y = 0.02;
    g.add(base);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), petalMat);
      petal.scale.set(1.5, 0.25, 0.7);
      petal.position.set(Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2);
      petal.rotation.y = -a;
      g.add(petal);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), matGlowWarm);
    lamp.position.y = 0.22;
    lamp.scale.set(0.9, 1.25, 0.9);
    g.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xff9e58, transparent: true, opacity: 0.46, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.26;
    glow.scale.set(1.8, 1.8, 1);
    g.add(glow);
    const reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 3.2),
      new THREE.MeshBasicMaterial({ map: radial, color: 0xff9b56, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.y = -0.02;
    reflection.renderOrder = 2;
    g.add(reflection);
    floaters.push({ group: g, glow, reflection, u: u0, phase: rnd() * Math.PI * 2 });
  }
  root.userData.floaters = floaters;

  /* ---------------------------------------------------------------- */
  /* braziers + fire models                                           */
  /* ---------------------------------------------------------------- */

  const braziers = [];
  const brazierSpots = [
    [-11.4, 9.8, 0.58],
    [12.9, 5.6, 0.52],
  ];
  for (const [x, z, s] of brazierSpots) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.75, 8), matDarkBronze);
    stand.position.y = 0.38;
    stand.castShadow = true;
    g.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.34, 12, 1, true), matDarkBronze);
    bowl.position.y = 0.82;
    bowl.castShadow = true;
    g.add(bowl);
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), new THREE.MeshBasicMaterial({ color: 0xff5a1e }));
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = 0.86;
    g.add(coals);
    let flame = null;
    if (gltfs.huo) {
      flame = fitModel(gltfs.huo, {
        height: 1.6 * s, widthScale: 1.0, depthScale: 1.0,
        position: [0, 0.78, 0], rotate: [0, rnd() * Math.PI * 2, 0.04],
        tint: 0xffc08a, roughness: 0.4, metalness: 0.0,
        emissive: 0xff5c1b, emissiveIntensity: 2.1, emissiveFromMap: true,
        castShadow: false, receiveShadow: false, envMapIntensity: 0.3,
      });
      g.add(flame);
    } else {
      flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 6), matGlowWarm);
      flame.position.y = 1.35;
      g.add(flame);
    }
    const light = new THREE.PointLight(0xff8438, 18 * s, 10, 2);
    light.position.y = 1.7;
    g.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xff8d48, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 1.35;
    glow.scale.set(4.2, 4.2, 1);
    g.add(glow);
    braziers.push({ group: g, flame, light, glow, baseY: 1.7, phase: rnd() * 10 });
  }

  // small lanterns hanging from trees / eaves (visual sparkle only)
  const lanterns = [];
  for (let i = 0; i < 8; i++) {
    const pt = new THREE.Vector3((rnd() - 0.5) * 42, 2.8 + rnd() * 4.2, -13 + rnd() * 23);
    if (pt.distanceTo(new THREE.Vector3(0, 4, 2)) > 35) continue;
    const mat = new THREE.SpriteMaterial({ map: radial, color: 0xff9d57, transparent: true, opacity: 0.1 + rnd() * 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.position.copy(pt);
    s.scale.setScalar(0.3 + rnd() * 0.35);
    root.add(s);
    lanterns.push({ sprite: s, base: s.material.opacity, phase: rnd() * 10 });
  }

  /* ---------------------------------------------------------------- */
  /* plaza, mirror A, mirror C                                        */
  /* ---------------------------------------------------------------- */

  function pedestal(x, z, height = 4.3) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.55, 0.32, 40), matDarkStone);
    tier1.position.y = 0.16;
    tier1.receiveShadow = true;
    tier1.castShadow = true;
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.95, 0.26, 40), matStone);
    tier2.position.y = 0.45;
    tier2.receiveShadow = true;
    tier2.castShadow = true;
    g.add(tier1, tier2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.022, 8, 64), new THREE.MeshBasicMaterial({ color: 0x8aa9c7, transparent: true, opacity: 0.24 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.645;
    g.add(ring);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, height - 0.6, 12), matDarkBronze);
    post.position.y = 0.6 + (height - 0.6) / 2;
    post.castShadow = true;
    g.add(post);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 8), matDarkBronze);
    brace.position.set(0.42, height - 1.15, -0.2);
    brace.rotation.z = 0.35;
    brace.castShadow = true;
    g.add(brace);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.18, 12), matBronze);
    cap.position.y = height - 0.52;
    g.add(cap);
    return g;
  }

  function createMirror({ x, z, height, radius, pedestalHeight = height, stand = true, label, onBoat = false }) {
    const rootGroup = new THREE.Group();
    rootGroup.position.set(x, 0, z);
    if (stand) {
      pedestal(x, z, pedestalHeight);
      // remove standalone pedestal and reattach for organization
      const p = root.children[root.children.length - 1];
      root.remove(p);
      p.position.set(0, 0, 0);
      rootGroup.add(p);
    }
    if (onBoat) {
      rootGroup.position.set(0, 0, 0);
    }
    const yawGroup = new THREE.Group();
    yawGroup.position.y = height;
    rootGroup.add(yawGroup);

    const frame = new THREE.Group();
    frame.rotation.x = -0.22;
    yawGroup.add(frame);

    const back = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.13, 56), matDarkBronze);
    back.rotation.x = Math.PI / 2;
    frame.add(back);
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.93, 56), matMirror);
    face.position.z = 0.071;
    frame.add(face);
    const backMat = matBronze.clone();
    backMat.color = new THREE.Color(0x9b7b49);
    backMat.roughness = 0.24;
    backMat.metalness = 1;
    backMat.envMapIntensity = 1.8;
    const backFace = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.93, 56), backMat);
    backFace.position.z = -0.071;
    backFace.rotation.y = Math.PI;
    frame.add(backFace);
    for (const rr of [0.72, 0.5, 0.27]) {
      const ringBack = new THREE.Mesh(new THREE.TorusGeometry(radius * rr, 0.012, 6, 48), matBronze);
      ringBack.position.z = -0.086;
      frame.add(ringBack);
    }
    const boss = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.09, 16, 12), matBronze);
    boss.position.z = -0.11;
    boss.scale.z = 0.6;
    frame.add(boss);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.028, 8, 6), matDarkBronze);
      petal.position.set(Math.cos(a) * radius * 0.84, Math.sin(a) * radius * 0.84, -0.088);
      frame.add(petal);
    }
    const rimMat = matBronze.clone();
    rimMat.emissive = new THREE.Color(0x1a1106);
    rimMat.emissiveIntensity = 0.12;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 10, 64), rimMat);
    rim.position.z = 0.055;
    frame.add(rim);
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, 0.018, 8, 64), matDarkBronze);
    innerRim.position.z = 0.086;
    frame.add(innerRim);
    // radial studs
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), matBronze);
      stud.position.set(Math.cos(a) * radius * 0.95, Math.sin(a) * radius * 0.95, 0.075);
      frame.add(stud);
    }
    // a pale glaze arc on the mirror face to read as polished metal
    const sheen = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.52, radius * 0.7, 36, 1, Math.PI * 0.75, Math.PI * 0.55),
      new THREE.MeshBasicMaterial({ color: 0xa9c6e6, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    sheen.position.z = 0.074;
    frame.add(sheen);

    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xd1e4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    marker.position.y = height + radius + 0.62;
    marker.scale.set(0.82, 0.82, 1);
    rootGroup.add(marker);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, 0.014, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0xb6d4f3, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.position.y = radius * 0.02;
    frame.add(ring);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.9, 12, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
    );
    hit.position.y = height;
    rootGroup.add(hit);

    const mirror = {
      id: label,
      root: rootGroup,
      yaw: yawGroup,
      frame,
      marker,
      ring,
      face,
      rim,
      height,
      radius,
      active: false,
      yawAngle: 0,
      targetYaw: 0,
      angularVel: 0,
      onBoat,
      baseWorldY: height,
    };
    hit.userData.interact = { type: "mirror", mirror };
    interactives.push(hit);
    root.add(rootGroup);
    return mirror;
  }

  const mirrorA = createMirror({
    x: -6.6, z: 12.6, height: 4.8, radius: 1.36, pedestalHeight: 4.55, label: "a",
  });
  mirrorA.yawAngle = 100 * DEG;
  mirrorA.targetYaw = mirrorA.yawAngle;
  mirrorA.yaw.rotation.y = mirrorA.yawAngle;

  const mirrorC = createMirror({
    x: 11.8, z: -5.4, height: 5.9, radius: 1.06, pedestalHeight: 5.55, label: "c",
  });
  mirrorC.yawAngle = 92 * DEG;
  mirrorC.targetYaw = mirrorC.yawAngle;
  mirrorC.yaw.rotation.y = mirrorC.yawAngle;
  // C pedestal is a taller stone tower; add some stone masonry around it
  {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 5.6, 8), matDarkStone);
    tower.position.set(11.8, 2.7, -5.4);
    tower.castShadow = true;
    tower.receiveShadow = true;
    root.add(tower);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 8), matStone);
    cap.position.set(11.8, 5.5, -5.4);
    root.add(cap);
  }

  /* ---------------------------------------------------------------- */
  /* boat + mirror B                                                  */
  /* ---------------------------------------------------------------- */

  const boat = new THREE.Group();
  boat.position.y = 0.03;
  root.add(boat);
  const boatVisual = new THREE.Group();
  boat.add(boatVisual);

  {
    const shape = new THREE.Shape();
    shape.moveTo(0, 2.35);
    shape.bezierCurveTo(0.48, 1.75, 0.78, 0.8, 0.8, 0.1);
    shape.bezierCurveTo(0.82, -0.9, 0.5, -1.65, 0, -2.1);
    shape.bezierCurveTo(-0.5, -1.65, -0.82, -0.9, -0.8, 0.1);
    shape.bezierCurveTo(-0.78, 0.8, -0.48, 1.75, 0, 2.35);
    const hullGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.62, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.09, bevelSegments: 2, curveSegments: 18,
    });
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, matDarkWood);
    hull.position.y = 0.68;
    hull.castShadow = true;
    hull.receiveShadow = true;
    boatVisual.add(hull);

    const deck = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.9), new THREE.MeshStandardMaterial({ color: 0x2d2821, roughness: 0.9 }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.7;
    boatVisual.add(deck);

    // gunwale
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.74, 0.8, 1.55),
        new THREE.Vector3(side * 0.82, 0.78, 0.2),
        new THREE.Vector3(side * 0.64, 0.76, -1.35),
        new THREE.Vector3(0, 0.78, -2.05),
      ]);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 5, false), matBronze);
      rail.castShadow = true;
      boatVisual.add(rail);
    }

    // canopy / little stern lantern
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 2.0, 8), matDarkWood);
    mast.position.set(0, 1.68, -0.4);
    mast.castShadow = true;
    boatVisual.add(mast);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), matGlowWarm);
    lantern.scale.set(0.9, 1.2, 0.9);
    lantern.position.set(0, 2.7, -0.4);
    boatVisual.add(lantern);
    const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa760, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    lampGlow.position.copy(lantern.position);
    lampGlow.scale.set(2.1, 2.1, 1);
    boatVisual.add(lampGlow);

    // wake / reflection glow
    const wake = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0x6c9cc4, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    wake.rotation.x = -Math.PI / 2;
    wake.scale.set(5, 8, 1);
    wake.position.set(0, 0.09, 0);
    boatVisual.add(wake);
  }

  const mirrorB = createMirror({
    x: 0, z: 0, height: 2.62, radius: 0.94, pedestalHeight: 2.2, label: "b", stand: false, onBoat: true,
  });
  mirrorB.root.position.set(0, 0.66, 0.55);
  // a slender bronze post holding the boat mirror
  const bMount = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, 2.3, 10), matDarkBronze);
  bMount.position.y = 1.15;
  bMount.castShadow = true;
  mirrorB.root.add(bMount);
  const bCross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 8), matDarkBronze);
  bCross.rotation.z = Math.PI / 2;
  bCross.position.y = 2.3;
  mirrorB.root.add(bCross);
  boatVisual.add(mirrorB.root);
  mirrorB.yawAngle = 0.2;
  mirrorB.targetYaw = mirrorB.yawAngle;
  mirrorB.yaw.rotation.y = mirrorB.yawAngle;

  const boatHit = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 1.1, 5.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
  );
  boatHit.position.y = 0.42;
  boatVisual.add(boatHit);
  boatHit.userData.interact = { type: "boat" };
  interactives.push(boatHit);

  const dockMarkers = [];
  const boatDockPoints = ANCHORS.dockU.map((u) => {
    const p = riverCurve.getPointAt(u);
    return new THREE.Vector3(p.x, 0.06, p.z);
  });
  for (let i = 0; i < boatDockPoints.length; i++) {
    const p = boatDockPoints[i];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.025, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0xb9d8f6, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.09, p.z);
    root.add(ring);
    const buoyGroup = new THREE.Group();
    buoyGroup.position.set(p.x, 0, p.z);
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), matDarkWood);
    buoy.position.y = 0.36;
    buoyGroup.add(buoy);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), matGlowWarm);
    cap.position.y = 0.72;
    buoyGroup.add(cap);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa25a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
    gl.position.y = 0.76;
    gl.scale.set(1.15, 1.15, 1);
    buoyGroup.add(gl);
    root.add(buoyGroup);
    dockMarkers.push({ ring, buoy: buoyGroup, glow: gl, active: i === 0 });
  }

  function setYaw(mirror, angle) {
    mirror.targetYaw = angle;
    mirror.yawAngle = angle;
    mirror.yaw.rotation.y = angle;
    mirror.angularVel = 0;
  }

  function setTargetYaw(mirror, angle) {
    mirror.targetYaw = angle;
  }

  /* ---------------------------------------------------------------- */
  /* beams, memory paths, sparkles                                   */
  /* ---------------------------------------------------------------- */

  // the moon's light leaks through a crack in the ridge
  const riftGroup = new THREE.Group();
  riftGroup.position.copy(ANCHORS.source);
  root.add(riftGroup);
  const riftHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radial, color: 0x8eb9e8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  riftHalo.scale.set(28, 34, 1);
  const riftCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radial, color: 0xd7e9ff, transparent: true, opacity: 0.46, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  riftCore.scale.set(2.9, 10.5, 1);
  riftGroup.add(riftHalo, riftCore);
  root.userData.rift = { group: riftGroup, halo: riftHalo, core: riftCore };

  const sourceBeam = new Beam(scene, { color: 0xa9c9ec, width: 0.78, strength: 0.52, segments: 52 });
  sourceBeam.setStrength(0.52);
  const beamA = new Beam(scene, { color: 0xbcd6f2, width: 0.58, strength: 0.4 });
  const beamB = new Beam(scene, { color: 0xb6d0ec, width: 0.52, strength: 0.4 });
  const beamC = new Beam(scene, { color: 0xc0d8f2, width: 0.48, strength: 0.4 });
  const memoryCols = [0xffd7a0, 0xcfe4fb, 0xcfe4fb, 0xc4ddff, 0xc4ddff, 0xffd7a0];
  const memoryBeams = [];
  for (let i = 0; i < 6; i++) {
    const mb = new Beam(scene, { color: memoryCols[i], width: 0.62, strength: 0.2, segments: 44 });
    mb.setStrength(0.001);
    memoryBeams.push(mb);
  }

  const impactA = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xd7e8ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  impactA.scale.set(2.6, 2.6, 1);
  scene.add(impactA);
  const impactB = new THREE.Sprite(impactA.material.clone());
  impactB.scale.copy(impactA.scale);
  const impactC = new THREE.Sprite(impactA.material.clone());
  impactC.scale.copy(impactA.scale);
  scene.add(impactB, impactC);
  const impactOpacities = { a: 0.35, b: 0.05, c: 0.05 };

  // floating dust in the moonbeam
  const beamDust = new GlowPoints(scene, 80, { size: 1.25, color: 0xb7d3f2, drift: 0.45 });
  beamDust.setPositions((i) => {
    const t = rnd();
    const p = new V3(
      THREE.MathUtils.lerp(ANCHORS.source.x, -9.1, t) + (rnd() - 0.5) * 5,
      THREE.MathUtils.lerp(ANCHORS.source.y, 4.9, t) + (rnd() - 0.5) * 4,
      THREE.MathUtils.lerp(ANCHORS.source.z, 11.2, t) + (rnd() - 0.5) * 4
    );
    return { x: p.x, y: p.y, z: p.z, alpha: 0.04 + rnd() * 0.13 };
  });

  // fireflies
  const fireflies = new GlowPoints(scene, 85, { size: 1.7, color: 0xffcf89, drift: 0.9 });
  fireflies.setPositions(() => ({
    x: (rnd() - 0.5) * 48,
    y: 0.4 + rnd() * 5.6,
    z: -18 + rnd() * 30,
    alpha: 0.15 + rnd() * 0.32,
  }));

  // solve bursts
  const bursts = new GlowPoints(scene, 260, { size: 3.2, color: 0xffd7a0, drift: 0 });
  bursts.setPositions(() => ({ x: 0, y: -100, z: 0, alpha: 0 }));
  const silverBursts = new GlowPoints(scene, 220, { size: 2.5, color: 0xc9e2ff, drift: 0 });
  silverBursts.setPositions(() => ({ x: 0, y: -100, z: 0, alpha: 0 }));

  /* ---------------------------------------------------------------- */
  /* moon light and general lighting                                  */
  /* ---------------------------------------------------------------- */

  const hemi = new THREE.HemisphereLight(0x688bb4, 0x0b0c0c, 1.15);
  scene.add(hemi);
  const moonKey = new THREE.DirectionalLight(0xb6d0f2, 2.3);
  moonKey.position.set(-34, 42, -10);
  moonKey.target.position.set(0, 0, 0);
  moonKey.castShadow = true;
  moonKey.shadow.mapSize.set(1024, 1024);
  moonKey.shadow.camera.near = 1;
  moonKey.shadow.camera.far = 110;
  moonKey.shadow.camera.left = -28;
  moonKey.shadow.camera.right = 28;
  moonKey.shadow.camera.top = 28;
  moonKey.shadow.camera.bottom = -28;
  moonKey.shadow.bias = -0.00035;
  moonKey.shadow.normalBias = 0.03;
  scene.add(moonKey, moonKey.target);
  const fill = new THREE.DirectionalLight(0x6d90b8, 1.45);
  fill.position.set(18, 20, 26);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x7fa2c6, 0.55);
  rim.position.set(25, 12, -30);
  scene.add(rim);
  const ambient = new THREE.AmbientLight(0x16212c, 0.9);
  scene.add(ambient);

  // lantern glints near the three target windows (no extra point light)
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: 0xffa65e, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    t.center.set(0, 0, 0);
    t.haloExtra = s;
    scene.add(s);
  }

  /* ---------------------------------------------------------------- */
  /* finalize positions                                               */
  /* ---------------------------------------------------------------- */

  root.updateMatrixWorld(true);
  const tmp = new V3();
  for (const t of targets) {
    t.group.getWorldPosition(t.center);
    t.haloExtra.position.copy(t.center);
    t.haloExtra.scale.set(4.2, 4.2, 1);
  }
  mirrorA.root.updateMatrixWorld(true);
  mirrorC.root.updateMatrixWorld(true);
  boat.updateMatrixWorld(true);
  mirrorB.root.getWorldPosition(tmp);

  const mirrorCenters = {
    a: mirrorA.root.localToWorld(new V3(0, mirrorA.height, 0)),
    b: mirrorB.root.getWorldPosition(new V3()),
    c: mirrorC.root.localToWorld(new V3(0, mirrorC.height, 0)),
  };
  // mirrorB.root sits at the boat's deck; add the mirror disc center height
  mirrorCenters.b = mirrorB.root.getWorldPosition(new V3());
  mirrorCenters.b.y += mirrorB.height;

  const source = ANCHORS.source.clone();
  sourceBeam.setCurve(
    source,
    new V3(
      THREE.MathUtils.lerp(source.x, mirrorCenters.a.x, 0.5) - 0.3,
      THREE.MathUtils.lerp(source.y, mirrorCenters.a.y, 0.5) + 0.22,
      THREE.MathUtils.lerp(source.z, mirrorCenters.a.z, 0.5)
    ),
    mirrorCenters.a
  );

  /* ---------------------------------------------------------------- */
  /* animation state / public API                                     */
  /* ---------------------------------------------------------------- */

  const state = {
    boatDock: 0,
    boatFrom: boatDockPoints[0].clone(),
    boatTo: boatDockPoints[0].clone(),
    boatFromU: ANCHORS.dockU[0],
    boatCurrentU: ANCHORS.dockU[0],
    boatToU: ANCHORS.dockU[0],
    boatT: 1,
    boatMoving: false,
    boatDuration: 2.4,
    boatRoll: 0,
    boatPitch: 0,
    rippleCooldown: 0,
    activeDock: 0,
    activeMirrorIds: new Set(),
    activeTarget: 0,
    memoryAlpha: 0,
    memoryOn: false,
    riseClock: 0,
    rising: 0,
    riseTarget: 0,
    solved: [false, false, false],
    time: 0,
  };
  let rippleCursor = 0;

  function clearRipples() {
    for (const r of boatRipples) {
      r.active = false;
      r.age = 0;
      r.mesh.visible = false;
      r.mesh.material.opacity = 0;
    }
    state.rippleCooldown = 0;
  }

  boat.position.copy(boatDockPoints[0]);
  const dockTangents = ANCHORS.dockU.map((u) => riverCurve.getTangentAt(u));
  boat.rotation.y = Math.atan2(dockTangents[0].x, dockTangents[0].z);

  function setBoatDock(index, duration = 2.4) {
    index = Math.max(0, Math.min(2, index));
    if (index === state.boatDock && state.boatT >= 1) return false;
    state.boatFromU = state.boatCurrentU;
    state.boatToU = ANCHORS.dockU[index];
    state.boatDock = index;
    state.boatFrom.copy(boat.position);
    state.boatTo.copy(boatDockPoints[index]);
    state.boatT = 0;
    state.boatMoving = true;
    state.boatDuration = duration;
    state.rippleCooldown = Math.min(state.rippleCooldown, 0.04);
    return true;
  }

  function snapBoatDock(index) {
    index = Math.max(0, Math.min(2, index));
    state.boatDock = index;
    state.boatFromU = ANCHORS.dockU[index];
    state.boatCurrentU = ANCHORS.dockU[index];
    state.boatToU = ANCHORS.dockU[index];
    state.boatT = 1;
    state.boatMoving = false;
    state.boatRoll = 0;
    state.boatPitch = 0;
    boat.position.copy(boatDockPoints[index]);
    const t = dockTangents[index];
    boat.rotation.y = Math.atan2(t.x, t.z);
    boatVisual.rotation.z = 0;
    boatVisual.rotation.x = 0;
    clearRipples();
    boat.updateMatrixWorld(true);
    mirrorB.root.updateMatrixWorld(true);
    mirrorB.root.getWorldPosition(mirrorCenters.b);
    mirrorCenters.b.y += mirrorB.height;
  }

  function setMirrorActive(id, active) {
    const m = id === "a" ? mirrorA : id === "b" ? mirrorB : mirrorC;
    m.active = active;
    if (active) state.activeMirrorIds.add(id);
    else state.activeMirrorIds.delete(id);
  }

  function setActiveTarget(i) {
    state.activeTarget = i;
    for (let k = 0; k < targets.length; k++) targets[k].active = k === i && !state.solved[k];
  }

  function setActiveDock(i) {
    state.activeDock = i;
    for (let k = 0; k < dockMarkers.length; k++) dockMarkers[k].active = k === i;
  }

  function lightTarget(i, on = true) {
    const t = targets[i];
    if (!t) return;
    t.lit = on;
    state.solved[i] = on;
    if (on) {
      t.flashAge = 0;
      bursts.burst(t.center.clone(), 34, { speed: 1.8, life: 2.4, spread: 1.2 });
      silverBursts.burst(t.center.clone(), 20, { speed: 1.2, life: 2.0, spread: 1.6 });
    }
  }

  function resetVisuals() {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      t.lit = false;
      t.litAmount = 0;
      t.flashAge = 99;
      t.active = false;
      t.silhouette.scale.setScalar(1);
      t.silhouette.visible = false;
      state.solved[i] = false;
    }
    state.activeTarget = 0;
    state.boatDock = 0;
    state.boatFrom.copy(boatDockPoints[0]);
    state.boatTo.copy(boatDockPoints[0]);
    state.boatT = 1;
    state.boatFromU = ANCHORS.dockU[0];
    state.boatCurrentU = ANCHORS.dockU[0];
    state.boatToU = ANCHORS.dockU[0];
    state.boatMoving = false;
    state.boatRoll = 0;
    state.boatPitch = 0;
    boat.position.copy(boatDockPoints[0]);
    boat.rotation.y = Math.atan2(dockTangents[0].x, dockTangents[0].z);
    boatVisual.rotation.z = 0;
    boatVisual.rotation.x = 0;
    clearRipples();
    state.riseClock = 0;
    state.rising = 0;
    state.riseTarget = 0;
    state.memoryOn = false;
    state.memoryAlpha = 0;
    setYaw(mirrorA, 100 * DEG);
    setYaw(mirrorB, 11 * DEG);
    setYaw(mirrorC, 92 * DEG);
    impactOpacities.a = 0.35;
    impactOpacities.b = 0.05;
    impactOpacities.c = 0.05;
    for (const mb of memoryBeams) {
      mb._memoryOn = false;
      mb.setStrength(0.001);
    }
    moonGroup.position.copy(moonStart);
    moonKey.intensity = 2.1;
    hemi.intensity = 0.9;
    waterUniforms.uMoonBoost.value = 1;
    for (const t of targets) {
      t.light.intensity = 0;
      t.halo.material.opacity = 0;
      t.flash.material.opacity = 0;
      t.marker.material.opacity = 0;
      t.glowMat.color.copy(TMP_WIN_COLOR).multiplyScalar(0.035);
      t.haloExtra.material.opacity = 0.12;
      for (const m of t.personMaterials) m.opacity = 0;
    }
    for (const d of dockMarkers) {
      d.ring.material.opacity = 0;
      d.active = false;
    }
  }

  function setRise(p) {
    state.riseTarget = Math.max(0, Math.min(1, p));
  }

  function setRiseNow(p) {
    const clamped = Math.max(0, Math.min(1, p));
    state.riseClock = Math.acos(1 - 2 * clamped) / Math.PI;
    state.rising = clamped;
    state.riseTarget = clamped;
    setMoonProgress(clamped);
    moonGroup.updateMatrixWorld(true);
  }

  function showMemory(on) {
    state.memoryOn = on;
  }

  function midFor(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += Math.min(2.2, a.distanceTo(b) * 0.04);
    return mid;
  }

  function setMemoryCurves(paths) {
    // paths: array of arrays of Vector3, stored as polylines; draw each segment with a beam.
    let idx = 0;
    for (const path of paths) {
      // skip the first point: the live source beam already owns that segment
      for (let i = 1; i < path.length - 1 && idx < memoryBeams.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        const beam = memoryBeams[idx];
        beam.setCurve(a, midFor(a, b), b);
        beam.setStrength(0.001);
        beam._memoryOn = true;
        idx++;
      }
    }
    for (; idx < memoryBeams.length; idx++) {
      memoryBeams[idx]._memoryOn = false;
      memoryBeams[idx].setStrength(0.001);
    }
  }

  function burstMirror(pos) {
    silverBursts.burst(pos.clone(), 14, { speed: 1.3, life: 1.5, spread: 0.5 });
  }

  function setMoonProgress(p) {
    // p 0..1
    moonGroup.position.lerpVectors(moonStart, moonEnd, p);
    const haloBoost = 0.07 + p * 0.43;
    haloBig.material.opacity = haloBoost;
    haloMid.material.opacity = 0.13 + p * 0.42;
    haloCore.material.opacity = 0.3 + p * 0.64;
    haloBig.scale.setScalar(44 + p * 34);
    haloMid.scale.setScalar(20 + p * 18);
    if (moonGroup.userData.moonHot) {
      moonGroup.userData.moonHot.material.opacity = 0.26 + p * 0.62;
      moonGroup.userData.moonHot.scale.setScalar(6.2 + p * 3.2);
    }
    moonKey.intensity = 2.1 + p * 1.2;
    hemi.intensity = 0.9 + p * 0.22;
    waterUniforms.uMoonBoost.value = 1 + p * 1.2;
    if (moonMesh?.userData?.materials) {
      // handled by materials stored below
    }
  }

  function update(dt, time, camera) {
    state.time = time;

    // smooth mirror yaw damping
    for (const m of [mirrorA, mirrorB, mirrorC]) {
      const prev = m.yawAngle;
      m.yawAngle = dampAngle(m.yawAngle, m.targetYaw, 15, dt);
      m.yaw.rotation.y = m.yawAngle;
      m.angularVel = dt > 1e-5 ? wrapAngle(m.yawAngle - prev) / dt : 0;
    }

    // stars
    if (root.userData.stars) root.userData.stars.uniforms.uTime.value = time;
    waterUniforms.uTime.value = time;

    // explicit moonrise timeline with sine ease
    if (state.riseTarget > state.riseClock) {
      state.riseClock = Math.min(state.riseTarget, state.riseClock + dt / 7.2);
    } else if (state.riseTarget < state.riseClock) {
      state.riseClock = Math.max(state.riseTarget, state.riseClock - dt / 2.5);
    }
    state.rising = state.riseClock <= 0.0001 ? 0 : easeInOutSine(state.riseClock);
    setMoonProgress(state.rising);

    // moon dust and halo pulse
    moonDust.update(dt, time);
    const pulse = 1 + Math.sin(time * 0.55) * 0.035;
    haloCore.scale.set(9 * pulse, 9 * pulse, 1);

    // water spirit drift + finale moonrise resonance
    if (root.userData.waterSpirit) {
      const ws = root.userData.waterSpirit;
      ws.rotation.z = 0.06 + Math.sin(time * 0.4 + ws.userData.phase) * 0.025;
      ws.position.y = 0.3 + state.rising * 0.45 + Math.sin(time * 0.5 + ws.userData.phase) * 0.08;
    }
    if (root.userData.blueLight) root.userData.blueLight.intensity = 18 + state.rising * 8 + Math.sin(time * 1.7) * 3;

    // mist drift
    for (const s of mists) {
      s.position.x = s.userData.baseX + Math.sin(time * s.userData.speed + s.userData.phase) * 3.2;
      s.material.opacity = 0.018 + (Math.sin(time * 0.17 + s.userData.phase) * 0.5 + 0.5) * 0.036;
    }

    // lanterns flicker
    for (const l of lanterns) {
      l.sprite.material.opacity = l.base * (0.8 + Math.sin(time * 2.1 + l.phase) * 0.15 + Math.sin(time * 4.7 + l.phase * 2) * 0.05);
    }

    // braziers
    for (const b of braziers) {
      const f = 0.82 + Math.sin(time * 7.3 + b.phase) * 0.12 + Math.sin(time * 17.1 + b.phase * 2) * 0.06;
      b.light.intensity = 11 * f;
      b.glow.material.opacity = 0.26 * f;
      b.flame.rotation.y += dt * 0.25;
      b.flame.scale.y = 1 + Math.sin(time * 4 + b.phase) * 0.04;
    }
    if (root.userData.bridgeLight) {
      root.userData.bridgeLight.intensity = 10 + Math.sin(time * 3.1) * 1.8 + Math.sin(time * 8.7) * 0.8;
    }

    // target windows
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const want = t.lit ? 1 : 0;
      const lambda = t.lit ? 2.1 : 4.5;
      t.litAmount = damp(t.litAmount, want, lambda, dt);
      if (t.litAmount < 0.002 && !t.lit) t.litAmount = 0;
      const amt = t.litAmount;
      t.glowMat.color.copy(TMP_WIN_COLOR).multiplyScalar(0.028 + amt * 1.55);
      t.light.intensity = amt * (7.5 + (i === 2 ? 3.5 : 0));
      t.halo.material.opacity = amt * 0.26;
      t.halo.scale.setScalar(4.2 + amt * 1.5 + Math.sin(time * 1.3 + i) * 0.12);
      t.haloExtra.material.opacity = 0.04 + amt * 0.12;
      t.flashAge += dt;
      if (t.flashAge < 2.2) {
        const k = t.flashAge / 2.2;
        t.flash.material.opacity = Math.max(0, (1 - k) * 0.55);
        const sc = 1 + k * 11;
        t.flash.scale.set(sc, sc, 1);
      } else {
        t.flash.material.opacity = 0;
      }

      const reveal = THREE.MathUtils.smoothstep(amt, 0.08, 0.92);
      t.silhouette.visible = reveal > 0.005;
      if (t.silhouette.visible) {
        t.silhouette.position.y = 0.01 + reveal * 0.09 + Math.sin(time * 1.2 + i) * 0.01 * reveal;
        t.silhouette.position.z = 0.05 + reveal * 0.035;
        t.silhouette.rotation.y = Math.sin(time * 0.65 + i * 2) * 0.06 * reveal;
      }
      for (const m of t.personMaterials) {
        m.transparent = true;
        m.opacity = reveal;
      }

      const active = t.active && !t.lit;
      const markerTarget = active ? 0.78 : 0;
      t.marker.material.opacity = damp(t.marker.material.opacity, markerTarget, 6, dt);
      t.marker.scale.setScalar(1.24 + Math.sin(time * 2.1 + i) * 0.12);
      t.marker.material.rotation = Math.sin(time * 0.35 + i) * 0.12;
    }

    // mirrors active markers / rings
    for (const m of [mirrorA, mirrorB, mirrorC]) {
      const on = m.active;
      const target = on ? 0.4 : 0;
      m.marker.material.opacity = damp(m.marker.material.opacity, target, 5, dt);
      m.marker.position.y = m.height + m.radius + 0.62 + Math.sin(time * 1.8 + (m.id === "a" ? 0 : 2)) * 0.08;
      m.marker.material.rotation = Math.sin(time * 0.3 + (m.id === "c" ? 2 : 0)) * 0.1;
      m.ring.material.opacity = on ? 0.13 + Math.sin(time * 2.2) * 0.05 : 0.045;
      m.rim.material.emissiveIntensity = on ? 0.62 : 0.12;
    }

    // dock markers
    for (let i = 0; i < dockMarkers.length; i++) {
      const d = dockMarkers[i];
      const target = d.active ? 0.5 : 0;
      d.ring.material.opacity = damp(d.ring.material.opacity, target, 5, dt);
      if (d.active) {
        d.ring.rotation.z = time * 0.25;
        d.ring.scale.setScalar(1 + Math.sin(time * 1.7) * 0.04);
        d.glow.material.opacity = 0.2 + Math.sin(time * 2.3) * 0.07;
      }
    }

    if (root.userData.waterGlows) {
      for (const w of root.userData.waterGlows) {
        w.mesh.material.opacity = w.base * (0.72 + 0.28 * Math.sin(time * 1.35 + w.phase));
      }
    }

    // floating river lanterns drift with the current
    if (root.userData.floaters) {
      for (const f of root.userData.floaters) {
        f.u += dt * 0.0016;
        if (f.u > 0.86) f.u = 0.14;
        riverCurve.getPointAt(f.u, TMP_V1);
        riverCurve.getTangentAt(f.u, TMP_V2);
        f.group.position.set(TMP_V1.x, 0.11 + Math.sin(time * 0.9 + f.phase) * 0.018, TMP_V1.z);
        f.group.rotation.y = Math.atan2(TMP_V2.x, TMP_V2.z);
        f.glow.material.opacity = 0.4 + Math.sin(time * 2.6 + f.phase) * 0.1;
        f.reflection.material.opacity = 0.1 + Math.sin(time * 1.7 + f.phase) * 0.035;
      }
    }

    // boat movement along riverCurve with smooth hull pitch/roll
    const idleBob = Math.sin(time * 1.15) * 0.012;
    if (state.boatMoving) {
      state.boatT += dt / state.boatDuration;
      const raw = Math.min(1, state.boatT);
      const ease = smootherstep(raw);
      const speedEnv = Math.sin(Math.PI * raw);
      state.boatCurrentU = THREE.MathUtils.lerp(state.boatFromU, state.boatToU, ease);
      riverCurve.getPointAt(state.boatCurrentU, TMP_V1);
      riverCurve.getTangentAt(state.boatCurrentU, TMP_V2);
      const targetYaw = Math.atan2(TMP_V2.x, TMP_V2.z);
      riverCurve.getTangentAt(Math.min(1, state.boatCurrentU + 0.02), TMP_V2);
      const turn = wrapAngle(Math.atan2(TMP_V2.x, TMP_V2.z) - targetYaw);

      boat.position.set(
        TMP_V1.x,
        0.03 + idleBob + speedEnv * Math.sin(raw * Math.PI * 3) * 0.015,
        TMP_V1.z
      );
      boat.rotation.y = dampAngle(boat.rotation.y, targetYaw, 9, dt);
      state.boatRoll = damp(state.boatRoll, THREE.MathUtils.clamp(turn * 1.4, -0.09, 0.09) * speedEnv, 7, dt);
      state.boatPitch = damp(state.boatPitch, -0.038 * speedEnv, 7, dt);

      if (raw >= 1) {
        state.boatMoving = false;
        state.boatT = 1;
        state.boatCurrentU = state.boatToU;
      }
    } else {
      boat.position.y = 0.03 + idleBob;
      const t = dockTangents[state.boatDock];
      boat.rotation.y = dampAngle(boat.rotation.y, Math.atan2(t.x, t.z), 7, dt);
      state.boatRoll = damp(state.boatRoll, 0, 6, dt);
      state.boatPitch = damp(state.boatPitch, 0, 6, dt);
    }
    boatVisual.rotation.z = Math.sin(time * 0.9) * 0.012 + state.boatRoll;
    boatVisual.rotation.x = Math.sin(time * 0.7 + 1.2) * 0.009 + state.boatPitch;

    // stationary water wake ripples spawned at boat positions
    state.rippleCooldown -= dt;
    if (state.rippleCooldown <= 0) {
      const r = boatRipples[rippleCursor % boatRipples.length];
      rippleCursor++;
      r.active = true;
      r.age = 0;
      r.maxAge = state.boatMoving ? 2.4 : 3.2;
      r.mesh.position.set(boat.position.x, 0.092, boat.position.z);
      r.mesh.scale.setScalar(1.1);
      r.mesh.material.opacity = 0;
      r.mesh.visible = true;
      state.rippleCooldown = state.boatMoving ? 0.26 : 0.95;
    }
    for (const r of boatRipples) {
      if (!r.active) continue;
      r.age += dt;
      const k = r.age / r.maxAge;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        r.mesh.material.opacity = 0;
        continue;
      }
      const s = 1.1 + (1 - (1 - k) * (1 - k)) * 3.8;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = Math.sin(Math.PI * k) * (1 - k * 0.45) * 0.085;
    }

    // keep dynamic mirror node updated
    boat.updateMatrixWorld(true);
    mirrorB.root.updateMatrixWorld(true);
    mirrorB.root.getWorldPosition(mirrorCenters.b);
    mirrorCenters.b.y += mirrorB.height;

    // particles
    fireflies.update(dt, time);
    beamDust.update(dt, time);
    bursts.update(dt, time);
    silverBursts.update(dt, time);

    // memory beams
    state.memoryAlpha = damp(state.memoryAlpha, state.memoryOn ? 1 : 0, state.memoryOn ? 1.1 : 2.2, dt);
    if (state.memoryAlpha < 0.002 && !state.memoryOn) state.memoryAlpha = 0;
    for (let i = 0; i < memoryBeams.length; i++) {
      const mb = memoryBeams[i];
      if (mb._memoryOn) mb.setStrength(0.82 * state.memoryAlpha * (0.88 + 0.12 * Math.sin(time * 1.4 + i)));
    }

    if (root.userData.rift) {
      const r = root.userData.rift;
      const pulse = 0.9 + Math.sin(time * 0.63) * 0.1;
      r.core.material.opacity = 0.44 + Math.sin(time * 1.1) * 0.1;
      r.halo.material.opacity = 0.16 + Math.sin(time * 0.47) * 0.04;
      r.core.scale.set(2.9 * pulse, 10.8 * pulse, 1);
    }

    // slight mirror glint
    matMirror.emissiveIntensity = 0.5 + Math.sin(time * 0.8) * 0.12;
  }

  function updateBeamMeshes(dt, time, camera) {
    sourceBeam.update(time, camera);
    beamA.update(time, camera);
    beamB.update(time, camera);
    beamC.update(time, camera);
    for (const mb of memoryBeams) mb.update(time, camera);

    const mPos = mirrorCenters;
    impactA.position.copy(mPos.a);
    impactB.position.copy(mPos.b);
    impactC.position.copy(mPos.c);

    const targetA = 0.35 + Math.sin(time * 2) * 0.08;
    const targetB = beamB.strength > 0.04 ? 0.42 + Math.sin(time * 2.2 + 1) * 0.06 : 0.05;
    const targetC = beamC.strength > 0.04 ? 0.42 + Math.sin(time * 2.4 + 2) * 0.06 : 0.05;

    impactOpacities.a = damp(impactOpacities.a, targetA, 12, dt);
    impactOpacities.b = damp(impactOpacities.b, targetB, 9, dt);
    impactOpacities.c = damp(impactOpacities.c, targetC, 9, dt);

    impactA.material.opacity = impactOpacities.a;
    impactB.material.opacity = impactOpacities.b;
    impactC.material.opacity = impactOpacities.c;
    impactA.scale.setScalar(2.4 + Math.sin(time * 1.7) * 0.2);
    impactB.scale.setScalar(1.8 + Math.sin(time * 1.9) * 0.15);
    impactC.scale.setScalar(1.7 + Math.sin(time * 2.1) * 0.15);
  }

  return {
    root,
    scene,
    targets,
    mirrors: { a: mirrorA, b: mirrorB, c: mirrorC },
    mirrorCenters,
    boat,
    boatVisual,
    boatDockPoints,
    dockMarkers,
    bridge,
    riverCurve,
    source,
    interactives,
    setYaw,
    setTargetYaw,
    setBoatDock,
    snapBoatDock,
    setMirrorActive,
    setActiveMirror: setMirrorActive,
    setActiveTarget,
    setActiveDock,
    lightTarget,
    resetVisuals,
    setRise,
    setRiseNow,
    showMemory,
    setMemoryCurves,
    burstMirror,
    update,
    updateBeamMeshes,
    state,
    moonlight: { moonKey, hemi, ambient, fill, rim },
    waterUniforms,
    mats: { matMirror, matBronze, matStone, matDarkStone },
    setMoonProgress,
    beams: { source: sourceBeam, a: beamA, b: beamB, c: beamC, memory: memoryBeams },
    getBoatDock: () => state.boatDock,
    isBoatMoving: () => state.boatMoving,
    getBoatU: () => state.boatCurrentU,
    getMirrorNode(id) {
      if (id === "a") return mirrorCenters.a;
      if (id === "b") return mirrorCenters.b;
      return mirrorCenters.c;
    },
    getTargetCenter(i) {
      return targets[i]?.center;
    },
    modelsLoaded: {
      shan: !!gltfs.shan, shui: !!gltfs.shui, huo: !!gltfs.huo, mu: !!gltfs.mu, yue: !!gltfs.yue,
    },
    dispose() {},
  };
}
