import { schema, t } from "@colyseus/schema";

export const PlayerState = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  z: t.number().default(0),
  displayName: t.string().default("Explorer"),
}, "PlayerState");

export const WorldState = schema({
  players: t.map(PlayerState),
}, "WorldState");
