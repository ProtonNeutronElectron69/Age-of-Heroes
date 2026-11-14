import { useThree } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld } from "@aoh/rules";
import { useEffect } from "react";
import { Vector3 } from "three";

interface UiStep {
  hex: { q: number; r: number };
  elevation: number;
}

declare global {
  interface Window {
    /** Lets browser tests find where a hex is drawn on screen. */
    __aoh?: {
      project: (q: number, r: number, elevation: number) => { x: number; y: number };
      /** What the last frame drew, for performance checks. */
      stats: () => { calls: number; triangles: number; lines: number };
    };
    /** Read-only summary of the current turn, for browser tests. */
    __aohUi?: {
      selected: string | null;
      moves: UiStep[];
      targets: (UiStep & { id: string; height: number })[];
      enemies: UiStep[];
    };
  }
}

/** Exposes a projection helper for automated browser tests. */
export function TestHook({ offset }: { offset: { x: number; z: number } }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const hook: NonNullable<Window["__aoh"]> = {
      project(q, r, elevation) {
        const { x, z } = hexToWorld({ q, r }, HEX_SIZE);
        const v = new Vector3(x - offset.x, elevation * LEVEL_HEIGHT, z - offset.z).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
      stats() {
        const r = gl.info.render;
        return { calls: r.calls, triangles: r.triangles, lines: r.lines };
      },
    };
    window.__aoh = hook;
    // A canvas can shut down after the next screen's has started (the menu's backdrop does),
    // so only remove the hook if it is still this one.
    return () => {
      if (window.__aoh === hook) delete window.__aoh;
    };
  }, [camera, gl, offset]);
  return null;
}
