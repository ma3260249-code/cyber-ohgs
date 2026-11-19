import * as THREE from "three";
import type { ProjectedCelestialBody } from "./UniverseSceneAdapter";

export interface GaiaThreeRendererOptions {
  pointSize?: number;
  color?: THREE.ColorRepresentation;
  opacity?: number;
}

export class GaiaThreeRenderer {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    options: GaiaThreeRendererOptions = {},
  ) {
    this.geometry = new THREE.BufferGeometry();

    this.material = new THREE.PointsMaterial({
      color: options.color ?? 0xffe6b0,
      size: options.pointSize ?? 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: options.opacity ?? 0.95,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "AORNLASO_GAIA_DR3_STARS";
    this.points.frustumCulled = true;

    this.scene.add(this.points);
  }

  update(bodies: readonly ProjectedCelestialBody[]): number {
    if (this.disposed) {
      throw new Error("GaiaThreeRenderer has been disposed");
    }

    const positions = new Float32Array(bodies.length * 3);

    for (let i = 0; i < bodies.length; i++) {
      const position = bodies[i].position;
      const offset = i * 3;

      positions[offset] = position.x;
      positions[offset + 1] = position.y;
      positions[offset + 2] = position.z;
    }

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );

    this.geometry.computeBoundingSphere();
    this.geometry.attributes.position.needsUpdate = true;

    return bodies.length;
  }

  getCount(): number {
    return this.geometry.getAttribute("position")?.count ?? 0;
  }

  dispose(): void {
    if (this.disposed) return;

    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.disposed = true;
  }
}
