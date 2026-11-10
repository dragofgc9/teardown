// The 330e's stage: a pale studio, a soft shadow on an invisible floor, a road that scrolls under the car at road speed.
// frame(cam) draws one frame; pick(x, y) returns the part under a point of the 1600 x 900 layout.
import * as THREE from 'three';
import {buildCar} from './car.js';

const V3 = THREE.Vector3;
export const BG = {top: '#f3f3f4', mid: '#e9eaec', low: '#e0e1e4'};

export function createStage({canvas, mobile = false}) {
  // phones skip MSAA: the pixel ratio does the smoothing and the fill rate matters more
  const renderer = new THREE.WebGLRenderer({canvas, antialias: !mobile, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, BG.top);
    gr.addColorStop(0.55, BG.mid);
    gr.addColorStop(1, BG.low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.05, 80);

  // a bright studio for the metal to read
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#d6d8db');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.6);
    box(3, 14, new V3(-12, 4, 6), 3.2);
    box(3, 14, new V3(12, 4, -4), 2.2);
    box(18, 2, new V3(0, 2, 14), 1.6);
    box(14, 3, new V3(0, 3, -13), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#c4c6c9', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-3.2, 7, 4.5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -4.2, right: 4.2, top: 4.2, bottom: -4.2, near: 1, far: 20});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd0d3', 0.6));

  // floor: shadow only, plus a road that scrolls
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({color: '#59606a', opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);
  const roadTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(95,102,112,0.55)';
    g.fillRect(118, 0, 20, 112);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();
  roadTex.repeat.set(1, 6);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 36),
    new THREE.MeshBasicMaterial({map: roadTex, transparent: true, depthWrite: false, opacity: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.002, 0);
  scene.add(road);
  const road2 = road.clone();
  road2.position.x = 3.2;
  road2.material = road.material;
  const road3 = road.clone();
  road3.position.x = -3.2;
  road3.material = road.material;
  scene.add(road2, road3);

  // when real shadows are off (phones), a soft blob under the car keeps it on the ground
  const blob = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(70,76,86,.42)');
    gr.addColorStop(0.55, 'rgba(70,76,86,.2)');
    gr.addColorStop(1, 'rgba(70,76,86,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.5), new THREE.MeshBasicMaterial({map: t, transparent: true, depthWrite: false}));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    m.rotation.z = Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return m;
  })();

  const car = buildCar();
  scene.add(car.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  // cam: target, azimuth from +z toward +x, elevation, distance, screen shift in layout pixels
  const frame = (cam, dist, roadOn) => {
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    roadTex.offset.y = -(dist / 6) % 1;
    road.material.opacity += ((roadOn ? 0.5 : 0) - road.material.opacity) * 0.1;
    renderer.render(scene, camera);
  };
  const pv = new V3();
  const project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const ray = new THREE.Raycaster();
  const pick = (x, y) => {
    ray.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1), camera);
    const hits = ray.intersectObjects(car.pickables, false);
    for (const h of hits) {
      const p = h.object.userData.part;
      if (!p.obj.visible || p.fade < 0.35) continue;
      return p;
    }
    return null;
  };
  let shadowsOn = true;
  const setQuality = ({shadow}) => {
    if (shadow === undefined) return;
    const on = shadow > 0;
    if (on) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    if (on !== shadowsOn) {
      shadowsOn = on;
      sun.castShadow = on;
      renderer.shadowMap.enabled = on;
      shade.visible = on;
      blob.visible = !on;
      scene.traverse((o) => {
        const m = o.material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
  };
  // narrow screens need a wider lens to keep the car in frame
  const setFov = (f) => {
    if (camera.fov !== f) {
      camera.fov = f;
      camera.updateProjectionMatrix();
    }
  };
  return {renderer, scene, camera, car, sun, resize, frame, project, pick, size, setQuality, setFov};
}
