import {
  ASTRONOMICAL_UNITS,
  type CosmicCoordinate,
  type LocalCoordinate,
} from "./UniverseCore";

import type { CelestialBody } from "./CelestialBody";
import { UniverseDataStore } from "./UniverseDataStore";
import {
  UniverseRenderBridge,
  type UniverseRenderBridgeOptions,
} from "./UniverseRenderBridge";

export interface ProjectedCelestialBody {
  readonly body: CelestialBody;
  readonly position: LocalCoordinate;
  readonly distancePc: number;
}

export class UniverseSceneAdapter {
  private readonly store: UniverseDataStore;
  private readonly bridge: UniverseRenderBridge;

  constructor(
    store: UniverseDataStore,
    initialObserver: CosmicCoordinate,
    options: UniverseRenderBridgeOptions = {},
  ) {
    this.store = store;
    this.bridge = new UniverseRenderBridge(initialObserver, options);
  }

  getFrame() {
    return this.bridge.getFrame();
  }

  updateObserver(observer: CosmicCoordinate): boolean {
    return this.bridge.updateObserver(observer);
  }

  projectNearby(): ProjectedCelestialBody[] {
    const frame = this.bridge.getFrame();

    const radiusPc =
      frame.maxRenderDistanceLy /
      ASTRONOMICAL_UNITS.lightYearsPerParsec;

    const candidates = this.store.queryNearby(
      frame.origin,
      radiusPc,
    );

    const projected: ProjectedCelestialBody[] = [];

    for (const candidate of candidates) {
      if (candidate.distancePc === null) continue;

      const position = this.bridge.project(
        candidate.body.position.coordinate,
      );

      if (position === null) continue;

      projected.push(Object.freeze({
        body: candidate.body,
        position: Object.freeze({ ...position }),
        distancePc: candidate.distancePc,
      }));
    }

    return projected;
  }
}
