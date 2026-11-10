import { roomSettingsSchema, type RoomSettings } from "@aoh/protocol";
import type { Command, GameSetup } from "@aoh/rules";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the server keeps about a room so it can be rebuilt after a restart:
 * the settings, who holds each seat (with their secret rejoin tokens) and the
 * game's setup and commands. The game state itself is rebuilt by replaying the
 * commands, so it is never stored.
 */
export interface StoredRoom {
  readonly version: 1;
  readonly code: string;
  readonly settings: RoomSettings;
  readonly members: readonly { readonly playerId: string; readonly name: string; readonly token: string }[];
  readonly hostId: string;
  readonly nextPlayer: number;
  readonly setup: GameSetup | null;
  readonly commands: readonly Command[];
  readonly lastActive: number;
}

export interface RoomStore {
  /** Every stored room that still reads correctly. */
  loadAll(): StoredRoom[];
  /** Remember the room's latest state (may be written a little later). */
  save(room: StoredRoom): void;
  remove(code: string): void;
  /** Write everything still waiting. Call before the process exits. */
  flush(): void;
}

const CODE = /^[A-Z]{4,8}$/;

function readRoom(text: string): StoredRoom | null {
  const data = JSON.parse(text) as Partial<StoredRoom>;
  if (data.version !== 1 || typeof data.code !== "string" || !CODE.test(data.code)) return null;
  const settings = roomSettingsSchema.safeParse(data.settings);
  if (!settings.success || !Array.isArray(data.members) || !Array.isArray(data.commands)) return null;
  return { ...(data as StoredRoom), settings: settings.data };
}

/**
 * Keeps rooms as one JSON file each in a folder. Writes are batched (a busy
 * game writes at most every `delayMs`) and atomic (write, then rename), so a
 * crash never leaves a half-written room.
 */
export class FileRoomStore implements RoomStore {
  private readonly pending = new Map<string, StoredRoom | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dir: string,
    private readonly delayMs = 500,
  ) {
    mkdirSync(dir, { recursive: true });
    // Fail at startup, not in the middle of a game, if the folder cannot be written.
    const probe = join(dir, ".write-check");
    try {
      writeFileSync(probe, "ok");
      rmSync(probe, { force: true });
    } catch (err) {
      throw new Error(`Cannot write rooms to ${dir}: ${(err as Error).message}`);
    }
  }

  loadAll(): StoredRoom[] {
    const rooms: StoredRoom[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const room = readRoom(readFileSync(join(this.dir, file), "utf8"));
        if (room && `${room.code}.json` === file) rooms.push(room);
        else console.warn(`Skipping stored room ${file}: not a room this server can read`);
      } catch (err) {
        console.warn(`Skipping stored room ${file}: ${(err as Error).message}`);
      }
    }
    return rooms;
  }

  save(room: StoredRoom): void {
    this.pending.set(room.code, room);
    this.schedule();
  }

  remove(code: string): void {
    this.pending.set(code, null);
    this.schedule();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const [code, room] of this.pending) {
      const file = join(this.dir, `${code}.json`);
      try {
        if (room) {
          writeFileSync(`${file}.tmp`, JSON.stringify(room));
          renameSync(`${file}.tmp`, file);
        } else {
          rmSync(file, { force: true });
        }
      } catch (err) {
        console.error(`Could not store room ${code}: ${(err as Error).message}`);
      }
    }
    this.pending.clear();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.delayMs);
    this.timer.unref?.();
  }
}
