import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function transpileUrl(path, replacements = {}) {
  let source = fs.readFileSync(path, 'utf8');

  for (const [original, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      `from "${original}"`,
      `from "${replacement}"`,
    );
  }

  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;

  return 'data:text/javascript;base64,' +
    Buffer.from(js).toString('base64');
}

const coreUrl = transpileUrl('src/universe/UniverseCore.ts');

const bodyUrl = transpileUrl(
  'src/universe/CelestialBody.ts',
  { './UniverseCore': coreUrl },
);

const spatialUrl = transpileUrl(
  'src/universe/SpatialIndex.ts',
  { './UniverseCore': coreUrl },
);

const storeUrl = transpileUrl(
  'src/universe/UniverseDataStore.ts',
  {
    './CelestialBody': bodyUrl,
    './SpatialIndex': spatialUrl,
  },
);

const frameUrl = transpileUrl(
  'src/universe/RenderFrame.ts',
  { './UniverseCore': coreUrl },
);

const bridgeUrl = transpileUrl(
  'src/universe/UniverseRenderBridge.ts',
  {
    './UniverseCore': coreUrl,
    './RenderFrame': frameUrl,
  },
);

const adapterUrl = transpileUrl(
  'src/universe/UniverseSceneAdapter.ts',
  {
    './UniverseCore': coreUrl,
    './CelestialBody': bodyUrl,
    './UniverseDataStore': storeUrl,
    './UniverseRenderBridge': bridgeUrl,
  },
);

const core = await import(coreUrl);
const { UniverseDataStore } = await import(storeUrl);
const { UniverseSceneAdapter } = await import(adapterUrl);

const pc = (x, y = 0, z = 0) =>
  core.coordinateFromParsecs({ x, y, z });

function makeBody(id, coordinate, metadata = {}) {
  return {
    id,
    name: id,
    type: 'star',
    position: {
      coordinate,
      referenceFrame: 'ICRS',
      epoch: 'J2000.0',
    },
    properties: {},
    metadata,
  };
}

function createAdapter(observer = pc(0)) {
  const store = new UniverseDataStore();
  const adapter = new UniverseSceneAdapter(store, observer);
  return { store, adapter };
}

test('Project a nearby celestial body into local render coordinates', () => {
  const { store, adapter } = createAdapter();

  store.add(makeBody('near-star', pc(1)));

  const result = adapter.projectNearby();

  assert.equal(result.length, 1);
  assert.equal(result[0].body.id, 'near-star');
  assert.ok(Math.abs(
    result[0].position.x - core.ASTRONOMICAL_UNITS.lightYearsPerParsec,
  ) < 1e-9);
  assert.equal(result[0].position.y, 0);
  assert.equal(result[0].position.z, 0);
  assert.equal(result[0].distancePc, 1);
});

test('Exclude bodies outside the render distance', () => {
  const { store, adapter } = createAdapter();

  store.add(makeBody('distant-star', pc(200)));

  assert.deepEqual(adapter.projectNearby(), []);
});

test('Preserve body identity and scientific metadata in projected results', () => {
  const { store, adapter } = createAdapter();

  store.add(makeBody('catalog-star', pc(2), {
    source: 'test-catalog',
    status: 'observed',
  }));

  const result = adapter.projectNearby();

  assert.equal(result.length, 1);
  assert.equal(result[0].body.metadata.source, 'test-catalog');
  assert.equal(result[0].body.metadata.status, 'observed');
  assert.ok(Object.isFrozen(result[0]));
  assert.ok(Object.isFrozen(result[0].position));
  assert.ok(Object.isFrozen(result[0].body));
});

test('Do not rebase when observer movement is below threshold', () => {
  const { adapter } = createAdapter();

  const moved = adapter.updateObserver(
    core.coordinateFromLightYears({ x: 50, y: 0, z: 0 }),
  );

  assert.equal(moved, false);
});

test('Rebase when observer crosses the configured threshold', () => {
  const { store, adapter } = createAdapter();

  const observer = core.coordinateFromLightYears({
    x: 101,
    y: 0,
    z: 0,
  });

  assert.equal(adapter.updateObserver(observer), true);

  const nearby = core.coordinateFromLightYears({
    x: 102,
    y: 0,
    z: 0,
  });

  store.add(makeBody('near-observer', nearby));

  const result = adapter.projectNearby();

  assert.equal(result.length, 1);
  assert.ok(Math.abs(result[0].position.x - 1) < 1e-8);
});

test('Preserve precise local displacement at huge cosmic coordinates', () => {
  const base = 10n ** 30n;

  const observer = core.coordinateFromParts({
    x: { wholePc: base, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  const nearby = core.coordinateFromParts({
    x: { wholePc: base + 1n, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  const { store, adapter } = createAdapter(observer);

  store.add(makeBody('deep-space-star', nearby));

  const result = adapter.projectNearby();

  assert.equal(result.length, 1);
  assert.ok(Math.abs(
    result[0].position.x - core.ASTRONOMICAL_UNITS.lightYearsPerParsec,
  ) < 1e-9);
  assert.equal(result[0].distancePc, 1);
});

test('Do not mutate stored celestial body data during projection', () => {
  const { store, adapter } = createAdapter();

  store.add(makeBody('protected-star', pc(3), {
    classification: 'G',
  }));

  adapter.projectNearby();

  const stored = store.get('protected-star');

  assert.equal(stored.name, 'protected-star');
  assert.equal(stored.metadata.classification, 'G');
  assert.ok(Object.isFrozen(stored));
});
