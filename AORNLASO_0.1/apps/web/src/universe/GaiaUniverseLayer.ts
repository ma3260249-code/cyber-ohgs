import * as THREE from "three";
import { coordinateFromParsecs } from "./UniverseCore";
import { UniverseDataStore } from "./UniverseDataStore";
import { loadGaiaCatalog } from "./GaiaCatalogLoader";
import { UniverseSceneAdapter } from "./UniverseSceneAdapter";
import { GaiaThreeRenderer } from "./GaiaThreeRenderer";

export interface GaiaUniverseLoadReport {
  loaded: number;
  rejected: number;
  total: number;
  visible: number;
  errors: string[];
}

export class GaiaUniverseLayer {
  private readonly store = new UniverseDataStore();
  private readonly adapter: UniverseSceneAdapter;
  private readonly renderer: GaiaThreeRenderer;
  private loading = false;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    const solarSystemBarycenter = coordinateFromParsecs({
      x: 0,
      y: 0,
      z: 0,
    });

    this.adapter = new UniverseSceneAdapter(
      this.store,
      solarSystemBarycenter,
      {
        rebaseDistanceLy: 100,
        maxRenderDistanceLy: 500,
        renderUnitsPerLightYear: 1,
        maxRenderCoordinateUnits: 500,
      },
    );

    this.renderer = new GaiaThreeRenderer(scene, {
      pointSize: 0.8,
      color: 0xffe6b0,
      opacity: 0.95,
    });
  }

  async load(url: string): Promise<GaiaUniverseLoadReport> {
    if (this.disposed) {
      throw new Error("GaiaUniverseLayer has been disposed");
    }

    if (this.loading) {
      throw new Error("Gaia catalog is already loading");
    }

    this.loading = true;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Gaia catalog request failed: HTTP ${response.status}`,
        );
      }

      const document: unknown = await response.json();
      const report = loadGaiaCatalog(document, this.store);
      const projected = this.adapter.projectNearby();
      const visible = this.renderer.update(projected);

      return {
        ...report,
        visible,
      };
    } finally {
      this.loading = false;
    }
  }

  updateObserver(
    xPc: number,
    yPc: number,
    zPc: number,
  ): boolean {
    if (this.disposed) {
      throw new Error("GaiaUniverseLayer has been disposed");
    }

    const observer = coordinateFromParsecs({
      x: xPc,
      y: yPc,
      z: zPc,
    });

    const rebased = this.adapter.updateObserver(observer);
    const projected = this.adapter.projectNearby();
    this.renderer.update(projected);

    return rebased;
  }

  getStarCount(): number {
    return this.store.size;
  }

  dispose(): void {
    if (this.disposed) return;

    this.renderer.dispose();
    this.store.clear();
    this.disposed = true;
  }
}
