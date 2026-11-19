/**
 * AORNLASO Universe Core 0.4.0
 * Independent astronomical coordinate and distance engine.
 * Canonical unit: parsecs.
 */

export const ASTRONOMICAL_UNITS = Object.freeze({
  metersPerAU: 149_597_870_700,
  metersPerLightYear: 9_460_730_472_580_800,
  metersPerParsec: 30_856_775_814_913_673,
  lightYearsPerParsec: 3.261563777,
  AUPerParsec: 206_264.80624709636,
});

export type Vector3Number = Readonly<{ x: number; y: number; z: number }>;

export type CosmicAxis = Readonly<{
  cell: bigint;
  offsetPc: number;
}>;

export type CosmicCoordinate = Readonly<{
  x: CosmicAxis;
  y: CosmicAxis;
  z: CosmicAxis;
}>;

export type CosmicAxisParts = Readonly<{
  wholePc: bigint;
  fractionalPc: number;
}>;

export type CosmicCoordinateParts = Readonly<{
  x: CosmicAxisParts;
  y: CosmicAxisParts;
  z: CosmicAxisParts;
}>;

export type LocalCoordinate = Vector3Number;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

function normalizeAxis(cell: bigint, offsetPc: number): CosmicAxis {
  assertFinite(offsetPc, "offsetPc");
  const carry = Math.floor(offsetPc + 0.5);

  if (!Number.isSafeInteger(carry)) {
    throw new RangeError("Axis offset is too large to normalize safely");
  }

  return Object.freeze({
    cell: cell + BigInt(carry),
    offsetPc: offsetPc - carry,
  });
}

function makeAxis(parsecs: number): CosmicAxis {
  assertFinite(parsecs, "parsecs");
  const whole = Math.trunc(parsecs);
  return normalizeAxis(BigInt(whole), parsecs - whole);
}

/**
 * Creates exact cosmic coordinates from integer and fractional parsec parts.
 * Use this API for very large catalog coordinates that exceed Number precision.
 */
export function coordinateFromParts(
  position: CosmicCoordinateParts,
): CosmicCoordinate {
  return Object.freeze({
    x: normalizeAxis(position.x.wholePc, position.x.fractionalPc),
    y: normalizeAxis(position.y.wholePc, position.y.fractionalPc),
    z: normalizeAxis(position.z.wholePc, position.z.fractionalPc),
  });
}

export function coordinateFromParsecs(
  position: Vector3Number,
): CosmicCoordinate {
  return Object.freeze({
    x: makeAxis(position.x),
    y: makeAxis(position.y),
    z: makeAxis(position.z),
  });
}

export function coordinateFromLightYears(
  position: Vector3Number,
): CosmicCoordinate {
  const factor = 1 / ASTRONOMICAL_UNITS.lightYearsPerParsec;
  return coordinateFromParsecs({
    x: position.x * factor,
    y: position.y * factor,
    z: position.z * factor,
  });
}

export function coordinateFromAU(
  position: Vector3Number,
): CosmicCoordinate {
  const factor = 1 / ASTRONOMICAL_UNITS.AUPerParsec;
  return coordinateFromParsecs({
    x: position.x * factor,
    y: position.y * factor,
    z: position.z * factor,
  });
}

function axisDeltaParsecs(from: CosmicAxis, to: CosmicAxis): number {
  return Number(to.cell - from.cell) + (to.offsetPc - from.offsetPc);
}

/**
 * Returns an exact displacement vector without converting large integers
 * to JavaScript Number.
 */
export function displacementExact(
  origin: CosmicCoordinate,
  target: CosmicCoordinate,
): CosmicCoordinate {
  return Object.freeze({
    x: normalizeAxis(
      target.x.cell - origin.x.cell,
      target.x.offsetPc - origin.x.offsetPc,
    ),
    y: normalizeAxis(
      target.y.cell - origin.y.cell,
      target.y.offsetPc - origin.y.offsetPc,
    ),
    z: normalizeAxis(
      target.z.cell - origin.z.cell,
      target.z.offsetPc - origin.z.offsetPc,
    ),
  });
}

export function displacementParsecs(
  origin: CosmicCoordinate,
  target: CosmicCoordinate,
): Vector3Number {
  return {
    x: axisDeltaParsecs(origin.x, target.x),
    y: axisDeltaParsecs(origin.y, target.y),
    z: axisDeltaParsecs(origin.z, target.z),
  };
}

export function distanceParsecs(
  a: CosmicCoordinate,
  b: CosmicCoordinate,
): number {
  const delta = displacementParsecs(a, b);
  return Math.hypot(delta.x, delta.y, delta.z);
}

export function displacementLightYears(
  origin: CosmicCoordinate,
  target: CosmicCoordinate,
): Vector3Number {
  const delta = displacementParsecs(origin, target);
  const factor = ASTRONOMICAL_UNITS.lightYearsPerParsec;
  return {
    x: delta.x * factor,
    y: delta.y * factor,
    z: delta.z * factor,
  };
}

export function addDisplacementParsecs(
  origin: CosmicCoordinate,
  displacement: Vector3Number,
): CosmicCoordinate {
  return Object.freeze({
    x: normalizeAxis(origin.x.cell, origin.x.offsetPc + displacement.x),
    y: normalizeAxis(origin.y.cell, origin.y.offsetPc + displacement.y),
    z: normalizeAxis(origin.z.cell, origin.z.offsetPc + displacement.z),
  });
}

export function toLocalLightYears(
  position: CosmicCoordinate,
  origin: CosmicCoordinate,
  renderUnitsPerLightYear = 1,
): LocalCoordinate {
  assertFinite(renderUnitsPerLightYear, "renderUnitsPerLightYear");

  if (renderUnitsPerLightYear <= 0) {
    throw new RangeError("renderUnitsPerLightYear must be greater than zero");
  }

  const delta = displacementLightYears(origin, position);

  return {
    x: delta.x * renderUnitsPerLightYear,
    y: delta.y * renderUnitsPerLightYear,
    z: delta.z * renderUnitsPerLightYear,
  };
}

export function convertDistance(
  value: number,
  from: "AU" | "ly" | "pc",
  to: "AU" | "ly" | "pc",
): number {
  assertFinite(value, "value");

  const validUnits = ["AU", "ly", "pc"];
  if (!validUnits.includes(from) || !validUnits.includes(to)) {
    throw new RangeError("Unsupported astronomical distance unit");
  }

  const parsecs = value / (
    from === "AU"
      ? ASTRONOMICAL_UNITS.AUPerParsec
      : from === "ly"
        ? ASTRONOMICAL_UNITS.lightYearsPerParsec
        : 1
  );

  return parsecs * (
    to === "AU"
      ? ASTRONOMICAL_UNITS.AUPerParsec
      : to === "ly"
        ? ASTRONOMICAL_UNITS.lightYearsPerParsec
        : 1
  );
}
