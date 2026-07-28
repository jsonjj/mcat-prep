import {
  Component,
  Suspense,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ATLAS_REGION_GROUPS,
  type AtlasBrainPart,
  type AtlasHemisphere,
} from '@mcat/contracts';
import { type BaseMasteryState } from '@mcat/domain';

/**
 * Optional realistic brain model. Ships at apps/learner-web/public/models/brain.glb
 * and renders with a glass shader; if it fails to load, the procedural brain is the
 * fallback. Nothing else changes.
 */
const MODEL_URL = '/models/brain.glb';

/**
 * Interactive, region-segmented Evidence Atlas brain (WebGL).
 *
 * The Progress view partitions the REAL brain mesh into the 15 anatomical
 * lesson-groups (see @mcat/contracts ATLAS_REGION_GROUPS): each region shows one
 * dot per lesson while in progress, and snaps to a solid glowing-green fill once
 * every lesson in it is mastered (dots coalesce inward). The Skills list route is
 * the accessible, keyboard-friendly equivalent.
 */
export interface AtlasRegionLessonState {
  id: string;
  title: string;
  state: BaseMasteryState;
  mastered: boolean;
  /** True when the lesson's prerequisites aren't met yet — the node reads grey. */
  locked: boolean;
  /** BKT P(L) 0..1 — drives the yellow→green node fade when unlocked. */
  pL: number;
}

export interface AtlasRegion {
  /** region_id, e.g. "R08". */
  id: string;
  name: string;
  brainPart: AtlasBrainPart;
  hemisphere: AtlasHemisphere;
  areaShare: number;
  lessons: AtlasRegionLessonState[];
  masteredCount: number;
  complete: boolean;
  /** Where a tap on this region navigates (cluster of the first incomplete lesson). */
  tapCluster: string;
}

interface DragState {
  dragging: boolean;
  lastX: number;
  lastY: number;
  x: number;
  y: number;
}

/** Solid completed-region fill (the "you built it" payoff) — green mass + inner glow. */
const FILL_COLOR = 0x3fb883;
const FILL_EMISSIVE = 0x2f9e6a;
const FILL_OPACITY = 0.9;

/**
 * 15-region anatomy anchors (ported from the design prototype). `dir` is the anchor
 * direction in brain-local front(+)/up(+)/right(+) space; `surf` is the radial
 * placement factor (1 = surface, small = deep). `interior` regions (central white
 * matter) render as deep glowing cores through the shell; `brainstem` is R15.
 */
const REGION_ANATOMY: Record<
  string,
  { dir: [number, number, number]; surf: number; interior?: boolean; brainstem?: boolean }
> = {
  R01: { dir: [0.85, 0.15, -0.55], surf: 0.96 },
  R02: { dir: [0.9, 0.35, 0.5], surf: 0.96 },
  R03: { dir: [0.78, -0.42, -0.42], surf: 0.92 },
  R04: { dir: [0.12, -0.42, -0.82], surf: 0.95 },
  R05: { dir: [-0.3, 0.55, -0.55], surf: 0.96 },
  R06: { dir: [-0.85, 0.05, -0.42], surf: 0.95 },
  R07: { dir: [-0.05, 0.82, 0.35], surf: 0.96 },
  R08: { dir: [-0.35, 0.46, 0.64], surf: 0.96 },
  R09: { dir: [-0.88, 0.1, 0.42], surf: 0.95 },
  R10: { dir: [-0.12, -0.48, 0.82], surf: 0.95 },
  R11: { dir: [-0.62, -0.72, 0.42], surf: 0.92 },
  R12: { dir: [-0.62, -0.72, -0.42], surf: 0.92 },
  R13: { dir: [0.05, 0.05, -0.4], surf: 0.4, interior: true },
  R14: { dir: [0.05, 0.12, 0.4], surf: 0.4, interior: true },
  R15: { dir: [-0.05, -0.9, 0.0], surf: 0.95, brainstem: true },
};

interface RegionMeta {
  id: string;
  count: number;
  areaShare: number;
  dir: [number, number, number];
  surf: number;
  interior: boolean;
  brainstem: boolean;
}

const REGIONS_META: RegionMeta[] = ATLAS_REGION_GROUPS.map((r) => {
  const a = REGION_ANATOMY[r.region_id] ?? { dir: [0, 1, 0] as [number, number, number], surf: 0.9 };
  return {
    id: r.region_id,
    count: r.lesson_count,
    areaShare: r.area_share,
    dir: a.dir,
    surf: a.surf,
    interior: !!a.interior,
    brainstem: !!a.brainstem,
  };
});
const CORTICAL_META = REGIONS_META.filter((r) => !r.interior && !r.brainstem);

const hash01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Farthest-point sampling: spread `k` picks across `points` for even dot coverage. */
function farthestPoints(points: THREE.Vector3[], k: number, startIndex = 0): number[] {
  if (points.length <= k) return points.map((_, i) => i);
  const first = startIndex % points.length;
  const chosen = [first];
  const dist = points.map((p) => p.distanceToSquared(points[first]!));
  while (chosen.length < k) {
    let bi = 0;
    let bd = -1;
    for (let i = 0; i < points.length; i++) if (dist[i]! > bd) { bd = dist[i]!; bi = i; }
    chosen.push(bi);
    for (let i = 0; i < points.length; i++) {
      const d = points[i]!.distanceToSquared(points[bi]!);
      if (d < dist[i]!) dist[i] = d;
    }
  }
  return chosen;
}

/**
 * Curated reference palette (gold -> pink -> lavender -> cyan and back), which
 * deliberately avoids green. `setIridescent` maps a vertex direction to a smooth
 * blend across it, so the surface reads pink/gold/cyan/lavender like the reference.
 */
const IRIDESCENT_PALETTE = [
  new THREE.Color('#ffd98a'),
  new THREE.Color('#ff8ad0'),
  new THREE.Color('#c9a0ff'),
  new THREE.Color('#8ae0f0'),
];

function setIridescent(col: THREE.Color, nx: number, ny: number, nz: number) {
  const t = (((Math.atan2(nz, nx) / (Math.PI * 2) + 0.5 + 0.14 * ny) % 1) + 1) % 1;
  const seg = t * IRIDESCENT_PALETTE.length;
  const i0 = Math.floor(seg) % IRIDESCENT_PALETTE.length;
  const i1 = (i0 + 1) % IRIDESCENT_PALETTE.length;
  col.copy(IRIDESCENT_PALETTE[i0]!).lerp(IRIDESCENT_PALETTE[i1]!, seg - Math.floor(seg));
}

/** Bakes the position-based iridescent color ramp onto an arbitrary geometry. */
function applyIridescentColors(geom: THREE.BufferGeometry) {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return;
  geom.computeBoundingBox();
  const bb = geom.boundingBox ?? new THREE.Box3();
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = (v.x - center.x) / (size.x || 1);
    const ny = (v.y - center.y) / (size.y || 1);
    const nz = (v.z - center.z) / (size.z || 1);
    setIridescent(col, nx, ny, nz);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Build an organic, gyri-folded blob with a baked pastel-iridescent vertex color
 * ramp — the procedural fallback used only if the real model fails to load.
 */
function makeBlob(
  radius: number,
  detail: number,
  scale: [number, number, number],
  amp: number,
  fissure: boolean,
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let r = v.length();
    let bump =
      amp * Math.sin(3.2 * v.x) * Math.cos(3.0 * v.y) +
      amp * 0.8 * Math.sin(3.6 * v.z + 0.5) * Math.cos(2.6 * v.x) +
      amp * 0.5 * Math.sin(5.0 * v.y + 1.1);
    if (fissure) bump -= amp * 1.2 * Math.exp(-(v.x * v.x) / 0.012) * Math.max(0, n.y);
    r += bump;
    v.copy(n).multiplyScalar(r);
    v.x *= scale[0];
    v.y *= scale[1];
    v.z *= scale[2];
    if (v.y < 0) v.y *= 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
    setIridescent(c, n.x, n.y, n.z);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The procedurally-generated brain. `opaque` makes it a solid, iridescent-surfaced
 * brain (Home hero); translucent is the Progress fallback if the model won't load.
 */
function ProceduralBrain({ opaque }: { opaque: boolean }) {
  const cerebrum = useMemo(() => makeBlob(1.35, 24, [1.0, 0.92, 1.35], 0.14, true), []);
  const cerebellum = useMemo(() => makeBlob(0.52, 4, [1.2, 0.8, 1.0], 0.08, false), []);
  const side = opaque ? THREE.FrontSide : THREE.DoubleSide;
  return (
    <>
      <mesh geometry={cerebrum}>
        <meshPhysicalMaterial
          vertexColors
          transparent={!opaque}
          opacity={opaque ? 1 : 0.55}
          roughness={0.22}
          metalness={0}
          iridescence={1}
          iridescenceIOR={1.35}
          iridescenceThicknessRange={[100, 600]}
          clearcoat={1}
          clearcoatRoughness={0.12}
          sheen={1}
          side={side}
        />
      </mesh>
      <mesh geometry={cerebellum} position={[0, -0.72, -1.05]}>
        <meshPhysicalMaterial
          vertexColors
          transparent={!opaque}
          opacity={opaque ? 1 : 0.5}
          roughness={0.28}
          metalness={0}
          clearcoat={1}
          side={side}
        />
      </mesh>
      <mesh position={[0, -1.18, -0.72]} rotation={[0.5, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 0.62, 18]} />
        <meshPhysicalMaterial
          color="#e7d6f0"
          transparent={!opaque}
          opacity={opaque ? 1 : 0.5}
          roughness={0.3}
          clearcoat={1}
        />
      </mesh>
    </>
  );
}

/** Standardize the loaded model into a centered, upright, unit-ish coordinate space. */
function normalizedModelScene(gltf: GLTF): { scene: THREE.Object3D; scale: number; center: THREE.Vector3 } {
  const scene = gltf.scene.clone(true);
  scene.rotation.x = -Math.PI / 2; // asset is authored on its side; stand it upright
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 3.4 / maxDim;
  return { scene, scale, center };
}

/**
 * Loads the real brain model, centers/scales it, and drapes it in the iridescent
 * color scheme. Used for the opaque Home hero (a clean glowing brain).
 */
function ModelBrain({ opaque }: { opaque: boolean }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const object = useMemo(() => {
    const { scene, scale, center } = normalizedModelScene(gltf);
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: !opaque,
      opacity: opaque ? 1 : 0.5,
      roughness: 0.22,
      metalness: 0,
      iridescence: 1,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [100, 600],
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 1,
      side: opaque ? THREE.FrontSide : THREE.DoubleSide,
    });
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      applyIridescentColors(mesh.geometry as THREE.BufferGeometry);
      mesh.material = material;
    });
    return scene;
  }, [gltf, opaque]);
  return <primitive object={object} />;
}

interface RegionGeom {
  id: string;
  interior: boolean;
  count: number;
  fillGeometry: THREE.BufferGeometry | null; // null for interior (rendered as a core)
  center: THREE.Vector3;
  radius: number;
  dots: THREE.Vector3[];
  /** Surface handle point for interior white-matter regions (their tap target). */
  handle: THREE.Vector3 | null;
}
interface AtlasGeom {
  shell: THREE.BufferGeometry;
  regions: RegionGeom[];
  centroid: THREE.Vector3;
  radius: number;
}

/**
 * Bake the loaded model into ONE render-space geometry, then partition its surface
 * into the 15 regions (R15 pre-claims the underside/brainstem + central
 * sensorimotor band; the 12 cortical regions split the rest by area-weighted
 * nearest anchor; the 2 white-matter regions are deep interior cores). Produces the
 * translucent shell geometry, a solid-fill submesh per surface region, and one dot
 * position per lesson.
 */
function buildAtlasGeometry(gltf: GLTF): AtlasGeom {
  const { scene, scale, center } = normalizedModelScene(gltf);
  const pos: number[] = [];
  const nor: number[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const src = mesh.geometry as THREE.BufferGeometry;
    const gi = src.index ? src.toNonIndexed() : src.clone();
    gi.applyMatrix4(mesh.matrixWorld); // bake the upright rotation into positions + normals
    const p = gi.getAttribute('position') as THREE.BufferAttribute;
    let n = gi.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!n) {
      gi.computeVertexNormals();
      n = gi.getAttribute('normal') as THREE.BufferAttribute;
    }
    for (let i = 0; i < p.count; i++) {
      pos.push((p.getX(i) - center.x) * scale, (p.getY(i) - center.y) * scale, (p.getZ(i) - center.z) * scale);
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    gi.dispose();
  });

  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  applyIridescentColors(shell);

  const v = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const vertCount = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) centroid.add(v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!));
  centroid.multiplyScalar(1 / vertCount);
  const sbox = new THREE.Box3();
  let radius = 0;
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!);
    sbox.expandByPoint(v);
    radius = Math.max(radius, v.distanceTo(centroid));
  }
  const ext = sbox.getSize(new THREE.Vector3());
  const U = new THREE.Vector3(0, 1, 0);
  const F = ext.x >= ext.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const S = new THREE.Vector3().crossVectors(F, U).normalize();

  const anchor: Record<string, THREE.Vector3> = {};
  for (const r of REGIONS_META) {
    anchor[r.id] = new THREE.Vector3()
      .addScaledVector(F, r.dir[0])
      .addScaledVector(U, r.dir[1])
      .addScaledVector(S, r.dir[2])
      .normalize();
  }

  const triCount = (vertCount / 3) | 0;
  const triDir: THREE.Vector3[] = new Array(triCount);
  const triCen: THREE.Vector3[] = new Array(triCount);
  const triArea = new Float32Array(triCount);
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    a3.set(pos[o]!, pos[o + 1]!, pos[o + 2]!);
    b3.set(pos[o + 3]!, pos[o + 4]!, pos[o + 5]!);
    c3.set(pos[o + 6]!, pos[o + 7]!, pos[o + 8]!);
    const cen = new THREE.Vector3().addVectors(a3, b3).add(c3).multiplyScalar(1 / 3);
    triCen[t] = cen;
    triDir[t] = cen.clone().sub(centroid).normalize();
    triArea[t] = e1.subVectors(b3, a3).cross(e2.subVectors(c3, a3)).length() * 0.5;
  }

  const BAND = 0.06; // R15 sensorimotor band half-width (front-back component)
  const UBRAIN = -0.66; // below this up-component + central -> brainstem stalk -> R15
  const BRAIN_S = 0.5; // brainstem lateral limit (keeps the stalk central)
  const cortWeight: Record<string, number> = {};
  for (const r of CORTICAL_META) cortWeight[r.id] = 0;
  const regionOfDir = (dir: THREE.Vector3): string => {
    const u = dir.dot(U);
    const f = dir.dot(F);
    const s = dir.dot(S);
    if (u < UBRAIN && Math.abs(s) < BRAIN_S) return 'R15';
    if (Math.abs(f) < BAND && u > 0.1) return 'R15';
    let best = CORTICAL_META[0]!.id;
    let bestSc = -Infinity;
    for (const r of CORTICAL_META) {
      const sc = dir.dot(anchor[r.id]!) + (cortWeight[r.id] ?? 0);
      if (sc > bestSc) {
        bestSc = sc;
        best = r.id;
      }
    }
    return best;
  };

  // Lloyd-style area balancing so each cortical region's surface share ~ area_share.
  const sumShare = CORTICAL_META.reduce((s, r) => s + r.areaShare, 0);
  for (let it = 0; it < 10; it++) {
    const areaBy: Record<string, number> = {};
    for (const r of CORTICAL_META) areaBy[r.id] = 0;
    let tot = 0;
    for (let t = 0; t < triCount; t++) {
      const rid = regionOfDir(triDir[t]!);
      if (areaBy[rid] !== undefined) {
        areaBy[rid] += triArea[t]!;
        tot += triArea[t]!;
      }
    }
    if (tot <= 0) break;
    for (const r of CORTICAL_META) {
      cortWeight[r.id] = (cortWeight[r.id] ?? 0) + 0.6 * (r.areaShare / sumShare - (areaBy[r.id] ?? 0) / tot);
    }
  }

  const fillPos: Record<string, number[]> = {};
  const fillNor: Record<string, number[]> = {};
  const surfBy: Record<string, THREE.Vector3[]> = {};
  for (const r of REGIONS_META) {
    surfBy[r.id] = [];
    if (!r.interior) {
      fillPos[r.id] = [];
      fillNor[r.id] = [];
    }
  }
  const o3 = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const rid = regionOfDir(triDir[t]!);
    surfBy[rid]!.push(triCen[t]!);
    const fp = fillPos[rid];
    if (!fp) continue; // interior region: no surface submesh
    const fn = fillNor[rid]!;
    const base = t * 9;
    for (let k = 0; k < 3; k++) {
      const idx = base + k * 3;
      o3.set(pos[idx]!, pos[idx + 1]!, pos[idx + 2]!).sub(centroid).multiplyScalar(1.006).add(centroid);
      fp.push(o3.x, o3.y, o3.z);
      fn.push(nor[idx]!, nor[idx + 1]!, nor[idx + 2]!);
    }
  }

  const regions: RegionGeom[] = REGIONS_META.map((r) => {
    const dots: THREE.Vector3[] = [];
    if (r.interior) {
      const base = centroid.clone().addScaledVector(anchor[r.id]!, radius * r.surf);
      for (let k = 0; k < r.count; k++) {
        const jit = new THREE.Vector3(
          hash01(r.id.length + k) - 0.5,
          hash01(k * 3 + 5) - 0.5,
          hash01(k * 5 + 2) - 0.5,
        ).multiplyScalar(radius * 0.26);
        dots.push(base.clone().add(jit));
      }
    } else {
      const pts = surfBy[r.id]!.length
        ? surfBy[r.id]!
        : [centroid.clone().addScaledVector(anchor[r.id]!, radius)];
      const idxs = farthestPoints(pts, r.count, r.id.length * 131);
      const chosen = idxs
        .map((i) => pts[i]!)
        .sort((x, y) => x.distanceTo(centroid) - y.distanceTo(centroid));
      for (let k = 0; k < r.count; k++) {
        const sp = chosen[k % chosen.length]!;
        const jit = new THREE.Vector3(
          hash01(k) - 0.5,
          hash01(k * 3 + 7) - 0.5,
          hash01(k * 5 + 2) - 0.5,
        ).multiplyScalar(radius * 0.03);
        dots.push(centroid.clone().add(sp.clone().sub(centroid).multiplyScalar(r.surf)).add(jit));
      }
    }
    const cen = new THREE.Vector3();
    for (const d of dots) cen.add(d);
    cen.multiplyScalar(1 / Math.max(1, dots.length));
    let rad = 0;
    for (const d of dots) rad = Math.max(rad, d.distanceTo(cen));
    rad = Math.max(rad, radius * 0.18);
    // Interior white-matter regions have no surface; give them a surface handle
    // (just outside the shell along their anchor) so they remain tappable.
    const handle = r.interior
      ? centroid.clone().addScaledVector(anchor[r.id]!, radius * 1.02)
      : null;
    let fillGeometry: THREE.BufferGeometry | null = null;
    if (!r.interior) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(fillPos[r.id]!, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(fillNor[r.id]!, 3));
      fillGeometry = g;
    }
    return { id: r.id, interior: r.interior, count: r.count, fillGeometry, center: cen, radius: rad, dots, handle };
  });

  return { shell, regions, centroid, radius };
}

/** Tiny soft radial-gradient texture used for the small colored node rim-glow. */
function useGlowTexture(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// Node color scale: LOCKED lessons read grey (no glow); UNLOCKED lessons fade from
// yellow (just unlocked, no mastery yet) to green (mastered) by their BKT P(L). The
// prior and mastery cut mirror the engine (P(L)_0 = 0.2, threshold = 0.95).
const NODE_PRIOR_PL = 0.2;
const NODE_MASTERY_PL = 0.95;
const NODE_GREY = '#b6b2c4';
const NODE_YELLOW = new THREE.Color('#f2c14e');
const NODE_GREEN = new THREE.Color('#33b87e');
const NODE_GREY_COLOR = new THREE.Color(NODE_GREY);

// On-open reveal (Progress brain only): on each mount, every node starts grey and
// ramps up to its target — UNLOCKED nodes grey → yellow → (target), MASTERED nodes
// continuing on to green (they visibly pass THROUGH yellow first); LOCKED nodes stay
// grey. Regions/nodes stagger so the build-up cascades over ~1.8–2.4s. Driven
// imperatively (material/scale mutation in useFrame) — no per-frame React renders.
const REVEAL_NODE_RAMP = 0.55; // seconds each node takes to ramp grey → target
const REVEAL_REGION_SPREAD = 0.7; // seconds spread of region start times (the cascade)
const REVEAL_NODE_SPREAD = 0.28; // seconds spread of node start times within a region
const REVEAL_FILL_GATE = 0.9; // a region's nodes must be ~this revealed before its fill starts
const REVEAL_START_OPACITY = 0.45; // grey start dot opacity (matches the locked base dot)
const REVEAL_START_SCALE = 0.9; // grey start dot scale (matches the locked base dot)

// As a completed region's green fill rises, its per-lesson nodes must fade OUT in
// lockstep — not merely shrink — so neither the matte dot cores nor their additive,
// depth-write-disabled glow sprites can bleed through / poke over the solid fill.
// Nodes are provably gone (opacity 0 AND the whole dots group hidden) by the time
// the fill is FILL_HIDE_NODES of the way in, for BOTH cortical and interior regions.
const FILL_FADE_NODES_START = 0.15; // fill fraction where nodes begin fading out
const FILL_HIDE_NODES = 0.82; // fill fraction by which nodes are fully invisible

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Reveal color for a node at achieved `a` (0..1): LOCKED stays grey throughout;
 * UNLOCKED goes grey → yellow across the first half, then yellow → its final target
 * across the second half, so a mastered node visibly passes THROUGH yellow before it
 * settles green. Writes into `out` (a live material color) to avoid allocations.
 */
function revealNodeColor(a: number, locked: boolean, target: THREE.Color, out: THREE.Color): void {
  if (locked) {
    out.copy(NODE_GREY_COLOR);
    return;
  }
  if (a <= 0.5) out.copy(NODE_GREY_COLOR).lerp(NODE_YELLOW, a / 0.5);
  else out.copy(NODE_YELLOW).lerp(target, (a - 0.5) / 0.5);
}

/**
 * Per-lesson node styling — matte base dot + a SMALL colored rim-glow so nodes stand
 * out (never the old blown-out white halo). LOCKED lessons stay grey with NO glow;
 * UNLOCKED lessons fade yellow→green by mastery (`pL`): more mastery, more green.
 * `glow` is the halo opacity (0 = none).
 */
function dotStyle(node: {
  locked: boolean;
  pL: number;
}): { color: string; opacity: number; scale: number; glow: number } {
  if (node.locked) return { color: NODE_GREY, opacity: 0.45, scale: 0.9, glow: 0 };
  const t = Math.max(0, Math.min(1, (node.pL - NODE_PRIOR_PL) / (NODE_MASTERY_PL - NODE_PRIOR_PL)));
  const color = `#${NODE_YELLOW.clone().lerp(NODE_GREEN, t).getHexString()}`;
  return { color, opacity: 0.9 + 0.06 * t, scale: 1.0 + 0.12 * t, glow: 0.55 + 0.2 * t };
}

/**
 * One region: matte per-lesson nodes (colored by mastery, each with a SMALL colored
 * rim-glow so it stands out — not the old white bloom) plus the solid green
 * completion fill. Nodes coalesce inward and fade as the region fills (cortical /
 * brainstem = surface submesh, white-matter = deep core). The fill mesh (or an
 * interior handle) is the tap target; nodes are visual only.
 */
function RegionVisual({
  geom,
  region,
  selected,
  interactive,
  reducedMotion,
  coreGeo,
  glowTex,
  modelRadius,
  revealStart,
  revealIndex,
  revealTotal,
  onSelect,
}: {
  geom: RegionGeom;
  region: AtlasRegion;
  selected: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  coreGeo: THREE.BufferGeometry;
  glowTex: THREE.Texture;
  modelRadius: number;
  /** Shared reveal-clock origin; the first atlas frame stamps it (see RegionAtlasBrain). */
  revealStart: MutableRefObject<number | null>;
  /** This region's position in the reveal cascade, and the region count, for stagger. */
  revealIndex: number;
  revealTotal: number;
  onSelect: (id: string) => void;
}) {
  const fillRef = useRef<THREE.Mesh>(null);
  const dotsRef = useRef<THREE.Group>(null);
  // Fill starts empty every mount (even for already-complete regions) so its green
  // only animates in AFTER this region's nodes have revealed (grey → yellow → green).
  const fillNow = useRef(0);
  const coreR = modelRadius * 0.02;

  // Per-node refs (group + core/glow materials) so the reveal is driven imperatively.
  const nodeGroups = useRef<Array<THREE.Group | null>>([]);
  const coreMats = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const glowMats = useRef<Array<THREE.SpriteMaterial | null>>([]);

  // Per-node target style (at full reveal) + a staggered start delay. The region's
  // base delay spreads the cascade across regions; a small per-node delay ripples
  // within the region. Targets come straight from the existing declarative dotStyle.
  const nodes = useMemo(() => {
    const count = geom.dots.length;
    const regionBase =
      revealTotal > 1 ? (revealIndex / (revealTotal - 1)) * REVEAL_REGION_SPREAD : 0;
    return geom.dots.map((d, k) => {
      const lesson = region.lessons[k];
      const src = lesson ? { locked: lesson.locked, pL: lesson.pL } : { locked: true, pL: 0 };
      const st = dotStyle(src);
      const nodeStagger = count > 1 ? (k / (count - 1)) * REVEAL_NODE_SPREAD : 0;
      return {
        position: [d.x - geom.center.x, d.y - geom.center.y, d.z - geom.center.z] as [
          number,
          number,
          number,
        ],
        locked: src.locked,
        target: st,
        targetColor: new THREE.Color(st.color),
        delay: regionBase + nodeStagger,
      };
    });
  }, [geom.dots, geom.center, region.lessons, revealIndex, revealTotal]);

  const interiorCore = useMemo(() => {
    if (!geom.interior) return null;
    const g = new THREE.SphereGeometry(modelRadius * (0.32 + 0.02 * geom.count), 20, 20);
    g.scale(1.25, 0.85, 0.8);
    return g;
  }, [geom.interior, geom.count, modelRadius]);

  useFrame((state, dt) => {
    // Stamp the shared reveal origin on the first atlas frame; every region reads the
    // same origin so the cascade is coherent and it replays on each fresh mount.
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;

    // Per-node reveal: ramp each node's "achieved" 0→1 over its window, then mutate
    // its core dot + glow color/opacity and node scale from grey up to the target.
    let minAchieved = 1;
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k]!;
      const a = reducedMotion ? 1 : smoothstep(clamp01((elapsed - n.delay) / REVEAL_NODE_RAMP));
      if (a < minAchieved) minAchieved = a;
      const g = nodeGroups.current[k];
      if (g) g.scale.setScalar(lerpN(REVEAL_START_SCALE, n.target.scale, a));
      const cm = coreMats.current[k];
      if (cm) {
        revealNodeColor(a, n.locked, n.targetColor, cm.color);
        cm.opacity = lerpN(REVEAL_START_OPACITY, n.target.opacity, a);
      }
      const gm = glowMats.current[k];
      if (gm) {
        revealNodeColor(a, n.locked, n.targetColor, gm.color);
        gm.opacity = lerpN(0, n.target.glow, a);
      }
    }

    // Completion fill, GATED: only begin once this region's nodes are essentially
    // revealed, so the section never fills green before its dots have gone through
    // grey → yellow → green. (Non-complete regions never fill; target stays 0.)
    const nodesRevealed = reducedMotion || minAchieved >= REVEAL_FILL_GATE;
    const target = region.complete && nodesRevealed ? 1 : 0;
    const rate = reducedMotion ? 1 : Math.min(1, dt * 5);
    let nv = fillNow.current + (target - fillNow.current) * rate;
    if (Math.abs(target - nv) < 0.004) nv = target;
    fillNow.current = nv;
    const fm = fillRef.current;
    if (fm) {
      // Interior cores only appear once filling; cortical fills stay mounted
      // (opacity 0 when empty) so the whole region surface remains a tap target.
      if (geom.interior) fm.visible = nv > 0.01;
      (fm.material as THREE.MeshStandardMaterial).opacity = nv * FILL_OPACITY;
    }

    // Fade the nodes OUT as this region's own fill rises — overriding the reveal
    // opacities set above — so a completed region's dot cores and additive glow
    // sprites can't bleed through its solid green fill. Incomplete regions keep
    // nv === 0, so nodeFade stays 1 and their nodes render exactly as before.
    const nodeFade =
      1 -
      smoothstep(clamp01((nv - FILL_FADE_NODES_START) / (FILL_HIDE_NODES - FILL_FADE_NODES_START)));
    if (nodeFade < 1) {
      for (let k = 0; k < nodes.length; k++) {
        const cm = coreMats.current[k];
        if (cm) cm.opacity *= nodeFade;
        const gm = glowMats.current[k];
        if (gm) gm.opacity *= nodeFade;
      }
    }
    const dg = dotsRef.current;
    if (dg) {
      // Nodes coalesce toward the region centre + shrink away as the fill takes
      // over, then hard-hide once fully faded so nothing can z-fight through it.
      dg.scale.setScalar(Math.max(0.0001, 1 - nv));
      dg.visible = nv < FILL_HIDE_NODES;
    }
  });

  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(region.id);
        },
      }
    : {};

  const emissive = selected ? 0.7 : geom.interior ? 0.45 : 0.38;

  return (
    <group>
      {/* Per-lesson nodes: matte dot + a small colored rim-glow (unlocked only). The
          initial JSX values are the grey reveal start (or the final target when
          reducedMotion); useFrame then owns color/opacity/scale from frame one. */}
      <group ref={dotsRef} position={geom.center} visible={reducedMotion ? !region.complete : true}>
        {nodes.map((n, k) => {
          const initColor = reducedMotion ? n.target.color : NODE_GREY;
          const initOpacity = reducedMotion ? n.target.opacity : REVEAL_START_OPACITY;
          const initScale = reducedMotion ? n.target.scale : REVEAL_START_SCALE;
          const initGlow = reducedMotion ? n.target.glow : 0;
          return (
            <group
              key={k}
              ref={(el: THREE.Group | null) => {
                nodeGroups.current[k] = el;
              }}
              position={n.position}
              scale={initScale}
            >
              <mesh geometry={coreGeo} scale={coreR} renderOrder={2}>
                <meshBasicMaterial
                  ref={(m: THREE.MeshBasicMaterial | null) => {
                    coreMats.current[k] = m;
                  }}
                  color={initColor}
                  transparent
                  opacity={initOpacity}
                  depthWrite={false}
                />
              </mesh>
              {n.target.glow > 0 ? (
                <sprite scale={coreR * 4.2} renderOrder={1.9}>
                  <spriteMaterial
                    ref={(m: THREE.SpriteMaterial | null) => {
                      glowMats.current[k] = m;
                    }}
                    map={glowTex}
                    color={initColor}
                    transparent
                    opacity={initGlow}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                  />
                </sprite>
              ) : null}
            </group>
          );
        })}
      </group>

      {/* Solid green completion fill: surface submesh (cortical/brainstem) or deep core. */}
      {geom.interior ? (
        <mesh
          ref={fillRef}
          geometry={interiorCore!}
          position={geom.center}
          visible={reducedMotion ? region.complete : false}
          renderOrder={1.15}
        >
          <meshStandardMaterial
            color={FILL_COLOR}
            emissive={FILL_EMISSIVE}
            emissiveIntensity={emissive}
            roughness={0.5}
            metalness={0}
            transparent
            opacity={reducedMotion && region.complete ? FILL_OPACITY : 0}
            depthWrite={false}
          />
        </mesh>
      ) : (
        <mesh ref={fillRef} geometry={geom.fillGeometry!} renderOrder={1.2} {...handlers}>
          <meshStandardMaterial
            color={FILL_COLOR}
            emissive={FILL_EMISSIVE}
            emissiveIntensity={emissive}
            roughness={0.45}
            metalness={0}
            transparent
            opacity={reducedMotion && region.complete ? FILL_OPACITY : 0}
            side={THREE.FrontSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Invisible surface handle so deep white-matter regions stay tappable. */}
      {geom.interior && geom.handle ? (
        <mesh geometry={coreGeo} position={geom.handle} scale={modelRadius * 0.24} {...handlers}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * The Progress brain: the real translucent model, partitioned into the 15
 * lesson-group regions with per-lesson dots + solid green completion fills.
 */
function RegionAtlasBrain({
  regions,
  selected,
  reducedMotion,
  onSelect,
}: {
  regions: AtlasRegion[];
  selected: string | null;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const geom = useMemo(() => buildAtlasGeometry(gltf), [gltf]);
  const shellMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        roughness: 0.22,
        metalness: 0,
        iridescence: 1,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [100, 600],
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        sheen: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const coreGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const glowTex = useGlowTexture();
  const geomById = useMemo(
    () => new Map(geom.regions.map((g) => [g.id, g])),
    [geom],
  );
  // Origin of the on-open reveal clock. Null until the first frame the atlas renders
  // (the model is loaded by then, since useLoader suspends above); the first region's
  // useFrame stamps it and all regions share it, so the cascade replays on each mount.
  const revealStart = useRef<number | null>(null);

  return (
    <group>
      <mesh geometry={geom.shell} material={shellMat} />
      {regions.map((r, i) => {
        const g = geomById.get(r.id);
        if (!g) return null;
        return (
          <RegionVisual
            key={r.id}
            geom={g}
            region={r}
            selected={selected === r.id}
            interactive
            reducedMotion={reducedMotion}
            coreGeo={coreGeo}
            glowTex={glowTex}
            modelRadius={geom.radius}
            revealStart={revealStart}
            revealIndex={i}
            revealTotal={regions.length}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
}

/** Falls back to the procedural brain if the model is missing or fails to load. */
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Scene({
  regions,
  reducedMotion,
  selected,
  interactive,
  onSelect,
  drag,
}: {
  regions: AtlasRegion[];
  reducedMotion: boolean;
  selected: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  drag: MutableRefObject<DragState>;
}) {
  const group = useRef<THREE.Group>(null);
  const opaque = !interactive;

  // Adaptive exposure: as the brain fills green, ease exposure down so 100% never
  // blows out (ACES tone-mapping keeps highlights controlled the rest of the time).
  const fillFraction = useMemo(() => {
    if (!interactive || regions.length === 0) return 0;
    let m = 0;
    let t = 0;
    for (const r of regions) {
      m += r.masteredCount;
      t += r.lessons.length;
    }
    return t ? m / t : 0;
  }, [regions, interactive]);

  useFrame((state, delta) => {
    const d = drag.current;
    if (!d.dragging && !reducedMotion) d.y += delta * 0.1;
    if (group.current) {
      group.current.rotation.y = d.y;
      group.current.rotation.x = d.x;
    }
    // Calmer base exposure keeps the empty/low-progress brain from washing out, and
    // eases down further as it fills so 100% green never blows out.
    if (interactive) state.gl.toneMappingExposure = 0.94 - 0.24 * fillFraction;
  });

  return (
    <>
      <hemisphereLight args={['#ffffff', '#f2ecff', 0.55]} />
      <ambientLight intensity={0.7} />
      <pointLight position={[4, 3, 5]} intensity={1.5} decay={0} color="#ffd6ee" />
      <pointLight position={[-4, 2, -3]} intensity={1.2} decay={0} color="#c6f0ff" />
      <pointLight position={[0, -4, 2]} intensity={0.9} decay={0} color="#fff0c8" />
      <pointLight position={[0, 4, -2]} intensity={0.7} decay={0} color="#e2d4ff" />
      <group ref={group}>
        {opaque ? (
          <ModelErrorBoundary fallback={<ProceduralBrain opaque />}>
            <Suspense fallback={<ProceduralBrain opaque />}>
              <ModelBrain opaque />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          <ModelErrorBoundary fallback={<ProceduralBrain opaque={false} />}>
            <Suspense fallback={<ProceduralBrain opaque={false} />}>
              <RegionAtlasBrain
                regions={regions}
                selected={selected}
                reducedMotion={reducedMotion}
                onSelect={onSelect}
              />
            </Suspense>
          </ModelErrorBoundary>
        )}
      </group>
    </>
  );
}

export default function BrainScene({
  regions,
  reducedMotion,
  selected,
  interactive = true,
  onSelect,
}: {
  regions: AtlasRegion[];
  reducedMotion: boolean;
  selected: string | null;
  interactive?: boolean;
  onSelect: (id: string) => void;
}) {
  // Default to the recognizable side profile (front of the brain to the right).
  const drag = useRef<DragState>({ dragging: false, lastX: 0, lastY: 0, x: 0.12, y: Math.PI / 2 });

  return (
    <div
      className="mc-atlas__canvas"
      onPointerDown={(e) => {
        drag.current.dragging = true;
        drag.current.lastX = e.clientX;
        drag.current.lastY = e.clientY;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.dragging) return;
        d.y += (e.clientX - d.lastX) * 0.008;
        d.x += (e.clientY - d.lastY) * 0.008;
        d.x = Math.max(-0.6, Math.min(0.6, d.x));
        d.lastX = e.clientX;
        d.lastY = e.clientY;
      }}
      onPointerUp={() => {
        drag.current.dragging = false;
      }}
      onPointerLeave={() => {
        drag.current.dragging = false;
        document.body.style.cursor = '';
      }}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          toneMapping: interactive ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
          toneMappingExposure: 1,
        }}
        camera={{ position: [0, 0, 5.2], fov: 42 }}
      >
        <Scene
          regions={regions}
          reducedMotion={reducedMotion}
          selected={selected}
          interactive={interactive}
          onSelect={onSelect}
          drag={drag}
        />
      </Canvas>
    </div>
  );
}
