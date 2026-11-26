import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from "three";
import { useBoardActivity } from "./activity";
import { burst, burstSeconds, particleAt, type BurstKind, type BurstOptions, type Particle, type ParticleNow, type Point3 } from "./particles";
import { useWake } from "./wake";

/**
 * Where the play screen asks for particle bursts (`particles.ts` makes them). The screen lives
 * outside the canvas, so it calls `spawn`, and `<Particles>` inside the board draws what it is
 * given. While no board is drawing them (low graphics quality), a spawn is dropped.
 */
export class Bursts {
  pending: { kind: BurstKind; at: Point3; options: BurstOptions }[] = [];
  listener: (() => void) | null = null;
  spawn(kind: BurstKind, at: Point3, options: BurstOptions = {}): void {
    if (!this.listener) return;
    this.pending.push({ kind, at, options });
    this.listener();
  }
}

/** The smallest a glowing particle is drawn, in CSS pixels, however far the camera is. */
const MIN_GLOW_PIXELS = 5;

/** The most particles drawn at once in each layer; a burst beyond that waits its turn for room. */
const MAX_PARTICLES = 2048;

const VERTEX = /* glsl */ `
  attribute float alpha;
  attribute float size;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uViewport;
  uniform float uMinSize;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    // A particle keeps its size in the world (nearer is bigger), but a glowing one never shrinks
    // below a few pixels, so sparks and glints still show with the camera far back.
    gl_PointSize = max(uMinSize, size * uViewport * projectionMatrix[1][1] * 0.5 / -view.z);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Glowing particles have a hot core; dust is a soft round puff.
    float shape = uGlow > 0.5 ? pow(1.0 - d, 1.6) + 0.35 * step(d, 0.35) : smoothstep(1.0, 0.2, d) * 0.85;
    gl_FragColor = vec4(vColor, vAlpha * shape);
  }
`;

interface Layer {
  readonly points: Points;
  readonly position: BufferAttribute;
  readonly color: BufferAttribute;
  readonly alpha: BufferAttribute;
  readonly size: BufferAttribute;
  readonly material: ShaderMaterial;
}

function makeLayer(glow: boolean): Layer {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  const color = new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  const alpha = new BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
  const size = new BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", color);
  geometry.setAttribute("alpha", alpha);
  geometry.setAttribute("size", size);
  geometry.setDrawRange(0, 0);
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uViewport: { value: 720 }, uMinSize: { value: 1 }, uGlow: { value: glow ? 1 : 0 } },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: glow ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = glow ? 12 : 11;
  points.raycast = () => {};
  return { points, position, color, alpha, size, material };
}

/** Every burst the play screen asks for, drawn as two point clouds (glowing and solid): two draw calls at most. */
export function Particles({ bursts }: { bursts: Bursts }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const wake = useWake();
  const activity = useBoardActivity();
  const layers = useMemo(() => ({ glow: makeLayer(true), solid: makeLayer(false) }), []);
  const live = useMemo(() => ({ list: [] as { particles: Particle[]; born: number; ends: number }[], seed: 1 }), []);
  const now = useMemo<ParticleNow>(() => ({ x: 0, y: 0, z: 0, size: 0, alpha: 0 }), []);

  useEffect(() => {
    bursts.listener = wake;
    return () => {
      bursts.listener = null;
      bursts.pending = [];
    };
  }, [bursts, wake]);
  useEffect(
    () => () => {
      for (const l of [layers.glow, layers.solid]) {
        l.points.geometry.dispose();
        l.material.dispose();
      }
    },
    [layers],
  );

  useFrame(() => {
    const clock = performance.now();
    for (const b of bursts.pending) {
      live.seed = (live.seed * 48271) % 2147483647;
      live.list.push({ particles: burst(b.kind, b.at, live.seed, b.options), born: clock, ends: clock + burstSeconds(b.kind) * 1000 });
      activity.bursts++;
    }
    bursts.pending = [];
    live.list = live.list.filter((b) => b.ends > clock);
    const height = gl.domElement.height;
    let glow = 0;
    let solid = 0;
    for (const b of live.list) {
      const t = (clock - b.born) / 1000;
      for (const p of b.particles) {
        if (!particleAt(p, t, now)) continue;
        const layer = p.glow ? layers.glow : layers.solid;
        const i = p.glow ? glow : solid;
        if (i >= MAX_PARTICLES) continue;
        layer.position.setXYZ(i, now.x, now.y, now.z);
        layer.color.setXYZ(i, p.r, p.g, p.b);
        layer.alpha.setX(i, now.alpha);
        layer.size.setX(i, now.size);
        if (p.glow) glow++;
        else solid++;
      }
    }
    for (const [layer, count] of [[layers.glow, glow], [layers.solid, solid]] as const) {
      layer.material.uniforms.uViewport!.value = height;
      layer.material.uniforms.uMinSize!.value = layer === layers.glow ? MIN_GLOW_PIXELS * gl.getPixelRatio() : 1;
      layer.points.geometry.setDrawRange(0, count);
      layer.points.visible = count > 0;
      if (count > 0) {
        layer.position.needsUpdate = true;
        layer.color.needsUpdate = true;
        layer.alpha.needsUpdate = true;
        layer.size.needsUpdate = true;
      }
    }
    // Keep drawing while any burst is in the air; the board rests again once the last has gone.
    if (live.list.length > 0) invalidate();
  });

  return (
    <>
      <primitive object={layers.solid.points} />
      <primitive object={layers.glow.points} />
    </>
  );
}
