import {
  ASTRONOMICAL_UNITS,
  displacementExact,
  coordinateFromParts,
  type CosmicCoordinate,
  type LocalCoordinate,
} from "./UniverseCore";

export type RenderFrame = Readonly<{
  origin: CosmicCoordinate;
  rebaseDistanceLy: number;
  maxRenderDistanceLy: number;
  renderUnitsPerLightYear: number;
  maxRenderCoordinateUnits: number;
}>;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
}

function exactAxisToParsecs(
  cell: bigint,
  offsetPc: number,
): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (cell > max || cell < -max) return null;

  const result = Number(cell) + offsetPc;
  return Number.isFinite(result) ? result : null;
}

export function createRenderFrame(
  origin: CosmicCoordinate,
  options: {
    rebaseDistanceLy?: number;
    maxRenderDistanceLy?: number;
    renderUnitsPerLightYear?: number;
    maxRenderCoordinateUnits?: number;
  } = {},
): RenderFrame {
  const rebaseDistanceLy = options.rebaseDistanceLy ?? 100;
  const maxRenderDistanceLy = options.maxRenderDistanceLy ?? 500;
  const renderUnitsPerLightYear = options.renderUnitsPerLightYear ?? 1;
  const maxRenderCoordinateUnits =
    options.maxRenderCoordinateUnits ?? 10_000;

  assertPositiveFinite(rebaseDistanceLy, "rebaseDistanceLy");
  assertPositiveFinite(maxRenderDistanceLy, "maxRenderDistanceLy");
  assertPositiveFinite(renderUnitsPerLightYear, "renderUnitsPerLightYear");
  assertPositiveFinite(maxRenderCoordinateUnits, "maxRenderCoordinateUnits");

  if (rebaseDistanceLy >= maxRenderDistanceLy) {
    throw new RangeError(
      "rebaseDistanceLy must be smaller than maxRenderDistanceLy",
    );
  }

  const maximumProjectedDistance =
    maxRenderDistanceLy * renderUnitsPerLightYear;

  if (
    !Number.isFinite(maximumProjectedDistance) ||
    maximumProjectedDistance > maxRenderCoordinateUnits
  ) {
    throw new RangeError(
      "Render distance and scale exceed maxRenderCoordinateUnits",
    );
  }

  const immutableOrigin = coordinateFromParts({
    x: { wholePc: origin.x.cell, fractionalPc: origin.x.offsetPc },
    y: { wholePc: origin.y.cell, fractionalPc: origin.y.offsetPc },
    z: { wholePc: origin.z.cell, fractionalPc: origin.z.offsetPc },
  });

  return Object.freeze({
    origin: immutableOrigin,
    rebaseDistanceLy,
    maxRenderDistanceLy,
    renderUnitsPerLightYear,
    maxRenderCoordinateUnits,
  });
}

export function projectToRenderFrame(
  position: CosmicCoordinate,
  frame: RenderFrame,
): LocalCoordinate | null {
  const delta = displacementExact(frame.origin, position);

  const xPc = exactAxisToParsecs(delta.x.cell, delta.x.offsetPc);
  const yPc = exactAxisToParsecs(delta.y.cell, delta.y.offsetPc);
  const zPc = exactAxisToParsecs(delta.z.cell, delta.z.offsetPc);

  if (xPc === null || yPc === null || zPc === null) return null;

  const distanceLy =
    Math.hypot(xPc, yPc, zPc) *
    ASTRONOMICAL_UNITS.lightYearsPerParsec;

  if (
    !Number.isFinite(distanceLy) ||
    distanceLy > frame.maxRenderDistanceLy
  ) {
    return null;
  }

  const factor =
    ASTRONOMICAL_UNITS.lightYearsPerParsec *
    frame.renderUnitsPerLightYear;

  const x = xPc * factor;
  const y = yPc * factor;
  const z = zPc * factor;

  if (![x, y, z].every(Number.isFinite)) return null;

  if (
    Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) >
    frame.maxRenderCoordinateUnits
  ) {
    return null;
  }

  return { x, y, z };
}

export function shouldRebaseRenderFrame(
  observer: CosmicCoordinate,
  frame: RenderFrame,
): boolean {
  const delta = displacementExact(frame.origin, observer);

  const x = exactAxisToParsecs(delta.x.cell, delta.x.offsetPc);
  const y = exactAxisToParsecs(delta.y.cell, delta.y.offsetPc);
  const z = exactAxisToParsecs(delta.z.cell, delta.z.offsetPc);

  if (x === null || y === null || z === null) return true;

  const distanceLy =
    Math.hypot(x, y, z) *
    ASTRONOMICAL_UNITS.lightYearsPerParsec;

  return !Number.isFinite(distanceLy) ||
    distanceLy >= frame.rebaseDistanceLy;
}

export function rebaseRenderFrame(
  observer: CosmicCoordinate,
  frame: RenderFrame,
): RenderFrame {
  if (!shouldRebaseRenderFrame(observer, frame)) return frame;

  return createRenderFrame(observer, {
    rebaseDistanceLy: frame.rebaseDistanceLy,
    maxRenderDistanceLy: frame.maxRenderDistanceLy,
    renderUnitsPerLightYear: frame.renderUnitsPerLightYear,
    maxRenderCoordinateUnits: frame.maxRenderCoordinateUnits,
  });
}
