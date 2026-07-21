import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
    // Pastel iridescent ramp: hue sweeps around the vertical axis with a lift by height.
    const hue = (((Math.atan2(n.z, n.x) / (Math.PI * 2) + 0.5 + 0.14 * n.y) % 1) + 1) % 1;
    c.setHSL(hue, 0.62, 0.72);
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
  onSelect,
}: {
  r: AtlasRegion;
  glow: THREE.Texture;
  selected: boolean;
  onSelect: (c: SkillCluster) => void;
}) {
  const [hover, setHover] = useState(false);
  const active = hover || selected;
  const color = GLOW_COLOR[r.state];
  const inten = GLOW_INTENSITY[r.state];
  return (
    <group position={r.position}>
      <mesh
        scale={active ? 1.7 : 1}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(r.cluster);
        }}
      >
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

function Scene({
  regions,
  reducedMotion,
  selected,
  onSelect,
  drag,
}: {
  regions: AtlasRegion[];
  reducedMotion: boolean;
  selected: SkillCluster | null;
  onSelect: (c: SkillCluster) => void;
  drag: MutableRefObject<DragState>;
}) {
  const group = useRef<THREE.Group>(null);
  const cerebrum = useMemo(() => makeBlob(1.35, 24, [1.0, 0.92, 1.35], 0.14, true), []);
  const cerebellum = useMemo(() => makeBlob(0.52, 4, [1.2, 0.8, 1.0], 0.08, false), []);
  const glow = useGlowTexture();

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
      <ambientLight intensity={0.95} />
      <pointLight position={[4, 3, 5]} intensity={1.8} decay={0} color="#ffcfe8" />
      <pointLight position={[-4, 2, -3]} intensity={1.5} decay={0} color="#b6ecff" />
      <pointLight position={[0, -4, 2]} intensity={1.1} decay={0} color="#ffeab0" />
      <pointLight position={[0, 4, -2]} intensity={0.8} decay={0} color="#d9c7ff" />
      <group ref={group}>
        {/* Cerebrum */}
        <mesh geometry={cerebrum}>
          <meshPhysicalMaterial
            vertexColors
            transparent
            opacity={0.66}
            roughness={0.1}
            metalness={0}
            iridescence={1}
            iridescenceIOR={1.7}
            clearcoat={1}
            clearcoatRoughness={0.15}
            sheen={1}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Cerebellum */}
        <mesh geometry={cerebellum} position={[0, -0.72, -1.05]}>
          <meshPhysicalMaterial
            vertexColors
            transparent
            opacity={0.5}
            roughness={0.16}
            metalness={0}
            clearcoat={1}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Brainstem */}
        <mesh position={[0, -1.18, -0.72]} rotation={[0.5, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.2, 0.62, 18]} />
          <meshPhysicalMaterial
            color="#e7edff"
            transparent
            opacity={0.5}
            roughness={0.2}
            clearcoat={1}
          />
        </mesh>
        {/* Inner luminance */}
        <mesh scale={0.8}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial
            color="#fbe9ff"
            transparent
            opacity={0.28}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {regions.map((r) => (
          <RegionNode
            key={r.cluster}
            r={r}
            glow={glow}
            selected={selected === r.cluster}
            onSelect={onSelect}
          />
        ))}
      </group>
    </>
  );
}

export default function BrainScene({
  regions,
  reducedMotion,
  selected,
  onSelect,
}: {
  regions: AtlasRegion[];
  reducedMotion: boolean;
  selected: SkillCluster | null;
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
          onSelect={onSelect}
          drag={drag}
        />
      </Canvas>
    </div>
  );
}
