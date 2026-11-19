import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Use one renderer for all still previews to limit GPU contexts on mobile.
const cards = [...document.querySelectorAll('.model-preview')];
const queue = [];
let renderer;
let working = false;

function disposeModel(root) {
  const textures = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach((texture) => texture.dispose());
}

async function draw(card) {
  const status = card.querySelector('.preview-status');
  let root;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(640, 380, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
    }
    status.textContent = '正在加载 3D 模型…';
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${card.dataset.model}.glb`);
    root = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0) throw new Error('Model has no visible dimensions');
    root.position.sub(center);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101e2d);
    scene.add(root);
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x344353, 2.3));
    const key = new THREE.DirectionalLight(0xffe1b8, 3.1);
    key.position.set(4, 7, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ac5ff, 1.4);
    fill.position.set(-5, 3, -4);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(32, 640 / 380, maxSize / 100, maxSize * 100);
    camera.position.set(maxSize * 0.82, maxSize * 0.48, maxSize * 2.25);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const canvas = card.querySelector('canvas');
    canvas.width = 640;
    canvas.height = 380;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(renderer.domElement, 0, 0);
    status.hidden = true;
    card.classList.add('loaded');
  } catch (error) {
    console.warn('Model preview unavailable:', card.dataset.model, error);
    status.textContent = '预览暂不可用，可下载 GLB 查看';
  } finally {
    if (root) disposeModel(root);
  }
}

async function drain() {
  if (working) return;
  working = true;
  while (queue.length) await draw(queue.shift());
  working = false;
}

function enqueue(card) {
  if (card.dataset.queued) return;
  card.dataset.queued = 'true';
  queue.push(card);
  void drain();
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      enqueue(entry.target);
    });
  }, { rootMargin: '300px' });
  cards.forEach((card) => observer.observe(card));
} else {
  cards.forEach(enqueue);
}
window.addEventListener('pagehide', () => renderer?.dispose(), { once: true });
