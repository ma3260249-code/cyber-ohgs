import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
}

function moduleURL(source) {
  return 'data:text/javascript;base64,' +
    Buffer.from(compile(source)).toString('base64');
}

const coreSource = fs.readFileSync('src/universe/UniverseCore.ts', 'utf8');
const coreURL = moduleURL(coreSource);

const frameSource = fs.readFileSync('src/universe/RenderFrame.ts', 'utf8')
  .replace('from "./UniverseCore"', `from "${coreURL}"`);
const frameURL = moduleURL(frameSource);

const bridgeSource = fs.readFileSync(
  'src/universe/UniverseRenderBridge.ts',
  'utf8',
)
  .replace('from "./UniverseCore"', `from "${coreURL}"`)
  .replace('from "./RenderFrame"', `from "${frameURL}"`);

const [core, bridgeModule] = await Promise.all([
  import(coreURL),
  import(moduleURL(bridgeSource)),
]);

const { UniverseRenderBridge } = bridgeModule;
const origin = core.coordinateFromParsecs({ x: 0, y: 0, z: 0 });

test('Project nearby cosmic objects into local coordinates', () => {
  const bridge = new UniverseRenderBridge(origin);
  const position = core.coordinateFromLightYears({
    x: 10, y: 20, z: -30,
  });

  const local = bridge.project(position);

  assert.ok(local);
  assert.ok(Math.abs(local.x - 10) < 1e-9);
  assert.ok(Math.abs(local.y - 20) < 1e-9);
  assert.ok(Math.abs(local.z + 30) < 1e-9);
});

test('Cull objects outside the render range', () => {
  const bridge = new UniverseRenderBridge(origin);
  const distant = core.coordinateFromLightYears({
    x: 600, y: 0, z: 0,
  });

  assert.equal(bridge.project(distant), null);
});

test('Do not rebase while observer is inside threshold', () => {
  const bridge = new UniverseRenderBridge(origin, {
    rebaseDistanceLy: 100,
  });

  const observer = core.coordinateFromLightYears({
    x: 50, y: 0, z: 0,
  });

  assert.equal(bridge.updateObserver(observer), false);
  assert.equal(bridge.getFrame().origin.x.cell, origin.x.cell);
});

test('Rebase when observer reaches threshold', () => {
  const bridge = new UniverseRenderBridge(origin, {
    rebaseDistanceLy: 100,
  });

  const observer = core.coordinateFromLightYears({
    x: 100, y: 0, z: 0,
  });

  assert.equal(bridge.updateObserver(observer), true);
  assert.equal(bridge.getFrame().origin.x.cell, observer.x.cell);
  assert.equal(bridge.getFrame().origin.x.offsetPc, observer.x.offsetPc);

  const nearby = core.coordinateFromLightYears({
    x: 105, y: 0, z: 0,
  });

  const local = bridge.project(nearby);
  assert.ok(local);
  assert.ok(Math.abs(local.x - 5) < 1e-8);
});

test('Preserve render settings after rebasing', () => {
  const bridge = new UniverseRenderBridge(origin, {
    rebaseDistanceLy: 5,
    maxRenderDistanceLy: 20,
    renderUnitsPerLightYear: 100,
    maxRenderCoordinateUnits: 2_000,
  });

  const observer = core.coordinateFromLightYears({
    x: 10, y: 0, z: 0,
  });

  assert.equal(bridge.updateObserver(observer), true);

  const frame = bridge.getFrame();
  assert.equal(frame.rebaseDistanceLy, 5);
  assert.equal(frame.maxRenderDistanceLy, 20);
  assert.equal(frame.renderUnitsPerLightYear, 100);
  assert.equal(frame.maxRenderCoordinateUnits, 2_000);
});

test('Preserve nearby positions at huge cosmic coordinates', () => {
  const huge = 10n ** 30n;
  const distantOrigin = core.coordinateFromParts({
    x: { wholePc: huge, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  const nearby = core.addDisplacementParsecs(distantOrigin, {
    x: 0.25, y: 0, z: 0,
  });

  const bridge = new UniverseRenderBridge(distantOrigin);
  const local = bridge.project(nearby);

  assert.ok(local);
  assert.ok(Math.abs(local.x - 0.25 * 3.261563777) < 1e-9);
});
