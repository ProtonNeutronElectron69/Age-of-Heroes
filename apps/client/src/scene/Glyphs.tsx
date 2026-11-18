import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld, type GlyphState } from "@aoh/rules";

/**
 * Glyphs lying face down on the battlefield: thin hex tiles with a rune on top. They all look the
 * same, as nobody knows which is which until a figure picks one up. They take no clicks, so the
 * hex under them can still be chosen.
 */
export function GlyphTiles({ glyphs }: { glyphs: GlyphState["onBoard"] }) {
  return (
    <>
      {glyphs.map((g) => {
        const { x, z } = hexToWorld(g.hex, HEX_SIZE);
        const y = g.elevation * LEVEL_HEIGHT;
        return (
          <group key={g.id} position={[x, y, z]}>
            <mesh position={[0, 0.05, 0]} raycast={() => null}>
              <cylinderGeometry args={[HEX_SIZE * 0.74, HEX_SIZE * 0.78, 0.1, 6]} />
              <meshStandardMaterial color="#7a1f24" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.105, 0]} raycast={() => null}>
              <cylinderGeometry args={[HEX_SIZE * 0.6, HEX_SIZE * 0.6, 0.02, 6]} />
              <meshStandardMaterial color="#b89a64" roughness={0.9} />
            </mesh>
            {/* The rune: a flat golden diamond with a bar across it. */}
            <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.15, 1]} raycast={() => null}>
              <octahedronGeometry args={[HEX_SIZE * 0.3, 0]} />
              <meshStandardMaterial color="#e8c374" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.13, 0]} raycast={() => null}>
              <boxGeometry args={[HEX_SIZE * 0.5, 0.02, HEX_SIZE * 0.08]} />
              <meshStandardMaterial color="#5a3a12" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
