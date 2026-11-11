// The 172E's stage: a pale hangar studio, a painted floor grid with a teardown bay outline, soft sun shadows wide
// enough for the whole exploded layout, GTAO kept off the floor. frame(state, cam) poses the aircraft and draws one
// frame; project() puts a world point on the 1600 x 900 console.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildPlane} from './airframe.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#e7e9ea', floor: '#dfe2e3', line: '#c9cdcf', bay: '#e3562a', shadow: '#4a5560'};

const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uF; uniform vec3 uL; uniform vec3 uBay; uniform vec3 uBg; uniform vec3 uC; uniform float uFar; varying vec3 vW;
  float line(float x, float w){ float d = abs(fract(x + 0.5) - 0.5); return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.004, d); }
  void main(){
    vec2 p = vW.xz;
    // a 1 m grid, every fifth line heavier
    float g = max(line(p.x, 0.012), line(p.y, 0.012)) * 0.45;
    g = max(g, max(line(p.x / 5.0, 0.004), line(p.y / 5.0, 0.004)) * 0.85);
    vec3 col = mix(uF, uL, g);
    // the teardown bay: a dashed rectangle around the aircraft
    vec2 b = abs(p - vec2(0.0, -1.2)) - vec2(8.6, 7.4);
    float edge = 1.0 - smoothstep(0.03, 0.05, abs(max(b.x, b.y)));
    float dash = step(0.5, fract((abs(b.x) > abs(b.y) ? p.y : p.x) * 1.25));
    col = mix(col, uBay, edge * dash * 0.55);
    float n = fract(sin(dot(floor(p * 50.0), vec2(12.9898, 78.233))) * 43758.5453);
    col *= 0.99 + 0.02 * n;
    float d = length(p - uC.xz);
    gl_FragColor = vec4(mix(col, uBg, smoothstep(uFar * 0.45, uFar, d)), 1.0);
  }`;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 40, 95);
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 160);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.75;
  gtao.updateGtaoMaterial({radius: 0.25, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  composer.addPass(new Toggle(() => (floor.visible = shade.visible = false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(() => (floor.visible = shade.visible = true)));
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#dfe3e6');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.99, 0.97).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    // hangar strip lights overhead, a bright door to one side
    for (const z of [-8, 0, 8]) box(16, 1.6, new V3(0, 14, z), 3.2);
    box(4, 14, new V3(-14, 4, 4), 2.6);
    box(4, 14, new V3(14, 4, -6), 1.6);
    box(20, 3, new V3(0, 2, 16), 1.3);
    const g = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({color: '#c9ced2', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const SUN_DIR = new V3(-0.42, 0.8, 0.43).normalize();
  const sun = new THREE.DirectionalLight('#fffaf2', 2.4);
  sun.castShadow = true;
  const EXT = 11;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 1, far: 60});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.target.position.set(0, 0, -0.8);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 30);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd4d8', 0.7));

  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {uF: {value: new THREE.Color(COL.floor)}, uL: {value: new THREE.Color(COL.line)}, uBay: {value: new THREE.Color(COL.bay)}, uBg: {value: new THREE.Color(COL.bg)}, uC: {value: new V3()}, uFar: {value: 40}},
    toneMapped: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.28, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);

  const plane = buildPlane();
  scene.add(plane.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  // st: the airframe state (airframe.js update); cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy}
  const frame = (st, cam) => {
    plane.update(st);
    const {tx, ty, tz} = cam;
    camera.position.set(tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), ty + cam.d * Math.sin(cam.el), tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    plane.root.updateMatrixWorld(true);
    floorMat.uniforms.uC.value.set(tx, 0, tz);
    floorMat.uniforms.uFar.value = Math.max(30, cam.d * 2.2);
    composer.render();
  };
  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const ray = new THREE.Raycaster();
  /** the assembly under a console point (x, y in the 1600 x 900 layout), or null */
  const pick = (x, y) => {
    ray.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1), camera);
    ray.far = Infinity;
    const hit = ray.intersectObject(plane.root, true).find((h) => h.object.visible && h.object.material.opacity > 0.3 && h.object.userData.gid && h.object.userData.gid !== 'stands');
    return hit ? hit.object.userData.gid : null;
  };
  const eye = new V3();
  const dirV = new V3();
  /** whether point p (on a part of assembly gid) is in sight: nothing opaque of another assembly in front of it */
  const seen = (p, gid) => {
    eye.setFromMatrixPosition(camera.matrixWorld);
    dirV.copy(p).sub(eye);
    const far = dirV.length();
    ray.set(eye, dirV.normalize());
    ray.far = far - 0.04;
    const hit = ray.intersectObject(plane.root, true).find((h) => h.object.visible && h.object.material.depthWrite && h.object.material.opacity > 0.5 && h.object.userData.gid !== 'stands');
    ray.far = Infinity;
    return !hit || hit.object.userData.gid === gid;
  };
  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, plane, composer, gtao, sun, resize, frame, project, pick, seen, size, setQuality};
}
