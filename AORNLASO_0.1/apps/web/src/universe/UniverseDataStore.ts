import {
  isValidCelestialBody,
  validateCelestialBody,
} from "./CelestialBody";

import type {
  CelestialBody,
} from "./CelestialBody";

import {
  SpatialIndex,
} from "./SpatialIndex";

import type {
  SpatialIndexOptions,
  SpatialQueryResult,
} from "./SpatialIndex";

function cloneAndFreeze(
  value: unknown,
  ancestors = new WeakSet<object>(),
  path = "body",
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(path + " contains a non-finite number");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError(path + " contains an unsupported value");
  }

  if (ancestors.has(value)) {
    throw new TypeError(path + " contains a circular reference");
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const result: unknown[] = [];

      for (const key of Object.keys(value)) {
        if (!/^(0|[1-9]\d*)$/.test(key)) {
          throw new TypeError(path + " contains an invalid array property");
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);

        if (!descriptor || !("value" in descriptor)) {
          throw new TypeError(path + " contains an accessor");
        }

        result[Number(key)] = cloneAndFreeze(
          descriptor.value,
          ancestors,
          path + "[" + key + "]",
        );
      }

      return Object.freeze(result);
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(path + " must contain only plain objects");
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(path + " contains symbol properties");
    }

    const result: Record<string, unknown> = {};

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError(path + "." + key + " contains an accessor");
      }

      Object.defineProperty(result, key, {
        value: cloneAndFreeze(
          descriptor.value,
          ancestors,
          path + "." + key,
        ),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

function snapshot(body: unknown): CelestialBody {
  const copy = cloneAndFreeze(body);

  if (!isValidCelestialBody(copy)) {
    throw new TypeError(
      "Invalid celestial body: " +
      validateCelestialBody(copy).join("; "),
    );
  }

  return copy as CelestialBody;
}

export class UniverseDataStore {
  private readonly bodies = new Map<string, CelestialBody>();
  private readonly spatialIndex: SpatialIndex;

  constructor(options: SpatialIndexOptions = {}) {
    this.spatialIndex = new SpatialIndex(options);
  }

  get size(): number {
    return this.bodies.size;
  }

  add(body: CelestialBody): void {
    const stored = snapshot(body);

    if (this.bodies.has(stored.id)) {
      throw new Error("Body already exists: " + stored.id);
    }

    this.spatialIndex.add(stored);
    this.bodies.set(stored.id, stored);
  }

  update(body: CelestialBody): void {
    const stored = snapshot(body);

    if (!this.bodies.has(stored.id)) {
      throw new Error("Body does not exist: " + stored.id);
    }

    this.spatialIndex.update(stored);
    this.bodies.set(stored.id, stored);
  }

  upsert(body: CelestialBody): void {
    const stored = snapshot(body);

    if (this.bodies.has(stored.id)) {
      this.spatialIndex.update(stored);
      this.bodies.set(stored.id, stored);
      return;
    }

    this.spatialIndex.add(stored);
    this.bodies.set(stored.id, stored);
  }

  get(id: string): CelestialBody | undefined {
    const body = this.bodies.get(id);
    return body ? snapshot(body) : undefined;
  }

  getAll(): CelestialBody[] {
    return Array.from(
      this.bodies.values(),
      (body) => snapshot(body),
    );
  }

  remove(id: string): boolean {
    if (!this.bodies.has(id)) {
      return false;
    }

    this.spatialIndex.remove(id);
    this.bodies.delete(id);
    return true;
  }

  queryNearby(
    center: CelestialBody["position"]["coordinate"],
    radiusPc: number,
  ): SpatialQueryResult[] {
    return this.spatialIndex.query(center, radiusPc).map((result) => ({
      body: snapshot(result.body),
      distancePc: result.distancePc,
    }));
  }

  clear(): void {
    this.spatialIndex.clear();
    this.bodies.clear();
  }

  has(id: string): boolean {
    return this.bodies.has(id);
  }
}
