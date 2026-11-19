import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/universe/UniverseCore.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022
  }
}).outputText;

const core = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);

test('Astronomical unit conversions', () => {
  assert.ok(Math.abs(core.convertDistance(1, 'pc', 'ly') - 3.261563777) < 1e-9);
  assert.ok(Math.abs(core.convertDistance(1, 'pc', 'AU') - 206264.80624709636) < 1e-8);
});

test('Three-dimensional distance', () => {
  const a = core.coordinateFromParsecs({ x: 0, y: 0, z: 0 });
  const b = core.coordinateFromParsecs({ x: 3, y: 4, z: 0 });
  assert.equal(core.distanceParsecs(a, b), 5);
});

test('Reject invalid numeric coordinates', () => {
  assert.throws(() => core.coordinateFromParsecs({ x: NaN, y: 0, z: 0 }));
  assert.throws(() => core.coordinateFromParsecs({ x: Infinity, y: 0, z: 0 }));
});

test('Reject invalid distance units', () => {
  assert.throws(() => core.convertDistance(1, 'invalid', 'pc'));
  assert.throws(() => core.convertDistance(1, 'pc', 'invalid'));
});

test('Preserve exact integer coordinates beyond Number precision', () => {
  const huge = 10n ** 30n;
  const p = core.coordinateFromParts({
    x: { wholePc: huge, fractionalPc: 0.125 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 }
  });
  assert.equal(p.x.cell, huge);
  assert.equal(p.x.offsetPc, 0.125);
});

test('Preserve small local displacement at huge coordinates', () => {
  const huge = 10n ** 30n;
  const a = core.coordinateFromParts({
    x: { wholePc: huge, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 }
  });
  const b = core.addDisplacementParsecs(a, { x: 0.25, y: 0, z: 0 });
  const d = core.displacementExact(a, b);
  assert.equal(d.x.cell, 0n);
  assert.equal(d.x.offsetPc, 0.25);
});

test('Preserve one parsec difference at 10^30 parsecs', () => {
  const huge = 10n ** 30n;
  const make = (n) => core.coordinateFromParts({
    x: { wholePc: n, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 }
  });
  const d = core.displacementExact(make(huge), make(huge + 1n));
  assert.equal(d.x.cell, 1n);
  assert.equal(d.x.offsetPc, 0);
});

test('Normalize negative fractional coordinates', () => {
  const p = core.coordinateFromParts({
    x: { wholePc: -10n, fractionalPc: -0.75 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 }
  });
  assert.equal(p.x.cell, -11n);
  assert.equal(p.x.offsetPc, 0.25);
});

test('Reject unsafe normalization offsets', () => {
  assert.throws(() => core.coordinateFromParts({
    x: { wholePc: 0n, fractionalPc: 1e20 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 }
  }));
});

test('Reject invalid rendering scale', () => {
  const p = core.coordinateFromParsecs({ x: 1, y: 0, z: 0 });
  const origin = core.coordinateFromParsecs({ x: 0, y: 0, z: 0 });
  assert.throws(() => core.toLocalLightYears(p, origin, 0));
});
