import type { CosmicCoordinate } from "./UniverseCore";

export type CelestialBodyType =
  | "star"
  | "planet"
  | "moon"
  | "dwarf-planet"
  | "asteroid"
  | "comet"
  | "galaxy"
  | "nebula"
  | "black-hole"
  | "star-cluster"
  | "other";

export type MeasurementStatus =
  | "observed"
  | "derived"
  | "estimated"
  | "procedural"
  | "unknown";

export type ScientificSourceType =
  | "catalog"
  | "publication"
  | "mission"
  | "observation"
  | "simulation"
  | "user"
  | "internal";

export interface ScientificSource {
  type: ScientificSourceType;
  name?: string;
  reference?: string;
  recordId?: string;
  retrievedAt?: string;
}

export interface MeasurementUncertainty {
  plus?: number;
  minus?: number;
  confidenceLevel?: number;
  method?: string;
}

export interface ScientificMeasurement {
  value: number | null;
  unit: string;
  status: MeasurementStatus;
  source?: ScientificSource;
  uncertainty?: MeasurementUncertainty;
}

export interface CelestialPosition {
  coordinate: CosmicCoordinate;
  referenceFrame: string;
  epoch: string;
  source?: ScientificSource;
  uncertainty?: {
    angularArcseconds?: number;
    positionalParsecs?: number;
  };
}

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialBodyType;
  position: CelestialPosition;

  properties: {
    mass?: ScientificMeasurement;
    radius?: ScientificMeasurement;
    temperature?: ScientificMeasurement;
    luminosity?: ScientificMeasurement;
    age?: ScientificMeasurement;
    rotationPeriod?: ScientificMeasurement;
    orbitalPeriod?: ScientificMeasurement;
  };

  parentId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}


const BODY_TYPES = new Set([
  "star", "planet", "moon", "dwarf-planet", "asteroid",
  "comet", "galaxy", "nebula", "black-hole", "star-cluster", "other",
]);

const MEASUREMENT_STATUSES = new Set([
  "observed", "derived", "estimated", "procedural", "unknown",
]);

const SOURCE_TYPES = new Set([
  "catalog", "publication", "mission", "observation",
  "simulation", "user", "internal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSource(
  source: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(source)) {
    errors.push(label + " must be an object");
    return;
  }

  if (typeof source.type !== "string" || !SOURCE_TYPES.has(source.type)) {
    errors.push(label + " type is invalid");
  }

  for (const field of ["name", "reference", "recordId", "retrievedAt"]) {
    if (source[field] !== undefined &&
        (typeof source[field] !== "string" || !source[field].trim())) {
      errors.push(label + " " + field + " is invalid");
    }
  }
}

export function validateCelestialBody(body: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return ["Body must be an object"];
  }

  if (typeof body.id !== "string" || !body.id.trim()) {
    errors.push("Body ID cannot be empty");
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    errors.push("Body name cannot be empty");
  }

  if (typeof body.type !== "string" || !BODY_TYPES.has(body.type)) {
    errors.push("Celestial body type is invalid");
  }

  if (!isRecord(body.position)) {
    errors.push("Position must be an object");
  } else {
    const position = body.position;

    if (typeof position.referenceFrame !== "string" ||
        !position.referenceFrame.trim()) {
      errors.push("Reference frame cannot be empty");
    }

    if (typeof position.epoch !== "string" || !position.epoch.trim()) {
      errors.push("Position epoch cannot be empty");
    }

    if (!isRecord(position.coordinate)) {
      errors.push("Position coordinate must be an object");
    } else {
      for (const axisName of ["x", "y", "z"]) {
        const axis = position.coordinate[axisName];

        if (!isRecord(axis)) {
          errors.push("Coordinate axis must be an object");
          continue;
        }

        if (typeof axis.cell !== "bigint") {
          errors.push("Coordinate cell must be a bigint");
        }

        if (typeof axis.offsetPc !== "number" ||
            !Number.isFinite(axis.offsetPc)) {
          errors.push("Coordinate offset must be finite");
        } else if (axis.offsetPc < -0.5 || axis.offsetPc >= 0.5) {
          errors.push("Coordinate offset must be normalized");
        }
      }
    }

    if (position.source !== undefined) {
      validateSource(position.source, "Position source", errors);
    }

    if (position.uncertainty !== undefined) {
      if (!isRecord(position.uncertainty)) {
        errors.push("Position uncertainty must be an object");
      } else {
        for (const field of ["angularArcseconds", "positionalParsecs"]) {
          const value = position.uncertainty[field];
          if (value !== undefined &&
              (typeof value !== "number" ||
               !Number.isFinite(value) || value < 0)) {
            errors.push("Position " + field + " is invalid");
          }
        }
      }
    }
  }

  if (!isRecord(body.properties)) {
    errors.push("Body properties must be an object");
  } else {
    for (const [name, measurement] of Object.entries(body.properties)) {
      if (!isRecord(measurement)) {
        errors.push(name + " measurement must be an object");
        continue;
      }

      if (measurement.value !== null &&
          (typeof measurement.value !== "number" ||
           !Number.isFinite(measurement.value))) {
        errors.push(name + " value must be finite");
      }

      if (typeof measurement.status !== "string" ||
          !MEASUREMENT_STATUSES.has(measurement.status)) {
        errors.push(name + " status is invalid");
      }

      if (measurement.value === null &&
          measurement.status !== "unknown") {
        errors.push(name + " null value must have unknown status");
      }

      if (measurement.value !== null &&
          measurement.status === "unknown") {
        errors.push(name + " cannot be unknown with a known value");
      }

      if (typeof measurement.unit !== "string" ||
          !measurement.unit.trim()) {
        errors.push(name + " unit cannot be empty");
      }

      if (measurement.source !== undefined) {
        validateSource(measurement.source, name + " source", errors);
      }

      const uncertainty = measurement.uncertainty;

      if (uncertainty !== undefined) {
        if (!isRecord(uncertainty)) {
          errors.push(name + " uncertainty must be an object");
        } else {
          if (uncertainty.plus !== undefined &&
              (typeof uncertainty.plus !== "number" ||
               !Number.isFinite(uncertainty.plus) ||
               uncertainty.plus < 0)) {
            errors.push(name + " positive uncertainty is invalid");
          }

          if (uncertainty.minus !== undefined &&
              (typeof uncertainty.minus !== "number" ||
               !Number.isFinite(uncertainty.minus) ||
               uncertainty.minus < 0)) {
            errors.push(name + " negative uncertainty is invalid");
          }

          if (uncertainty.confidenceLevel !== undefined &&
              (typeof uncertainty.confidenceLevel !== "number" ||
               !Number.isFinite(uncertainty.confidenceLevel) ||
               uncertainty.confidenceLevel <= 0 ||
               uncertainty.confidenceLevel > 100)) {
            errors.push(name + " confidence level is invalid");
          }

          if (uncertainty.method !== undefined &&
              (typeof uncertainty.method !== "string" ||
               !uncertainty.method.trim())) {
            errors.push(name + " uncertainty method is invalid");
          }
        }
      }
    }
  }

  if (body.parentId !== undefined &&
      (typeof body.parentId !== "string" || !body.parentId.trim())) {
    errors.push("Parent ID is invalid");
  }

  if (typeof body.id === "string" &&
      body.parentId === body.id) {
    errors.push("Body cannot be its own parent");
  }

  if (body.description !== undefined &&
      typeof body.description !== "string") {
    errors.push("Body description must be a string");
  }

  if (body.metadata !== undefined && !isRecord(body.metadata)) {
    errors.push("Body metadata must be an object");
  }

  return errors;
}

export function isValidCelestialBody(
  body: unknown,
): body is CelestialBody {
  return validateCelestialBody(body).length === 0;
}
