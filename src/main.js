import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildWorld } from "./world.js";
import { Soundscape } from "./audio.js";
import { Beam, makeRadialTexture } from "./fx.js";
import { snapMirrorAngle, withinMirrorTarget } from "./mirror-assist.js";

/* ------------------------------------------------------------------ */
/* renderer                                                            */
/* ------------------------------------------------------------------ */

const canvas = document.querySelector("#c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
const isHandheld = matchMedia("(max-width: 820px), (pointer: coarse)").matches;
let pixelCap = isHandheld ? 1.25 : 1.5;
let pixelRatio = Math.min(window.devicePixelRatio || 1, pixelCap);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080e);
scene.fog = new THREE.FogExp2(0x09121a, 0.0125);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(-2, 14, 39);

/* ------------------------------------------------------------------ */
/* post                                                                */
/* ------------------------------------------------------------------ */

const composer = new EffectComposer(renderer);
try {
  composer.renderTarget1.samples = 2;
} catch {}
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.64, 0.56, 0.82);
composer.addPass(bloom);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * vec3(0.94, 1.0, 1.055), 0.52);
      c = mix(c * vec3(0.93, 0.99, 1.06), c, smoothstep(0.02, 0.5, lum));
      c += vec3(0.0022, 0.0040, 0.0066);

      vec2 q = (vUv - 0.5) * vec2(1.08, 1.18);
      float vig = smoothstep(0.92, 0.24, length(q));
      c *= mix(0.62, 1.0, vig);

      float g = hash(vUv * uRes + fract(uTime * 0.41) * 103.0) - 0.5;
      c += g * 0.018;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ */
/* ui                                                                  */
/* ------------------------------------------------------------------ */

const ui = {
  loading: document.querySelector("#loading"),
  loadFill: document.querySelector("#load-fill"),
  loadPct: document.querySelector("#load-pct"),
  loadNote: document.querySelector("#load-note"),
  title: document.querySelector("#title-screen"),
  start: document.querySelector("#start"),
  hud: document.querySelector("#hud"),
  goals: document.querySelector("#goals"),
  chapterNo: document.querySelector("#chapter-no"),
  chapterTitle: document.querySelector("#chapter-title"),
  chapterSub: document.querySelector("#chapter-sub"),
  hint: document.querySelector("#hint"),
  hintBtn: document.querySelector("#hintBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  soundBtn: document.querySelector("#soundBtn"),
  toast: document.querySelector("#poem-toast"),
  tip: document.querySelector("#tip"),
  ending: document.querySelector("#ending"),
  replay: document.querySelector("#replay"),
  flash: document.querySelector("#flash"),
};

const audio = new Soundscape();
let world = null;
let ready = false;
let mode = "loading";
let phase = "title";
let started = false;
let stage = 0;
const solved = [false, false, false];
let virtualTime = 0;
let elapsed = 0;
let dt = 1 / 60;
let last = performance.now();
let alignHold = 0;
let finaleT = 0;
let endingShown = false;
let toastTimer = 0;
let playbackTime = 0;

const params = new URLSearchParams(location.search);
const wantsAuto = params.get("auto") === "1";
const wantsSolved = params.get("solved") === "1";
const wantsTime = params.has("t") ? parseFloat(params.get("t") || "0") : null;

const GOAL_DEFS = [
  { n: "一", name: "东窗", sub: "等的第一束光" },
  { n: "二", name: "对岸", sub: "隔着河的窗" },
  { n: "三", name: "山寺", sub: "看不见的窗" },
];

const CHAPTERS = [
  { no: "壹", title: "借光", sub: "让月光落在东窗" },
  { no: "贰", title: "渡口", sub: "小舟载镜，去往对岸" },
  { no: "叁", title: "山寺", sub: "让光爬上山门" },
  { no: "终", title: "月升", sub: "千里共婵娟" },
];

const goalEls = [];
for (const g of GOAL_DEFS) {
  const el = document.createElement("div");
  el.className = "goal";
  el.innerHTML = `<span class="win"></span><p><b>${g.name}</b><small>${g.n} · ${g.sub}</small></p>`;
  ui.goals.appendChild(el);
  goalEls.push(el);
}

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
}

function setHint(text) {
  if (ui.hint.textContent !== text) ui.hint.textContent = text;
}

function setToast(text, duration = 3.6) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), duration * 1000);
}

function updateHUD() {
  const c = CHAPTERS[Math.min(stage, 3)];
  ui.chapterNo.textContent = c.no;
  ui.chapterTitle.textContent = c.title;
  ui.chapterSub.textContent = c.sub;
  for (let i = 0; i < goalEls.length; i++) {
    goalEls[i].classList.toggle("lit", solved[i]);
    goalEls[i].classList.toggle("active", !solved[i] && stage === i);
  }
  ui.soundBtn.classList.toggle("off", audio.enabled && audio.muted);
}

/* ------------------------------------------------------------------ */
/* math & scratch helpers                                              */
/* ------------------------------------------------------------------ */

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOutSine(x) {
  const t = Math.max(0, Math.min(1, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function easeInOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _beamMid = new THREE.Vector3();
const _freeAimOut = new THREE.Vector3();
const _softTarget = new THREE.Vector3();
const _colorWin = new THREE.Color(0xffd3a0);
const _colorMir = new THREE.Color(0xd2e6ff);

/* ------------------------------------------------------------------ */
/* camera                                                              */
/* ------------------------------------------------------------------ */

const camState = {
  pos: new THREE.Vector3(-2, 14, 39),
  look: new THREE.Vector3(-1.5, 7.4, -8),
  fov: 40,
  pointer: new THREE.Vector2(0, 0),
  pointerSmooth: new THREE.Vector2(0, 0),
  focus: null,
  debugView: null,
};

const POSES = {
  title: {
    pos: new THREE.Vector3(-1.6, 13.6, 36.5),
    look: new THREE.Vector3(1.0, 7.8, -11),
    fov: 44,
  },
  play: {
    pos: new THREE.Vector3(0.1, 12.2, 31.2),
    look: new THREE.Vector3(-1.4, 5.2, -3.0),
    fov: 44,
  },
  finale: {
    pos: new THREE.Vector3(0.4, 17.0, 41),
    look: new THREE.Vector3(-2.0, 14.2, -16.5),
    fov: 47,
  },
  closeup: {
    pos: new THREE.Vector3(-2.1, 6.9, 20.0),
    look: new THREE.Vector3(-6.6, 4.7, 12.4),
    fov: 35,
  },
  bridge: {
    pos: new THREE.Vector3(2.2, 9.4, 13.5),
    look: new THREE.Vector3(12.5, 4.2, -5.2),
    fov: 38,
  },
};

function updateCamera(dt, time) {
  const t = time;
  let pose;
  if (camState.debugView) {
    pose = POSES[camState.debugView] || POSES.play;
  } else if (mode === "title" || (phase === "title" && mode !== "loading")) {
    pose = POSES.title;
  } else if (phase === "finale" || phase === "ending") {
    pose = POSES.finale;
  } else {
    pose = POSES.play;
  }

  _camPos.copy(pose.pos);
  _camLook.copy(pose.look);
  let targetFov = pose.fov;

  // slow breathing drift
  if (mode !== "title") {
    _camPos.x += Math.sin(t * 0.083) * 0.34;
    _camPos.y += Math.sin(t * 0.061 + 1.1) * 0.14;
    _camLook.x += Math.sin(t * 0.057 + 0.4) * 0.18;
  } else {
    _camPos.x += Math.sin(t * 0.045) * 0.7;
    _camPos.y += Math.sin(t * 0.035 + 0.8) * 0.22;
    _camLook.x += Math.sin(t * 0.04 + 0.3) * 0.4;
  }

  if (phase === "finale" || phase === "ending") {
    const k = easeInOutSine(Math.min(1, finaleT / 9.2));
    _camPos.y += k * 1.7;
    _camLook.y += k * 1.4;
    _camPos.z += k * 1.2;
  }

  // portrait screens: pull back and widen the frame so the three windows stay in view
  const portraitK = Math.max(0, Math.min(1, (0.95 - camera.aspect) / 0.45));
  if (portraitK > 0) {
    _camPos.z += portraitK * 8.5;
    _camPos.y += portraitK * 2.2;
    targetFov += portraitK * 9;
    _camLook.y += portraitK * 0.7;
    _camLook.x -= portraitK * 1.2;
  }

  // frame-rate independent mouse parallax
  const kp = 1 - Math.exp(-dt * 2.4);
  camState.pointerSmooth.lerp(camState.pointer, kp);
  if (mode !== "title") {
    _camPos.x += camState.pointerSmooth.x * 0.55;
    _camPos.y += camState.pointerSmooth.y * 0.28;
    _camLook.x += camState.pointerSmooth.x * 0.24;
    _camLook.y += camState.pointerSmooth.y * 0.12;
  }

  // solve / window peek focus
  if (camState.focus) {
    const f = camState.focus;
    f.age += dt;
    const x = Math.min(1, f.age / f.duration);
    const env = Math.pow(Math.sin(Math.PI * x), 0.72);
    if (x >= 1) camState.focus = null;
    else {
      _camLook.lerp(f.target, env * f.strength);
      _camDir.copy(f.target).sub(_camPos).normalize();
      _camPos.addScaledVector(_camDir, env * f.strength * 2.1);
      targetFov -= env * 1.1;
    }
  }

  const kPos = 1 - Math.exp(-dt * (mode === "title" ? 0.85 : 1.65));
  const kLook = 1 - Math.exp(-dt * (mode === "title" ? 0.95 : 1.95));
  camState.pos.lerp(_camPos, kPos);
  camState.look.lerp(_camLook, kLook);
  camState.fov += (targetFov - camState.fov) * (1 - Math.exp(-dt * 2.2));
  camera.position.copy(camState.pos);
  camera.lookAt(camState.look);
  if (Math.abs(camera.fov - camState.fov) > 0.001) {
    camera.fov = camState.fov;
    camera.updateProjectionMatrix();
  }
}

/* ------------------------------------------------------------------ */
/* geometry helpers for aiming                                         */
/* ------------------------------------------------------------------ */

const TOL = 19 * (Math.PI / 180);
const SOFT_TOL = 28 * (Math.PI / 180);
const STAGE_DOCK = [0, 1, 2];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function normalize2(x, z) {
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

function requiredYaw(from, incoming, to) {
  const di = normalize2(from.x - incoming.x, from.z - incoming.z);
  const o = normalize2(to.x - from.x, to.z - from.z);
  const nx = o.x - di.x;
  const nz = o.z - di.z;
  if (Math.hypot(nx, nz) < 1e-5) return Math.atan2(o.x, o.z);
  return Math.atan2(nx, nz);
}

function chainDef(s) {
  if (s === 0) return [{ mirror: "a", receiver: () => world.getTargetCenter(0), kind: "window", index: 0 }];
  if (s === 1) {
    return [
      { mirror: "a", receiver: () => world.getMirrorNode("b"), kind: "mirror", id: "b" },
      { mirror: "b", receiver: () => world.getTargetCenter(1), kind: "window", index: 1 },
    ];
  }
  return [
    { mirror: "a", receiver: () => world.getMirrorNode("b"), kind: "mirror", id: "b" },
    { mirror: "b", receiver: () => world.getMirrorNode("c"), kind: "mirror", id: "c" },
    { mirror: "c", receiver: () => world.getTargetCenter(2), kind: "window", index: 2 },
  ];
}

function incomingFor(mirrorId) {
  if (mirrorId === "a") return world.source;
  if (mirrorId === "b") return world.getMirrorNode("a");
  return world.getMirrorNode("b");
}

function chainStatus() {
  if (!world) return { links: [], complete: false };
  const defs = chainDef(stage);
  const links = defs.map((def) => {
    const from = world.getMirrorNode(def.mirror);
    const incoming = incomingFor(def.mirror);
    const to = def.receiver();
    const req = requiredYaw(from, incoming, to);
    const mirror = world.mirrors[def.mirror];
    const err = Math.abs(wrapAngle(mirror.yawAngle - req));
    return { ...def, from, incoming, to, req, err, ok: err <= TOL };
  });
  let power = true;
  for (const link of links) {
    link.powered = power;
    power = power && link.ok;
  }
  const dockOk = stage === 0 || (world.state.boatDock === STAGE_DOCK[stage] && !world.isBoatMoving());
  return { links, dockOk, complete: dockOk && links.every((l) => l.ok) };
}

function freeAim(link, out = _freeAimOut) {
  const from = world.getMirrorNode(link.mirror);
  const di = normalize2(from.x - link.incoming.x, from.z - link.incoming.z);
  const n = { x: Math.sin(world.mirrors[link.mirror].yawAngle), z: Math.cos(world.mirrors[link.mirror].yawAngle) };
  const dot = di.x * n.x + di.z * n.z;
  let ox = di.x - 2 * dot * n.x;
  let oz = di.z - 2 * dot * n.z;
  const o = normalize2(ox, oz);
  return out.set(from.x + o.x * 8.6, from.y - 1.3, from.z + o.z * 8.6);
}

/* ------------------------------------------------------------------ */
/* beams                                                               */
/* ------------------------------------------------------------------ */

const tipTex = makeRadialTexture(128);
const beamTips = [];
for (let i = 0; i < 3; i++) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tipTex,
    color: 0xd4e6ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(2, 2, 1);
  scene.add(sprite);
  beamTips.push(sprite);
}

// faint paths left behind by solved windows
const traceBeams = [];
for (let i = 0; i < 6; i++) {
  traceBeams.push(new Beam(scene, { color: 0xf0dcb8, width: 0.46, strength: 0.001, segments: 34 }));
}
let traceCount = 0;

// a faint anticipated path shown while a mirror is being turned
const guideBeams = [];
for (let i = 0; i < 3; i++) {
  guideBeams.push(new Beam(scene, { color: 0xbdd8f2, width: 0.22, strength: 0.001, segments: 32 }));
}

function clearTraces() {
  traceCount = 0;
  for (const b of traceBeams) b.setStrength(0.001);
}

function recordTrace(points) {
  for (let i = 1; i < points.length - 1; i++) {
    if (traceCount >= traceBeams.length) break;
    const b = traceBeams[traceCount++];
    const a = points[i];
    const end = points[i + 1];
    const mid = a.clone().add(end).multiplyScalar(0.5);
    mid.y += Math.min(0.9, a.distanceTo(end) * 0.02);
    b.setCurve(a, mid, end);
    b.setStrength(0.33);
  }
}

function updateGuide() {
  let used = 0;
  if (drag && phase === "play" && world) {
    const link = chainDef(stage).find((l) => l.mirror === drag.mirror.id);
    if (link) {
      const from = world.getMirrorNode(link.mirror);
      const to = link.receiver();
      _beamMid.copy(from).add(to).multiplyScalar(0.5);
      _beamMid.y += Math.min(0.7, from.distanceTo(to) * 0.015);
      const b = guideBeams[0];
      b.setCurve(from, _beamMid, to);
      b.setStrength(0.33);
      used = 1;
    }
  }
  for (let i = used; i < guideBeams.length; i++) guideBeams[i].setStrength(0.001);
}

function setBeamTo(beam, from, to, strength, lift = 0.8) {
  const dist = from.distanceTo(to);
  _beamMid.copy(from).add(to).multiplyScalar(0.5);
  _beamMid.y += Math.min(1.2, lift + dist * 0.012);
  beam.setCurve(from, _beamMid, to);
  beam.setStrength(strength);
}

const beamAnim = {
  a: { end: new THREE.Vector3(), hasEnd: false, strength: 0.001, tipOpacity: 0, tipScale: 2.3, tipPos: new THREE.Vector3(), hasTip: false, wasOk: false },
  b: { end: new THREE.Vector3(), hasEnd: false, strength: 0.001, tipOpacity: 0, tipScale: 2.1, tipPos: new THREE.Vector3(), hasTip: false, wasOk: false },
  c: { end: new THREE.Vector3(), hasEnd: false, strength: 0.001, tipOpacity: 0, tipScale: 3.1, tipPos: new THREE.Vector3(), hasTip: false, wasOk: false },
};

function snapBeams() {
  for (const key of ["a", "b", "c"]) {
    const a = beamAnim[key];
    a.hasEnd = false;
    a.strength = 0.001;
    a.tipOpacity = 0;
    a.hasTip = false;
    a.wasOk = false;
  }
  for (const tip of beamTips) tip.material.opacity = 0;
  if (world) {
    world.beams.a.setStrength(0.001);
    world.beams.b.setStrength(0.001);
    world.beams.c.setStrength(0.001);
  }
}

function updateLinkBeam(key, idx, active, from, link, def, baseStr, freeStr, lift, dt) {
  const anim = beamAnim[key];
  const beam = world.beams[key];
  const tip = beamTips[idx];
  if (!active || !from || !link || !def) {
    anim.strength = damp(anim.strength, 0.001, 10, dt);
    anim.tipOpacity = damp(anim.tipOpacity, 0, 10, dt);
    anim.wasOk = false;
    if (anim.hasEnd && from) setBeamTo(beam, from, anim.end, anim.strength, lift);
    else beam.setStrength(anim.strength);
    if (anim.strength < 0.004) anim.hasEnd = false;
    tip.material.opacity = anim.tipOpacity;
    return;
  }

  const target = def.receiver();
  const assist = 1 - smoothstep(TOL, SOFT_TOL, link.err);
  freeAim(link, _freeAimOut);
  _softTarget.lerpVectors(_freeAimOut, target, assist);

  if (!anim.hasEnd) {
    anim.end.copy(_softTarget);
    anim.hasEnd = true;
  } else {
    anim.end.lerp(_softTarget, 1 - Math.exp(-dt * (12 + assist * 6)));
  }

  const desiredStrength = THREE.MathUtils.lerp(freeStr, baseStr, assist);
  anim.strength = damp(anim.strength, desiredStrength, 10, dt);
  setBeamTo(beam, from, anim.end, anim.strength, THREE.MathUtils.lerp(0.25, lift, assist));

  if (link.ok && !anim.wasOk) {
    world.burstMirror(from);
    if (audio.enabled && !audio.muted) audio.tick();
  }
  anim.wasOk = !!link.ok;

  const showTip = assist > 0.25 && !solved[stage];
  const pulseBase = def.kind === "window" ? 0.44 : 0.4;
  const targetTipOpacity = showTip ? pulseBase * assist * (0.85 + 0.15 * Math.sin(elapsed * (2.1 + idx * 0.2) + idx)) : 0;
  anim.tipOpacity = damp(anim.tipOpacity, targetTipOpacity, 10, dt);
  const targetScale = def.kind === "window" ? 3.0 : 2.2;
  anim.tipScale = damp(anim.tipScale, targetScale, 10, dt);
  if (!anim.hasTip) {
    anim.tipPos.copy(target);
    anim.hasTip = true;
  } else {
    anim.tipPos.lerp(target, 1 - Math.exp(-dt * 14));
  }
  tip.position.copy(anim.tipPos);
  tip.material.opacity = anim.tipOpacity;
  tip.material.color.copy(def.kind === "window" ? _colorWin : _colorMir);
  tip.scale.setScalar(anim.tipScale);
}

function updateBeams(st, dt) {
  if (phase !== "play" || !st) {
    const keys = ["a", "b", "c"];
    for (let i = 0; i < keys.length; i++) {
      const anim = beamAnim[keys[i]];
      anim.strength = damp(anim.strength, 0.001, 2.8, dt);
      anim.tipOpacity = damp(anim.tipOpacity, 0, 4.5, dt);
      anim.wasOk = false;
      world.beams[keys[i]].setStrength(anim.strength);
      beamTips[i].material.opacity = anim.tipOpacity;
    }
    return;
  }
  const A = world.getMirrorNode("a");
  const B = world.getMirrorNode("b");
  const C = world.getMirrorNode("c");
  const defs = chainDef(stage);

  updateLinkBeam("a", 0, Boolean(A), A, st.links[0], defs[0], 0.74, 0.18, 0.35, dt);
  updateLinkBeam("b", 1, stage >= 1 && !!st.links[0]?.ok, B, st.links[1], defs[1], 0.7, 0.24, 0.4, dt);
  updateLinkBeam("c", 2, stage >= 2 && !!st.links[0]?.ok && !!st.links[1]?.ok, C, st.links[2], defs[2], 0.72, 0.24, 0.45, dt);
}

/* ------------------------------------------------------------------ */
/* game flow                                                           */
/* ------------------------------------------------------------------ */

function startGame(opts = {}) {
  if (!world) return;
  started = true;
  phase = "play";
  tweens.clear();
  memoryPaths.length = 0;
  clearTraces();
  setMode("game");
  ui.title.classList.add("gone");
  ui.ending.classList.remove("show");
  stage = 0;
  solved[0] = solved[1] = solved[2] = false;
  alignHold = 0;
  finaleT = 0;
  endingShown = false;
  virtualTime = 0;
  world.resetVisuals();
  world.setActiveTarget(0);
  world.setActiveMirror("a", true);
  world.setActiveMirror("b", false);
  world.setActiveMirror("c", false);
  world.setActiveDock(-1);
  world.showMemory(false);
  snapBeams();
  camState.debugView = null;
  camState.focus = null;
  if (!opts.silent) {
    audio.unlock();
    audio.ui();
  }
  updateHUD();
  setHint("拖动左侧铜镜，让银色光路落在「东窗」上。");
  if (!opts.noToast) setToast("两座山挡住了月亮。\n先去借一束光。", 4.2);
}

function resetGame(opts = {}) {
  if (!world) return;
  phase = "play";
  setMode("game");
  document.body.classList.remove("is-finale");
  document.body.classList.remove("is-finale");
  stage = 0;
  solved[0] = solved[1] = solved[2] = false;
  alignHold = 0;
  finaleT = 0;
  endingShown = false;
  virtualTime = 0;
  tweens.clear();
  clearTraces();
  memoryPaths.length = 0;
  world.resetVisuals();
  world.setActiveTarget(0);
  world.setActiveMirror("a", true);
  world.setActiveMirror("b", false);
  world.setActiveMirror("c", false);
  world.setActiveDock(-1);
  world.showMemory(false);
  snapBeams();
  camState.debugView = null;
  camState.focus = null;
  ui.ending.classList.remove("show");
  updateHUD();
  setHint("拖动左侧铜镜，让银色光路落在「东窗」上。");
  if (!opts.silent) {
    audio.ui();
    setToast("灯都熄了。\n再借一次月光。", 2.8);
  }
}

function solveCurrent(opts = {}) {
  if (stage >= 3) return;
  const st = chainStatus();
  const points = [world.source.clone()];
  for (const l of st.links) points.push(l.from.clone());
  points.push(world.getTargetCenter(stage).clone());
  const target = world.targets[stage];
  memoryPaths[stage] = points;
  recordTrace(points);
  solved[stage] = true;
  world.lightTarget(stage, true);
  audio.solve(stage);
  if (!opts.silent) {
    setToast(target.poem, 3.4);
    ui.flash.animate(
      [{ opacity: 0 }, { opacity: 0.52, offset: 0.1 }, { opacity: 0 }],
      { duration: 1500, easing: "ease-out" }
    );
    camState.focus = {
      target: target.center.clone(),
      age: 0,
      duration: 3.2,
      strength: 0.2,
    };
  }
  window.dispatchEvent(new CustomEvent("moon-solve", { detail: { stage } }));

  const solvedStage = stage;
  stage++;
  alignHold = 0;
  virtualTime = 0;

  if (stage >= 3) {
    updateHUD();
    startFinale(opts);
  } else {
    updateHUD();
    setupStage();
    if (!opts.silent && solvedStage === 0) {
      setHint("窗亮了。点击小舟，让它去发亮的中渡。");
    }
  }
}

function setupStage() {
  world.setActiveTarget(stage);
  world.setActiveMirror("a", true);
  world.setActiveMirror("b", stage >= 1);
  world.setActiveMirror("c", stage >= 2);
  world.setActiveDock(STAGE_DOCK[stage]);
  updateHUD();
  refreshHint(true);
}

function startFinale(opts = {}) {
  phase = "finale";
  finaleT = 0;
  endingShown = false;
  endDrag();
  document.body.classList.add("is-finale");
  alignHold = 0;
  world.setActiveTarget(-1);
  world.setActiveMirror("a", false);
  world.setActiveMirror("b", false);
  world.setActiveMirror("c", false);
  world.setActiveDock(-1);
  world.showMemory(true);
  world.setMemoryCurves(memoryPaths.filter(Boolean));
  world.setRise(1);
  clearTraces();
  if (!opts.silent) {
    audio.finale();
    setToast("月亮终于越过了山脊。\n三条借来的光，还留在山谷里。", 5.2);
    camState.focus = null;
  }
  updateHUD();
  setHint("你借来的光，正一扇一扇地亮着。");
}

const memoryPaths = [];

/* ------------------------------------------------------------------ */
/* tween / mirrors                                                     */
/* ------------------------------------------------------------------ */

const tweens = new Map();

function tweenMirror(id, to, duration = 0.9) {
  const mirror = world.mirrors[id];
  if (!mirror) return;
  const from = mirror.yawAngle;
  const delta = wrapAngle(to - from);
  tweens.set(id, { from, to: from + delta, t: 0, duration });
}

function updateTweens(dt) {
  for (const [id, tw] of tweens) {
    tw.t += dt / tw.duration;
    const x = Math.min(1, tw.t);
    const e = easeInOutCubic(x);
    const mirror = world.mirrors[id];
    if (!mirror) {
      tweens.delete(id);
      continue;
    }
    world.setYaw(mirror, tw.from + (tw.to - tw.from) * e);
    if (x >= 1) tweens.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/* interaction                                                         */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerClient = { x: 0, y: 0 };
let drag = null;
let hoverData = null;
let lastTick = 0;
let pointerSeen = false;

function canRotate(id) {
  if (phase !== "play") return false;
  if (id === "a") return true;
  if (id === "b") return stage >= 1;
  return stage >= 2;
}

function canMoveBoat() {
  if (phase !== "play" || world.isBoatMoving()) return false;
  return world.state.boatDock < Math.min(2, stage);
}

function pick(clientX, clientY) {
  if (!world) return null;
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.interactives, false);
  // Distant mirrors are visually small. Give the next mirror in the light
  // path a generous screen-space target without stealing clicks from the boat
  // while it still needs to move to its dock.
  if (phase === "play" && stage === 2 && world.state.boatDock === STAGE_DOCK[stage] && !world.isBoatMoving()) {
    const next = chainStatus().links.find((link) => link.powered && !link.ok);
    if (next && next.mirror !== "a") {
      const point = world.getMirrorNode(next.mirror).clone().project(camera);
      const x = (point.x + 1) * window.innerWidth / 2;
      const y = (1 - point.y) * window.innerHeight / 2;
      if (withinMirrorTarget(clientX, clientY, x, y, point.z, isHandheld ? 52 : 42)) {
        return { type: "mirror", mirror: world.mirrors[next.mirror] };
      }
    }
  }
  for (const h of hits) {
    const data = h.object.userData.interact;
    if (data) return data;
  }
  return null;
}

function setTip(text, show) {
  if (show && text) {
    ui.tip.textContent = text;
    ui.tip.style.transform = `translate(${pointerClient.x + 14}px, ${pointerClient.y + 16}px)`;
    ui.tip.classList.add("show");
  } else {
    ui.tip.classList.remove("show");
  }
}

function tipFor(data) {
  if (!data) return "";
  if (data.type === "mirror") {
    const id = data.mirror.id;
    if (!canRotate(id)) return id === "c" ? "桥镜 · 还没有被月光唤醒" : "舟镜 · 借到光后才转动";
    return id === "a" ? "拖动 · 旋转铜镜" : id === "b" ? "舟镜 · 拖动旋转" : "桥镜 · 拖动旋转";
  }
  if (data.type === "boat") {
    if (world.isBoatMoving()) return "小舟 · 正穿过河心";
    return canMoveBoat() ? "点击 · 让舟去下一处渡口" : "小舟 · 还停在最初的水湾";
  }
  if (data.type === "window") {
    const t = data.target;
    const idx = world.targets.indexOf(t);
    if (solved[idx]) return `窗 · ${t.name}已经亮了`;
    return idx === stage ? `窗 · ${t.name}在等一束光` : `窗 · ${t.name}还在暗处`;
  }
  return "";
}

function updateHover(clientX, clientY) {
  if (!started || mode !== "game" || phase === "ending") {
    setTip("", false);
    canvas.style.cursor = "default";
    return;
  }
  const data = pick(clientX, clientY);
  hoverData = data;
  if (drag) return;
  setTip(tipFor(data), !!data);
  if (!data) canvas.style.cursor = "default";
  else if (data.type === "mirror") canvas.style.cursor = canRotate(data.mirror.id) ? "grab" : "not-allowed";
  else if (data.type === "boat") canvas.style.cursor = canMoveBoat() ? "pointer" : "default";
  else canvas.style.cursor = "pointer";
}

function beginDrag(data, e) {
  const m = data.mirror;
  m.targetYaw = m.yawAngle;
  drag = {
    mirror: m,
    startX: e.clientX,
    startYaw: m.yawAngle,
    pointerId: e.pointerId,
    moved: false,
  };
  tweens.delete(m.id);
  canvas.setPointerCapture?.(e.pointerId);
  canvas.style.cursor = "grabbing";
  setTip("", false);
  audio.unlock();
}

function endDrag() {
  if (!drag) return;
  drag = null;
  canvas.style.cursor = "grab";
  if (!pointerSeen) setTip("", false);
}

function onPointerDown(e) {
  if (mode === "title") return;
  audio.unlock();
  if (mode !== "game" || phase !== "play") return;
  const data = pick(e.clientX, e.clientY);
  if (!data) return;
  if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
  if (data.type === "mirror") {
    if (!canRotate(data.mirror.id)) {
      audio.ui();
      setToast(
        data.mirror.id === "c"
          ? "桥上的铜镜还未醒来。\n先把光送到前两扇窗。"
          : "舟镜还在等第一束光。",
        2.6
      );
      return;
    }
    e.preventDefault();
    beginDrag(data, e);
  } else if (data.type === "boat") {
    e.preventDefault();
    tryMoveBoat();
  } else if (data.type === "window") {
    e.preventDefault();
    const idx = world.targets.indexOf(data.target);
    if (solved[idx]) {
      setToast(`${data.target.name}已经亮了。\n窗里的人，正看着月亮。`, 2.8);
    } else if (idx === stage) {
      camState.focus = { target: data.target.center.clone(), age: 0, duration: 2.2, strength: 0.13 };
      setToast(
        stage === 0
          ? "窗在东边。\n它看不见另外两扇窗。"
          : stage === 1
            ? "窗在河对岸。\n光要先落在舟镜上。"
            : "窗在山寺。\n只有桥镜能够到那里。",
        3.2
      );
      audio.ui();
    } else {
      setToast("这扇窗还在暗处。\n先照亮前一扇。", 2.5);
    }
  }
}

function onPointerMove(e) {
  pointerClient = { x: e.clientX, y: e.clientY };
  pointerSeen = true;
  camState.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  if (drag) {
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 2) drag.moved = true;
    let angle = drag.startYaw + dx * 0.008;
    // Gently catch the intended alignment in the final relay, so the player
    // can release the pointer without having to hold a precise angle.
    if (stage === 2 && world.state.boatDock === STAGE_DOCK[stage] && !world.isBoatMoving()) {
      const link = chainStatus().links.find((item) => item.mirror === drag.mirror.id);
      if (link) angle = snapMirrorAngle(angle, link.req, TOL, link.powered);
    }
    world.setTargetYaw(drag.mirror, angle);
    ui.tip.classList.remove("show");
    return;
  }
  updateHover(e.clientX, e.clientY);
}

function onPointerUp(e) {
  if (drag) {
    endDrag();
    return;
  }
  if (pointerSeen) updateHover(e.clientX, e.clientY);
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("pointerleave", () => {
  pointerSeen = false;
  setTip("", false);
  if (!drag) canvas.style.cursor = "default";
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function moveBoatTo(index, opts = {}) {
  if (index < 0 || index > 2) return;
  if (index === world.state.boatDock && !world.isBoatMoving()) return;
  const changed = world.setBoatDock(index, opts.duration ?? 2.4);
  if (changed) {
    if (!opts.silent) audio.boat();
    setHint("小舟正穿过河心。等它靠岸。");
    if (!opts.silent) setToast(index === 1 ? "小舟荡向中渡。\n舟上的铜镜，接得住光。" : "小舟泊到桥渡。\n桥镜就在岸边。", 2.4);
  }
  if (opts.instant) world.snapBoatDock(index);
}

function tryMoveBoat() {
  if (phase !== "play") return;
  if (world.isBoatMoving()) return;
  const next = Math.min(stage, world.state.boatDock + 1);
  if (next === world.state.boatDock) {
    audio.ui();
    setToast(stage === 0 ? "小舟还没有新的渡口。\n先让第一扇窗亮起来。" : "先转铜镜。\n渡口会在窗亮之后醒来。", 2.6);
    return;
  }
  moveBoatTo(next);
}

/* ------------------------------------------------------------------ */
/* hint / ui buttons                                                   */
/* ------------------------------------------------------------------ */

function doHint() {
  if (phase !== "play") return;
  audio.unlock();
  audio.hint();
  const st = chainStatus();
  if (stage > 0 && world.state.boatDock !== STAGE_DOCK[stage] && !world.isBoatMoving()) {
    moveBoatTo(STAGE_DOCK[stage]);
    setHint("点击小舟，等它靠岸；再转动铜镜。");
    return;
  }
  const link = st.links.find((l) => !l.ok);
  if (!link) {
    setHint("光已经对上了。再等一瞬。");
    return;
  }
  const mirror = world.mirrors[link.mirror];
  const delta = wrapAngle(link.req - mirror.yawAngle);
  tweenMirror(link.mirror, mirror.yawAngle + delta * 0.66, 0.75);
  setToast(
    link.mirror === "a"
      ? "铜镜转了半寸。\n光跟着偏过去。"
      : link.mirror === "b"
        ? "舟镜轻响。\n水面的银光晃了一下。"
        : "桥镜醒来。\n山寺的窗，就在那边。",
    2.3
  );
}

ui.start.addEventListener("click", () => {
  if (!ready) return;
  audio.unlock();
  startGame();
});

ui.hintBtn.addEventListener("click", doHint);
ui.resetBtn.addEventListener("click", () => {
  audio.unlock();
  resetGame();
});
ui.soundBtn.addEventListener("click", () => {
  audio.unlock();
  audio.toggleMuted();
  ui.soundBtn.classList.toggle("off", audio.muted);
  audio.ui();
});
ui.replay.addEventListener("click", () => {
  audio.unlock();
  resetGame();
});

/* ------------------------------------------------------------------ */
/* hints refresh                                                       */
/* ------------------------------------------------------------------ */

function refreshHint(stArg = null) {
  if (!world || phase !== "play") return;
  if (world.isBoatMoving()) {
    setHint("小舟正穿过河心。等它靠岸。");
    return;
  }
  if (stage > 0 && world.state.boatDock !== STAGE_DOCK[stage]) {
    setHint("点击小舟，让它停到发亮的渡口。");
    return;
  }
  const st = typeof stArg === "object" && stArg !== null ? stArg : chainStatus();
  if (stage === 0) {
    setHint(st.links[0]?.ok ? "光已经落在东窗上。" : "拖动左侧铜镜，让银色光路落在「东窗」上。");
    return;
  }
  if (stage === 1) {
    if (!st.links[0]?.ok) setHint("先把左侧铜镜转向小舟上的舟镜。");
    else if (!st.links[1]?.ok) setHint("舟镜接到光了。拖动舟镜，照向「对岸」。");
    else setHint("两束光都对准了。窗就要亮。");
    return;
  }
  if (stage === 2) {
    if (!st.links[0]?.ok) setHint("先把光交给小舟。");
    else if (!st.links[1]?.ok) setHint("按住小舟上的铜镜左右拖动，把光送到桥镜。");
    else if (!st.links[2]?.ok) setHint("按住右侧桥镜左右拖动，让光照进山寺的窗。");
    else setHint("三面铜镜都对准了。山门要开了。");
  }
}

/* ------------------------------------------------------------------ */
/* finale                                                              */
/* ------------------------------------------------------------------ */

function showEnding() {
  if (endingShown) return;
  endingShown = true;
  phase = "ending";
  setMode("ending");
  ui.ending.classList.add("show");
  ui.tip.classList.remove("show");
}

/* ------------------------------------------------------------------ */
/* debug api                                                           */
/* ------------------------------------------------------------------ */

function parseDock(id) {
  if (typeof id === "number") return Math.max(0, Math.min(2, id));
  const m = String(id).match(/\d+/);
  if (m) return Math.max(0, Math.min(2, parseInt(m[0], 10)));
  if (id === "left") return 0;
  if (id === "mid" || id === "middle") return 1;
  if (id === "right" || id === "bridge") return 2;
  return 0;
}

function parseMirror(id) {
  const s = String(id).toLowerCase();
  if (s.includes("a") || s.includes("雪") || s.includes("岸")) return "a";
  if (s.includes("b") || s.includes("舟")) return "b";
  if (s.includes("c") || s.includes("桥")) return "c";
  return "a";
}

function debugSolveNext(opts = {}) {
  if (!world) return;
  if (stage >= 3) return;
  if (stage > 0) {
    world.snapBoatDock(STAGE_DOCK[stage]);
    world.updateMatrixWorld?.(true);
  }
  const defs = chainDef(stage);
  for (const def of defs) {
    const from = world.getMirrorNode(def.mirror);
    const incoming = incomingFor(def.mirror);
    const to = def.receiver();
    const req = requiredYaw(from, incoming, to);
    world.setYaw(world.mirrors[def.mirror], req);
  }
  // give the matrices a nudge before recording the path
  world.root.updateMatrixWorld(true);
  world.snapBoatDock(world.state.boatDock);
  const st = chainStatus();
  const points = [world.source.clone()];
  for (const l of st.links) points.push(l.from.clone());
  points.push(world.getTargetCenter(stage).clone());
  memoryPaths[stage] = points;
  recordTrace(points);
  solved[stage] = true;
  world.lightTarget(stage, true);
  stage++;
  if (stage < 3) {
    updateHUD();
    setupStage();
  } else {
    updateHUD();
    startFinale({ silent: true });
  }
}

function seek(t) {
  if (!world) return;
  const seconds = Math.max(0, Number(t) || 0);
  ui.toast.classList.remove("show");
  if (!started) startGame({ silent: true, noToast: true });
  resetGame({ silent: true });
  ui.toast.classList.remove("show");
  tweens.clear();
  clearTraces();
  snapBeams();
  phase = "play";
  setMode("game");
  ui.title.classList.add("gone");
  ui.ending.classList.remove("show");
  const beats = [10, 24, 38];
  let n = 0;
  if (seconds >= beats[0]) n = 1;
  if (seconds >= beats[1]) n = 2;
  if (seconds >= beats[2]) n = 3;
  memoryPaths.length = 0;
  for (let i = 0; i < n; i++) {
    debugSolveNext({ silent: true });
  }
  if (n >= 3) {
    phase = "finale";
    setMode("game");
    finaleT = Math.min(10, Math.max(0, seconds - 38));
    world.showMemory(true);
    world.setMemoryCurves(memoryPaths.filter(Boolean));
    world.setRiseNow(Math.min(1, Math.max(0, (seconds - 38) / 9)));
    setHint("月亮越过了山脊。三扇窗都亮着。");
    updateHUD();
  } else {
    finaleT = 0;
    world.setRiseNow(0);
    world.showMemory(false);
    world.setMemoryCurves([]);
    setHint(
      seconds < 10
        ? "拖动左侧铜镜，让银色光路落在「东窗」上。"
        : stage === 1
          ? "窗亮了。点击小舟，去中渡。"
          : "光到了舟镜。转动舟镜，照向对岸。"
    );
  }
  virtualTime = seconds;
  camState.focus = null;
  camState.debugView = null;
}

window.G = {
  get ready() { return ready; },
  rotate(id, deg) {
    if (!world) return;
    const key = parseMirror(id);
    tweens.delete(key);
    world.setYaw(world.mirrors[key], Number(deg) * (Math.PI / 180));
    return this.state();
  },
  moveBoat(id) {
    if (!world) return;
    const idx = parseDock(id);
    moveBoatTo(idx, { instant: true, silent: true });
    return this.state();
  },
  solve() {
    if (!world) return;
    if (!started) startGame({ silent: true, noToast: true });
    if (phase === "finale" || phase === "ending") return this.state();
    debugSolveNext({ silent: true });
    alignHold = 0;
    return this.state();
  },
  aim() {
    if (!world) return this.state();
    if (!started) startGame({ silent: true, noToast: true });
    if (phase !== "play" || stage >= 3) return this.state();
    if (stage > 0) world.snapBoatDock(STAGE_DOCK[stage]);
    const defs = chainDef(stage);
    for (const def of defs) {
      const req = requiredYaw(world.getMirrorNode(def.mirror), incomingFor(def.mirror), def.receiver());
      tweens.delete(def.mirror);
      world.setYaw(world.mirrors[def.mirror], req);
    }
    return this.state();
  },
  points() {
    if (!world) return null;
    const project = (v) => {
      const p = v.clone().project(camera);
      return [Math.round((p.x * 0.5 + 0.5) * window.innerWidth), Math.round((-p.y * 0.5 + 0.5) * window.innerHeight)];
    };
    return {
      a: project(world.getMirrorNode("a")),
      b: project(world.getMirrorNode("b")),
      c: project(world.getMirrorNode("c")),
      boat: project(world.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0))),
      w1: project(world.getTargetCenter(0)),
      w2: project(world.getTargetCenter(1)),
      w3: project(world.getTargetCenter(2)),
    };
  },
  reset() {
    if (!world) return;
    resetGame({ silent: true });
    return this.state();
  },
  seek(t) {
    seek(t);
    return this.state();
  },
  view(name) {
    camState.debugView = POSES[name] ? name : null;
    return this.state();
  },
  start() {
    if (world && !started) startGame({ silent: true, noToast: true });
    else if (world) startGame({ silent: true, noToast: true });
    return this.state();
  },
  hp() {
    return this.state();
  },
  state() {
    return {
      ready,
      mode,
      phase,
      stage,
      solved: solved.slice(),
      boat: world?.state.boatDock ?? 0,
      boatMoving: world?.isBoatMoving() ?? false,
      activeTarget: world?.state.activeTarget ?? 0,
      activeDocks: world?.dockMarkers.map((d) => d.active) ?? [],
      mirrors: world
        ? {
            a: +((world.mirrors.a.yawAngle * 180) / Math.PI).toFixed(1),
            b: +((world.mirrors.b.yawAngle * 180) / Math.PI).toFixed(1),
            c: +((world.mirrors.c.yawAngle * 180) / Math.PI).toFixed(1),
          }
        : null,
      camera: camera.position.toArray().map((n) => +n.toFixed(2)),
      look: camState.look.toArray().map((n) => +n.toFixed(2)),
      audio: { enabled: audio.enabled, muted: audio.muted },
      finale: +finaleT.toFixed(2),
      virtualTime: +virtualTime.toFixed(2),
      models: world?.modelsLoaded ?? null,
      fps: +fpsAvg.toFixed(1),
      memoryPaths: memoryPaths.filter(Boolean).length,
      traces: traceBeams.filter((b) => b.strength > 0.01).length,
    };
  },
};

/* ------------------------------------------------------------------ */
/* auto demo                                                           */
/* ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function autoDemo() {
  await sleep(1400);
  if (!started) startGame({ silent: true, noToast: true });
  await sleep(1400);
  for (let guard = 0; guard < 4 && stage < 3 && phase === "play"; guard++) {
    const before = stage;
    if (stage > 0 && world.state.boatDock !== STAGE_DOCK[stage]) {
      moveBoatTo(STAGE_DOCK[stage], { silent: true });
      await sleep(2700);
    }
    const st = chainStatus();
    st.links.forEach((l, i) => tweenMirror(l.mirror, l.req, 1.8 + i * 0.25));
    await sleep(3900);
    if (stage === before && phase === "play") {
      debugSolveNext({ silent: true });
      await sleep(2500);
    } else {
      await sleep(1500);
    }
    refreshHint();
  }
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

let fpsAvg = 60;
let fpsClock = 0;
let fpsFrames = 0;
let qualityDropped = false;

async function boot() {
  let progress = 0.02;
  let target = 0.02;
  let shown = 0;
  ui.loadFill.style.width = "2%";
  const progressTimer = window.setInterval(() => {
    shown += (target - shown) * 0.18;
    if (target - shown < 0.002) shown = target;
    const pct = Math.round(shown * 100);
    ui.loadPct.textContent = `${pct}%`;
    ui.loadFill.style.width = `${pct}%`;
  }, 60);

  try {
    world = await buildWorld({
      scene,
      renderer,
      camera,
      onProgress: (frac) => {
        target = Math.max(target, 0.08 + frac * 0.9);
      },
      onNote: (text) => {
        ui.loadNote.textContent = text;
      },
    });
    target = 1;
    await sleep(550);
    window.clearInterval(progressTimer);
    ui.loadFill.style.width = "100%";
    ui.loadPct.textContent = "100%";
    ready = true;
    window.__moonDebug = { scene, camera, world };
    started = false;
    setMode("title");
    phase = "title";
    world.setActiveTarget(-1);
    world.setActiveDock(-1);
    ui.loading.classList.add("gone");
    updateHUD();
    // start the title with the moon gap glowing
    camState.pos.copy(POSES.title.pos);
    camState.look.copy(POSES.title.look);
    camState.fov = POSES.title.fov;
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
    camera.fov = camState.fov;
    camera.updateProjectionMatrix();

    try {
      await renderer.compileAsync?.(scene, camera);
    } catch {}

    if (wantsSolved) {
      startGame({ silent: true, noToast: true });
      seek(41);
      world.setRiseNow(0.82);
      setHint("你借来的光，正一扇一扇地亮着。");
    } else if (wantsTime !== null) {
      startGame({ silent: true, noToast: true });
      seek(wantsTime);
    } else if (wantsAuto) {
      autoDemo();
    }
  } catch (err) {
    console.warn("boot failed", err?.message || err);
    ui.loadNote.textContent = "月亮没有出来，请刷新页面";
    ui.loadPct.textContent = "—";
    return;
  }
  last = performance.now();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* loop                                                                */
/* ------------------------------------------------------------------ */

function frame(now) {
  if (mode === "loading") {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  elapsed += dt;

  // fps meter
  fpsFrames++;
  fpsClock += dt;
  if (fpsClock > 0.7) {
    fpsAvg = fpsAvg * 0.72 + (fpsFrames / fpsClock) * 0.28;
    fpsFrames = 0;
    fpsClock = 0;
    if (!qualityDropped && fpsAvg < 38 && pixelRatio > 1.15) {
      qualityDropped = true;
      pixelRatio = 1.15;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  if ((mode === "game" || mode === "ending") && phase === "play") {
    updateTweens(dt);
  }

  if (world) {
    world.update(dt, elapsed, camera);
  }

  let st = world ? chainStatus() : null;

  if (mode === "game" || mode === "ending") {
    if (phase === "play" && st) {
      if (st.complete) {
        alignHold += dt;
        if (alignHold >= 0.38) {
          solveCurrent();
          st = chainStatus();
        }
      } else {
        alignHold = Math.max(0, alignHold - dt * 2.4);
      }
      // avoid hint spam, refresh on meaningful changes
      if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) refreshHint(st);
    }
    if (phase === "finale") {
      finaleT += dt;
      if (finaleT > 10.6 && !endingShown) showEnding();
    }
  }

  updateCamera(dt, elapsed);
  const isFinale = phase === "finale" || phase === "ending";
  const isTitle = mode === "title";
  const bloomTarget = isFinale ? 0.98 : isTitle ? 0.72 : 0.64;
  bloom.strength += (bloomTarget - bloom.strength) * (1 - Math.exp(-dt * 1.4));
  const exposureTarget = isTitle ? 1.34 : isFinale ? 1.3 : 1.22;
  renderer.toneMappingExposure += (exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-dt * 1.2));

  if (world) {
    const maxVel = Math.max(
      Math.abs(world.mirrors.a.angularVel || 0),
      Math.abs(world.mirrors.b.angularVel || 0),
      Math.abs(world.mirrors.c.angularVel || 0)
    );
    audio.setDragVelocity(phase === "play" ? Math.min(1, maxVel / 3.5) : 0);

    updateBeams(st, dt);
    updateGuide();
    world.updateBeamMeshes(dt, elapsed, camera);
    for (const b of traceBeams) b.update(elapsed, camera);
    for (const b of guideBeams) b.update(elapsed, camera);
  } else {
    updateGuide();
  }

  grade.uniforms.uTime.value = elapsed;
  composer.render();
  requestAnimationFrame(frame);
}

addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  grade.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

boot();
