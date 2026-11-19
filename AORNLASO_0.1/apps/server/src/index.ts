import { defineRoom, defineServer } from "@colyseus/core";
import type { Request, Response } from "express";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom.js";

const port = Number(process.env.PORT ?? 2567);

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    world: defineRoom(WorldRoom),
  },
  express: (app) => {
    app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", project: "AORNLASO", version: "0.1.0" });
    });
  },
});

server.listen(port);
console.log(`AORNLASO Colyseus server listening on port ${port}`);
