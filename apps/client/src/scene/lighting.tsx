import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PCFSoftShadowMap, type Material, type Mesh, type Object3D } from "three";
import { useGraphics } from "../settings";

/**
 * The board's light, by graphics quality. Low keeps the plain light the board always had: a sky
 * light and one sun, no shadows. High adds soft shadows from a warm key light, cast by figures,
 * scenery and stacked tiles onto the board and the table, with a cool fill from the other side,
 * so the board matches the lamp-lit dice tray. Nothing here changes the game.
 */
export function BoardLights({ span }: { span: number }) {
  const high = useGraphics() === "high";
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  // Switching quality changes which shaders the materials need: rebuild them once and draw again.
  useEffect(() => {
    gl.shadowMap.enabled = high;
    gl.shadowMap.type = PCFSoftShadowMap;
    gl.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (!high) mesh.castShadow = mesh.receiveShadow = false;
      for (const m of materialsOf(mesh)) m.needsUpdate = true;
    });
    invalidate();
  }, [high, gl, scene, invalidate]);

  // Figures and scenery come and go, so each frame that is drawn marks what casts and takes shadows.
  useFrame(() => {
    if (high) markShadows(scene);
  });

  if (!high) {
    return (
      <>
        <hemisphereLight args={["#dfe9ff", "#3a3128", 0.9]} />
        <directionalLight position={[12, 24, 10]} intensity={1.6} />
      </>
    );
  }
  // The key light's shadow covers the board with a margin; the table beyond it stays unshadowed.
  const reach = span * 0.78;
  return (
    <>
      <hemisphereLight args={["#e6edff", "#3b3026", 0.45]} />
      <directionalLight
        position={[span * 0.75, span * 0.7, span * 0.5]}
        intensity={2.4}
        color="#fff0db"
        castShadow
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={span * 3}
      />
      <directionalLight position={[-span * 0.5, span * 0.6, -span * 0.4]} intensity={0.35} color="#b9c8ff" />
    </>
  );
}

/** The key light's shadow map, in pixels a side. */
export const SHADOW_MAP = 2048;

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
}

/** Lit, solid surfaces cast and take shadows; markers, glows, outlines and see-through copies do not. */
function casts(mesh: Mesh): boolean {
  if (mesh.userData.noShadow) return false;
  return materialsOf(mesh).every((m) => {
    const lit = (m as { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean });
    return (lit.isMeshStandardMaterial || lit.isMeshLambertMaterial || lit.isMeshPhongMaterial) === true && !m.transparent;
  });
}

function markShadows(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const on = casts(mesh);
    mesh.castShadow = on;
    mesh.receiveShadow = on;
  });
}
