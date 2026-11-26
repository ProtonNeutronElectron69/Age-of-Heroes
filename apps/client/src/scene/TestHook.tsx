import { useThree } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld } from "@aoh/rules";
import { useEffect } from "react";
import { Vector3 } from "three";
import { useBoardActivity } from "./activity";

interface UiStep {
  hex: { q: number; r: number };
  elevation: number;
}

declare global {
  interface Window {
    /** Lets browser tests find where a hex is drawn on screen. */
    __aoh?: {
      project: (q: number, r: number, elevation: number) => { x: number; y: number };
      /** What the last frame drew, and how many frames have been drawn, for performance checks. */
      stats: () => { calls: number; triangles: number; lines: number; frames: number };
      /** The camera has a glide to make (perhaps waiting for a hop to land first), or is making one. */
      cameraBusy: () => boolean;
      /**
       * What the board draws with, for the graphics test: whether shadows are on, how many meshes
       * cast one, and how many particle bursts and figure reactions it has played.
       */
      graphics: () => { shadows: boolean; casters: number; bursts: number; reactions: number };
      /** How many wound numbers have floated up from figures on this board. */
      woundsShown: () => number;
      /**
       * The canvas this hook belongs to. A closing screen's canvas can shut down after the next
       * one's has started, so tests wait for `canvas.isConnected` to know the hook is the new screen's.
       */
      canvas: HTMLCanvasElement;
    };
    /** Online: how many pings from other players this page has heard (set by `online.ts`). */
    __aohPingsHeard?: number;
    /** Read-only summary of the current turn, for browser tests. */
    __aohUi?: {
      selected: string | null;
      /** Where the chosen figure stands. */
      selectedAt: UiStep | null;
      /** The figure the pointer is dragging, and the move it would make if let go. */
      dragging: { id: string; over: UiStep | null } | null;
      moves: UiStep[];
      targets: (UiStep & { id: string; height: number })[];
      enemies: UiStep[];
      /** A blast waiting for the player to pick which of a big figure's hexes to aim at. */
      aiming: { id: string; spots: UiStep[] } | null;
      /** Empty hexes the chosen blast may be aimed at. */
      blastHexes: UiStep[];
      /** The figure R turns (games with facing), and its facing in degrees. */
      turning: { id: string; facing: number } | null;
      /** The hovered move: where the chosen figure would end, its facing then (degrees) and the path. */
      preview: { to: UiStep & { rotation?: number }; facing: number; path: (UiStep & { rotation?: number })[] } | null;
      /** How many attack intros a click has skipped so far. */
      introsSkipped: () => number;
      /** Which way a figure faces now, in degrees (null in games without facing). */
      facingOf: (id: string) => number | null;

    };
  }
}

/** Exposes a projection helper for automated browser tests. */
export function TestHook({ offset }: { offset: { x: number; z: number } }) {
  const { camera, gl, scene } = useThree();
  const activity = useBoardActivity();
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
        return { calls: r.calls, triangles: r.triangles, lines: r.lines, frames: r.frame };
      },
      cameraBusy: () => activity.gliding,
      graphics() {
        let casters = 0;
        scene.traverse((o) => {
          if ((o as { isMesh?: boolean }).isMesh && o.castShadow) casters++;
        });
        return { shadows: gl.shadowMap.enabled, casters, bursts: activity.bursts, reactions: activity.reactions };
      },
      woundsShown: () => activity.woundsShown,
      canvas: gl.domElement,
    };
    window.__aoh = hook;
    // A canvas can shut down after the next screen's has started (the menu's backdrop does),
    // so only remove the hook if it is still this one.
    return () => {
      if (window.__aoh === hook) delete window.__aoh;
    };
  }, [camera, gl, offset, activity]);
  return null;
}
