import {
  coordinateFromParts,
} from "./UniverseCore";

import type {
  CosmicCoordinate,
} from "./UniverseCore";

import {
  validateCelestialBody,
} from "./CelestialBody";

import type {
  CelestialBody,
} from "./CelestialBody";

import {
  UniverseDataStore,
} from "./UniverseDataStore";

export interface GaiaCatalogDocument {
  schema: string;
  catalog: string;
  source: string;
  retrievedAt: string;
  recordCount: number;
  records: unknown[];
}

export interface GaiaLoadReport {
  loaded: number;
  rejected: number;
  total: number;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoordinate(value: unknown): CosmicCoordinate {
  if (!isRecord(value)) {
    throw new TypeError("Coordinate must be an object");
  }

  const axes = ["x", "y", "z"] as const;
  const parts = {} as Record<
    typeof axes[number],
    { wholePc: bigint; fractionalPc: number }
  >;

  for (const axis of axes) {
    const item = value[axis];

    if (!isRecord(item)) {
      throw new TypeError("Invalid coordinate axis: " + axis);
    }

    if (
      typeof item.cell !== "string" ||
      !/^-?\d+$/.test(item.cell)
    ) {
      throw new TypeError("Invalid coordinate cell: " + axis);
    }

    if (
      typeof item.offsetPc !== "number" ||
      !Number.isFinite(item.offsetPc) ||
      item.offsetPc < -0.5 ||
      item.offsetPc >= 0.5
    ) {
      throw new TypeError("Invalid coordinate offset: " + axis);
    }

    parts[axis] = {
      wholePc: BigInt(item.cell),
      fractionalPc: item.offsetPc,
    };
  }

  return coordinateFromParts(parts as {
    x: { wholePc: bigint; fractionalPc: number };
    y: { wholePc: bigint; fractionalPc: number };
    z: { wholePc: bigint; fractionalPc: number };
  });
}

function parseBody(value: unknown): CelestialBody {
  if (!isRecord(value) || !isRecord(value.position)) {
    throw new TypeError("Invalid Gaia celestial body");
  }

  const position = value.position;

  const body = {
    ...value,
    position: {
      ...position,
      coordinate: parseCoordinate(position.coordinate),
    },
  };

  const errors = validateCelestialBody(body);

  if (errors.length > 0) {
    throw new TypeError(errors.join("; "));
  }

  return body as unknown as CelestialBody;
}

export function loadGaiaCatalog(
  document: unknown,
  store: UniverseDataStore,
): GaiaLoadReport {
  if (!isRecord(document)) {
    throw new TypeError("Gaia catalog document must be an object");
  }

  if (document.schema !== "aornlaso.gaia-dr3.catalog.v1") {
    throw new TypeError("Unsupported Gaia catalog schema");
  }

  if (!Array.isArray(document.records)) {
    throw new TypeError("Gaia catalog records must be an array");
  }

  if (
    typeof document.recordCount !== "number" ||
    document.recordCount !== document.records.length
  ) {
    throw new TypeError("Gaia catalog record count mismatch");
  }

  const report: GaiaLoadReport = {
    loaded: 0,
    rejected: 0,
    total: document.records.length,
    errors: [],
  };

  for (let i = 0; i < document.records.length; i++) {
    try {
      const body = parseBody(document.records[i]);
      store.add(body);
      report.loaded++;
    } catch (error) {
      report.rejected++;
      report.errors.push(
        "Record " + (i + 1) + ": " +
        (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  return report;
}
