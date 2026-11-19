import type {
  CelestialBody,
} from "./CelestialBody";

import {
  displacementExact,
} from "./UniverseCore";

import type {
  CosmicCoordinate,
} from "./UniverseCore";

export interface SpatialIndexOptions {
  cellSizePc?: number;
  maxCellsPerQuery?: number;
}

export interface SpatialQueryResult {
  body: CelestialBody;
  distancePc: number;
}

interface SpatialCell {
  ids: Set<string>;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function floorDiv(a: bigint, b: bigint): bigint {
  let quotient = a / b;
  const remainder = a % b;

  if (remainder < 0n) {
    quotient -= 1n;
  }

  return quotient;
}

function axisBucket(
  axis: CosmicCoordinate["x"],
  cellSize: bigint,
): bigint {
  if (typeof axis.cell !== "bigint") {
    throw new TypeError("Coordinate cell must be a bigint");
  }

  if (
    !Number.isFinite(axis.offsetPc) ||
    axis.offsetPc < -0.5 ||
    axis.offsetPc >= 0.5
  ) {
    throw new RangeError("Coordinate offsetPc must be finite and normalized");
  }

  let bucket = floorDiv(axis.cell, cellSize);

  const remainder = axis.cell - bucket * cellSize;

  if (remainder === 0n && axis.offsetPc < 0) {
    bucket -= 1n;
  }

  return bucket;
}

function coordinateBucket(
  position: CosmicCoordinate,
  cellSize: bigint,
): readonly [bigint, bigint, bigint] {
  return [
    axisBucket(position.x, cellSize),
    axisBucket(position.y, cellSize),
    axisBucket(position.z, cellSize),
  ];
}

function cellKey(
  x: bigint,
  y: bigint,
  z: bigint,
): string {
  return `${x}:${y}:${z}`;
}

function safeAxisDeltaPc(
  delta: CosmicCoordinate["x"],
): number | null {
  if (
    delta.cell > MAX_SAFE_BIGINT ||
    delta.cell < -MAX_SAFE_BIGINT
  ) {
    return null;
  }

  const result = Number(delta.cell) + delta.offsetPc;

  return Number.isFinite(result) ? result : null;
}

function exactDistancePc(
  origin: CosmicCoordinate,
  target: CosmicCoordinate,
): number | null {
  const delta = displacementExact(origin, target);

  const x = safeAxisDeltaPc(delta.x);
  const y = safeAxisDeltaPc(delta.y);
  const z = safeAxisDeltaPc(delta.z);

  if (x === null || y === null || z === null) {
    return null;
  }

  return Math.hypot(x, y, z);
}

export class SpatialIndex {
  readonly cellSizePc: number;
  readonly maxCellsPerQuery: number;

  private readonly cellSizeBigInt: bigint;
  private readonly cells = new Map<string, SpatialCell>();
  private readonly bodies = new Map<string, CelestialBody>();
  private readonly bodyCells = new Map<string, string>();

  constructor(options: SpatialIndexOptions = {}) {
    const cellSizePc = options.cellSizePc ?? 10;
    const maxCellsPerQuery = options.maxCellsPerQuery ?? 100_000;

    if (
      !Number.isSafeInteger(cellSizePc) ||
      cellSizePc <= 0
    ) {
      throw new RangeError(
        "cellSizePc must be a positive safe integer",
      );
    }

    if (
      !Number.isSafeInteger(maxCellsPerQuery) ||
      maxCellsPerQuery <= 0
    ) {
      throw new RangeError(
        "maxCellsPerQuery must be a positive safe integer",
      );
    }

    this.cellSizePc = cellSizePc;
    this.cellSizeBigInt = BigInt(cellSizePc);
    this.maxCellsPerQuery = maxCellsPerQuery;
  }

  get size(): number {
    return this.bodies.size;
  }

  add(body: CelestialBody): void {
    if (!body.id.trim()) {
      throw new RangeError("Body ID cannot be empty");
    }

    if (this.bodies.has(body.id)) {
      throw new Error(`Body already indexed: ${body.id}`);
    }

    this.insert(body);
  }

  update(body: CelestialBody): void {
    if (!body.id.trim()) {
      throw new RangeError("Body ID cannot be empty");
    }

    const bucket = coordinateBucket(
      body.position.coordinate,
      this.cellSizeBigInt,
    );

    const key = cellKey(
      bucket[0],
      bucket[1],
      bucket[2],
    );

    const targetCell = this.cells.get(key) ?? {
      ids: new Set<string>(),
    };

    this.remove(body.id);

    if (!this.cells.has(key)) {
      this.cells.set(key, targetCell);
    }

    targetCell.ids.add(body.id);
    this.bodies.set(body.id, body);
    this.bodyCells.set(body.id, key);
  }

  remove(id: string): boolean {
    const key = this.bodyCells.get(id);

    if (key === undefined) {
      return false;
    }

    const cell = this.cells.get(key);

    cell?.ids.delete(id);

    if (cell && cell.ids.size === 0) {
      this.cells.delete(key);
    }

    this.bodyCells.delete(id);
    this.bodies.delete(id);

    return true;
  }

  get(id: string): CelestialBody | undefined {
    return this.bodies.get(id);
  }

  clear(): void {
    this.cells.clear();
    this.bodies.clear();
    this.bodyCells.clear();
  }

  query(
    center: CosmicCoordinate,
    radiusPc: number,
  ): SpatialQueryResult[] {
    if (
      !Number.isFinite(radiusPc) ||
      radiusPc < 0 ||
      radiusPc > Number.MAX_SAFE_INTEGER
    ) {
      throw new RangeError(
        "radiusPc must be a finite non-negative safe number",
      );
    }

    const centerBucket = coordinateBucket(
      center,
      this.cellSizeBigInt,
    );

    const reach = BigInt(
      Math.ceil(radiusPc / this.cellSizePc) + 1,
    );

    const minX = centerBucket[0] - reach;
    const maxX = centerBucket[0] + reach;
    const minY = centerBucket[1] - reach;
    const maxY = centerBucket[1] + reach;
    const minZ = centerBucket[2] - reach;
    const maxZ = centerBucket[2] + reach;

    const width = Number(maxX - minX + 1n);
    const height = Number(maxY - minY + 1n);
    const depth = Number(maxZ - minZ + 1n);

    const totalCells = width * height * depth;

    if (
      !Number.isSafeInteger(totalCells) ||
      totalCells > this.maxCellsPerQuery
    ) {
      throw new RangeError(
        `Spatial query exceeds maximum cells: ${totalCells}`,
      );
    }

    const candidateIds = new Set<string>();

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = cellKey(x, y, z);
          const cell = this.cells.get(key);

          if (!cell) continue;

          for (const id of cell.ids) {
            candidateIds.add(id);
          }
        }
      }
    }

    const results: SpatialQueryResult[] = [];

    for (const id of candidateIds) {
      const body = this.bodies.get(id);

      if (!body) continue;

      const distancePc = exactDistancePc(
        center,
        body.position.coordinate,
      );

      if (
        distancePc !== null &&
        distancePc <= radiusPc
      ) {
        results.push({
          body,
          distancePc,
        });
      }
    }

    results.sort(
      (a, b) => a.distancePc - b.distancePc,
    );

    return results;
  }

  private insert(body: CelestialBody): void {
    const bucket = coordinateBucket(
      body.position.coordinate,
      this.cellSizeBigInt,
    );

    const key = cellKey(
      bucket[0],
      bucket[1],
      bucket[2],
    );

    let cell = this.cells.get(key);

    if (!cell) {
      cell = {
        ids: new Set<string>(),
      };

      this.cells.set(key, cell);
    }

    cell.ids.add(body.id);

    this.bodies.set(body.id, body);
    this.bodyCells.set(body.id, key);
  }
}
