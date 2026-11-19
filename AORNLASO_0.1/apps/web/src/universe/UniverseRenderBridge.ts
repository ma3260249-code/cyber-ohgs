import {
  type CosmicCoordinate,
  type LocalCoordinate,
} from "./UniverseCore";

import {
  createRenderFrame,
  projectToRenderFrame,
  rebaseRenderFrame,
  shouldRebaseRenderFrame,
  type RenderFrame,
} from "./RenderFrame";

export type UniverseRenderBridgeOptions = {
  rebaseDistanceLy?: number;
  maxRenderDistanceLy?: number;
  renderUnitsPerLightYear?: number;
  maxRenderCoordinateUnits?: number;
};

/**
 * Connects precise cosmic coordinates to a bounded local render frame.
 * This class does not create astronomical data or depend on Three.js.
 */
export class UniverseRenderBridge {
  private frame: RenderFrame;

  constructor(
    initialObserver: CosmicCoordinate,
    options: UniverseRenderBridgeOptions = {},
  ) {
    this.frame = createRenderFrame(initialObserver, options);
  }

  getFrame(): RenderFrame {
    return this.frame;
  }

  /**
   * Updates the observer reference.
   * Returns true only when the render origin was rebased.
   */
  updateObserver(observer: CosmicCoordinate): boolean {
    if (!shouldRebaseRenderFrame(observer, this.frame)) {
      return false;
    }

    this.frame = rebaseRenderFrame(observer, this.frame);
    return true;
  }

  /**
   * Projects a cosmic position into local render coordinates.
   * Returns null when the position is outside the render range.
   */
  project(position: CosmicCoordinate): LocalCoordinate | null {
    return projectToRenderFrame(position, this.frame);
  }
}
