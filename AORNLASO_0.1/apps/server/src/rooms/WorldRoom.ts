import { Room, type Client } from "@colyseus/core";
import { PlayerState, WorldState } from "../state/WorldState.js";

type MoveInput = { x: number; z: number };

const WORLD_LIMIT = 100;

function validAxis(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class WorldRoom extends Room {
  maxClients = 32;
  state = new WorldState();

  messages = {
    move: (client: Client, input: MoveInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !input || !validAxis(input.x) || !validAxis(input.z)) return;

      // Server-authoritative bounds validation. This is a prototype movement model.
      player.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, input.x));
      player.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, input.z));
    },
  };

  onJoin(client: Client, options: { displayName?: string }) {
    const name = typeof options?.displayName === "string"
      ? options.displayName.trim().slice(0, 24)
      : "";
    const player = new PlayerState();
    player.displayName = name || `Explorer-${client.sessionId.slice(0, 4)}`;
    this.state.players.set(client.sessionId, player);
    this.broadcast("system", `${player.displayName} دخل العالم`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) this.broadcast("system", `${player.displayName} غادر العالم`);
    this.state.players.delete(client.sessionId);
  }
}
