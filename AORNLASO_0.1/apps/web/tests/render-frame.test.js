import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function loadTS(path) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;

  return import(
    'data:text/javascript;base64,' +
    Buffer.from(js).toString('base64')
  );
}

const core = await loadTS('src/universe/UniverseCore.ts');

const renderSource = fs.readFileSync('src/universe/RenderFrame.ts', 'utf8')
  .replace(
    /from "\.\/UniverseCore"/,
    'from "data:text/javascript;base64,' +
      Buffer.from(
        ts.transpileModule(
          fs.readFileSync('src/universe/UniverseCore.ts', 'utf8'),
          {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ES2022,
            },
          },
        ).outputText,
      ).toString('base64') +
      '"',
  );

const renderJS = ts.transpileModule(renderSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const frame = await import(
  'data:text/javascript;base64,' +
  Buffer.from(renderJS).toString('base64')
);

const origin = core.coordinateFromParsecs({ x: 0, y: 0, z: 0 });

test('Project nearby cosmic position into local render coordinates', () => {
  const position = core.coordinateFromLightYears({
    x: 10, y: 20, z: -30,
  });
  const renderFrame = frame.createRenderFrame(origin);
  const local = frame.projectToRenderFrame(position, renderFrame);

  assert.ok(local);
  assert.ok(Math.abs(local.x - 10) < 1e-9);
  assert.ok(Math.abs(local.y - 20) < 1e-9);
  assert.ok(Math.abs(local.z + 30) < 1e-9);
});

test('Cull objects outside render distance', () => {
  const position = core.coordinateFromLightYears({
    x: 600, y: 0, z: 0,
  });
  const renderFrame = frame.createRenderFrame(origin, {
    maxRenderDistanceLy: 500,
  });

  assert.equal(frame.projectToRenderFrame(position, renderFrame), null);
});

test('Keep objects at the render distance boundary', () => {
  const position = core.coordinateFromLightYears({
    x: 500, y: 0, z: 0,
  });
  const renderFrame = frame.createRenderFrame(origin, {
    maxRenderDistanceLy: 500,
  });

  assert.ok(frame.projectToRenderFrame(position, renderFrame));
});

test('Do not rebase while observer is inside threshold', () => {
  const observer = core.coordinateFromLightYears({
    x: 50, y: 0, z: 0,
  });
  const renderFrame = frame.createRenderFrame(origin, {
    rebaseDistanceLy: 100,
  });

  assert.equal(
    frame.shouldRebaseRenderFrame(observer, renderFrame),
    false,
  );
});

test('Rebase when observer reaches threshold', () => {
  const observer = core.coordinateFromLightYears({
    x: 100, y: 0, z: 0,
  });
  const renderFrame = frame.createRenderFrame(origin, {
    rebaseDistanceLy: 100,
  });

  assert.equal(
    frame.shouldRebaseRenderFrame(observer, renderFrame),
    true,
  );

  const rebased = frame.rebaseRenderFrame(observer, renderFrame);
  assert.equal(rebased.origin.x.cell, observer.x.cell);
  assert.equal(rebased.origin.x.offsetPc, observer.x.offsetPc);
});

test('Preserve small local displacement at huge cosmic coordinates', () => {
  const huge = 10n ** 30n;

  const a = core.coordinateFromParts({
    x: { wholePc: huge, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  const b = core.addDisplacementParsecs(a, {
    x: 0.25, y: 0, z: 0,
  });

  const renderFrame = frame.createRenderFrame(a);
  const local = frame.projectToRenderFrame(b, renderFrame);

  assert.ok(local, 'Nearby position should remain renderable');
  assert.ok(Math.abs(local.x - 0.25 * 3.261563777) < 1e-9);
});

test('Reject invalid render frame configuration', () => {
  assert.throws(() => frame.createRenderFrame(origin, {
    rebaseDistanceLy: 500,
    maxRenderDistanceLy: 500,
  }));

  assert.throws(() => frame.createRenderFrame(origin, {
    renderUnitsPerLightYear: 0,
  }));
});

test('Enforce maximum render coordinate units and preserve them after rebasing', () => {
  assert.throws(() => frame.createRenderFrame(origin, {
    maxRenderDistanceLy: 500,
    renderUnitsPerLightYear: 30,
    maxRenderCoordinateUnits: 10_000,
  }));

  const boundaryFrame = frame.createRenderFrame(origin, {
    maxRenderDistanceLy: 500,
    renderUnitsPerLightYear: 20,
    maxRenderCoordinateUnits: 10_000,
  });

  assert.equal(boundaryFrame.maxRenderCoordinateUnits, 10_000);

  const observer = core.coordinateFromLightYears({
    x: 10, y: 0, z: 0,
  });

  const customFrame = frame.createRenderFrame(origin, {
    rebaseDistanceLy: 5,
    maxRenderDistanceLy: 20,
    renderUnitsPerLightYear: 100,
    maxRenderCoordinateUnits: 2_000,
  });

  const rebased = frame.rebaseRenderFrame(observer, customFrame);

  assert.equal(rebased.maxRenderCoordinateUnits, 2_000);
});

test('Render frame must isolate its origin from external mutation', () => {
  const mutableOrigin = {
    x: { cell: 0n, offsetPc: 0 },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  const renderFrame = frame.createRenderFrame(mutableOrigin);

  mutableOrigin.x.cell = 100n;
  mutableOrigin.x.offsetPc = 0.25;

  assert.equal(renderFrame.origin.x.cell, 0n);
  assert.equal(renderFrame.origin.x.offsetPc, 0);
  assert.ok(Object.isFrozen(renderFrame.origin));
  assert.ok(Object.isFrozen(renderFrame.origin.x));
});
