import {
  Component,
  Suspense,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Optional realistic brain model. Drop a permissively-licensed (CC0/public-domain)
 * brain at apps/learner-web/public/models/brain.glb and it renders with a glass
 * shader; if absent, the procedural brain is used. Nothing else changes.
 */
const MODEL_URL = '/models/brain.glb';
import type { SkillCluster } from '@mcat/contracts';
import type { BaseMasteryState } from '@mcat/domain';

/**
 * Interactive, region-segmented Evidence Atlas brain (WebGL).
 * Presentational only: it receives fully-resolved regions (cluster, title, mastery
 * state, 3D position) so wiring new content/mastery is a data change, never a scene
 * rewrite. The Skills list route is the accessible, keyboard-friendly equivalent.
 */
export interface AtlasRegion {
  cluster: SkillCluster;
  title: string;
  region: string;
  state: BaseMasteryState;
  position: [number, number, number];
}

interface DragState {
  dragging: boolean;
  lastX: number;
  lastY: number;
  x: number;
  y: number;
}

const GLOW_COLOR: Record<BaseMasteryState, string> = {
  not_assessed: '#8fa3ad',
  foundation_needed: '#e0a54a',
  learning: '#28d3c2',
  independent: '#4a9bf0',
  retained: '#a99bff',
  strong: '#37f0cf',
};
const GLOW_INTENSITY: Record<BaseMasteryState, number> = {
  not_assessed: 0.08,
  foundation_needed: 0.32,
  learning: 0.55,
  independent: 0.75,
  retained: 0.9,
  strong: 1,
};

/**
 * Internal light zones (model space) tuned to the reference: warm gold through the
 * centre, pink/magenta low-front, cyan at the back, lavender/blue up top. These
 * glow *through* the translucent shell to create the subsurface color the images
 * show. Front of the brain is +z; the default view faces right.
 */
const GLOW_BLOBS: { pos: [number, number, number]; color: string; size: number }[] = [
  { pos: [0, -0.05, 0.25], color: '#ffd98a', size: 1.15 }, // gold centre
  { pos: [-0.25, -0.5, 0.55], color: '#ff8ad0', size: 1.0 }, // pink low-front
  { pos: [0.05, 0.15, -0.95], color: '#8af0e0', size: 1.0 }, // cyan back
  { pos: [-0.2, 0.6, -0.1], color: '#c9a0ff', size: 0.85 }, // lavender top
  { pos: [0.25, 0.45, 0.65], color: '#a9d8ff', size: 0.85 }, // soft blue up-front
  { pos: [-0.55, -0.55, -0.9], color: '#ffb0e0', size: 0.7 }, // cerebellum blush
];

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

/**
 * Build an organic, gyri-folded blob with a baked pastel-iridescent vertex color
 * ramp (so the "glass brain" reads as colorful on any GPU, even software WebGL).
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
    // Flatten the underside a little for a more brain-like base.
    if (v.y < 0) v.y *= 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
    // Pastel-iridescent ramp from the curated reference palette (no green).
    setIridescent(c, n.x, n.y, n.z);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function useGlowTexture(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function RegionNode({
  r,
  glow,
  selected,
  interactive,
  onSelect,
}: {
  r: AtlasRegion;
  glow: THREE.Texture;
  selected: boolean;
  interactive: boolean;
  onSelect: (c: SkillCluster) => void;
}) {
  const [hover, setHover] = useState(false);
  const active = interactive && (hover || selected);
  const color = GLOW_COLOR[r.state];
  const inten = GLOW_INTENSITY[r.state];
  // Spread (rather than pass undefined) so exactOptionalPropertyTypes stays happy
  // and the decorative Home brain has no pointer affordances.
  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHover(false);
          document.body.style.cursor = '';
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(r.cluster);
        },
      }
    : {};
  return (
    <group position={r.position}>
      <mesh scale={active ? 1.7 : 1} {...handlers}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 3.2 : 1 + inten * 2}
          toneMapped={false}
        />
      </mesh>
      <sprite scale={(active ? 1.5 : 1) * (0.55 + inten * 0.7)}>
        <spriteMaterial
          map={glow}
          color={color}
          transparent
          opacity={active ? 0.95 : 0.3 + inten * 0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/** Soft, multicolored subsurface light + sparkle glints, matching the reference. */
function InternalGlow({ glow }: { glow: THREE.Texture }) {
  const sparkles = useMemo(() => {
    const pts: { pos: [number, number, number]; s: number }[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 22; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const r = 0.85 + rand() * 0.4;
      pts.push({
        pos: [
          Math.sin(phi) * Math.cos(theta) * r * 1.25,
          Math.cos(phi) * r * 0.95,
          Math.sin(phi) * Math.sin(theta) * r * 1.55,
        ],
        s: 0.12 + rand() * 0.16,
      });
    }
    return pts;
  }, []);

  return (
    <group>
      {GLOW_BLOBS.map((b, i) => (
        <group key={i} position={b.pos}>
          <mesh>
            <sphereGeometry args={[0.14 * b.size, 16, 16]} />
            <meshBasicMaterial color={b.color} toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <sprite scale={2.6 * b.size}>
            <spriteMaterial
              map={glow}
              color={b.color}
              transparent
              opacity={0.6}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}
      {sparkles.map((p, i) => (
        <sprite key={`s${i}`} position={p.pos} scale={p.s}>
          <spriteMaterial
            map={glow}
            color="#ffffff"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/**
 * The procedurally-generated brain. `opaque` makes it a solid, iridescent-surfaced
 * brain (Home hero); translucent keeps interior region nodes visible (Progress).
 */
function ProceduralBrain({ opaque }: { opaque: boolean }) {
  const cerebrum = useMemo(() => makeBlob(1.35, 24, [1.0, 0.92, 1.35], 0.14, true), []);
  const cerebellum = useMemo(() => makeBlob(0.52, 4, [1.2, 0.8, 1.0], 0.08, false), []);
  const side = opaque ? THREE.FrontSide : THREE.DoubleSide;
  return (
    <>
      {/* Cerebrum — iridescent surface (solid when opaque) */}
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
      {/* Cerebellum */}
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
      {/* Brainstem */}
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
 * Loads the real brain model, centers/scales it, and drapes it in the iridescent
 * color scheme (the model ships a plain placeholder material, so we bake our own
 * pastel ramp onto its geometry).
 */
function ModelBrain({ opaque }: { opaque: boolean }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const object = useMemo(() => {
    const scene = gltf.scene.clone(true);
    // The asset is authored lying on its side; stand it upright (brainstem down).
    scene.rotation.x = -Math.PI / 2;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 3.4 / maxDim;
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

/** Falls back to the procedural brain if the model is missing or fails to load. */
class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
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

function BrainForm({ opaque }: { opaque: boolean }) {
  // Progress (translucent) keeps the procedural brain so interior region nodes stay
  // visible/clickable; Home (opaque) uses the real model, falling back if it fails.
  if (!opaque) return <ProceduralBrain opaque={false} />;
  return (
    <ModelErrorBoundary fallback={<ProceduralBrain opaque />}>
      <Suspense fallback={<ProceduralBrain opaque />}>
        <ModelBrain opaque />
      </Suspense>
    </ModelErrorBoundary>
  );
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
  selected: SkillCluster | null;
  interactive: boolean;
  onSelect: (c: SkillCluster) => void;
  drag: MutableRefObject<DragState>;
}) {
  const group = useRef<THREE.Group>(null);
  const glow = useGlowTexture();
  const opaque = !interactive;

  useFrame((_, delta) => {
    const d = drag.current;
    if (!d.dragging && !reducedMotion) d.y += delta * 0.1;
    if (group.current) {
      group.current.rotation.y = d.y;
      group.current.rotation.x = d.x;
    }
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
        <BrainForm opaque={opaque} />
        {/* Inner luminance + subsurface glow only for the translucent (Progress) view. */}
        {!opaque ? (
          <>
            <mesh scale={0.86}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.32}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <InternalGlow glow={glow} />
          </>
        ) : null}
        {/* Skill-marker nodes only in the interactive (Progress) view; Home stays a clean glowing brain. */}
        {interactive
          ? regions.map((r) => (
              <RegionNode
                key={r.cluster}
                r={r}
                glow={glow}
                selected={selected === r.cluster}
                interactive={interactive}
                onSelect={onSelect}
              />
            ))
          : null}
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
  selected: SkillCluster | null;
  interactive?: boolean;
  onSelect: (c: SkillCluster) => void;
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
      <Canvas flat dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0, 5.2], fov: 42 }}>
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
