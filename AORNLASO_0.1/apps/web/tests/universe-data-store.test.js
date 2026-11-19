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

const core = await import(coreUrl);
const { UniverseDataStore } = await import(storeUrl);

function pc(x, y = 0, z = 0) {
  return core.coordinateFromParsecs({ x, y, z });
}

function makeBody(id, x = 0, metadata = {}) {
  return {
    id,
    name: id,
    type: 'star',
    position: {
      coordinate: pc(x),
      referenceFrame: 'ICRS',
      epoch: 'J2000.0',
    },
    properties: {},
    metadata,
  };
}

test('Start with an empty store', () => {
  const store = new UniverseDataStore();

  assert.equal(store.size, 0);
  assert.deepEqual(store.getAll(), []);
  assert.equal(store.has('missing'), false);
});

test('Add and retrieve a valid celestial body', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 12));

  assert.equal(store.size, 1);
  assert.equal(store.has('star-1'), true);
  assert.equal(store.get('star-1').name, 'star-1');
});

test('Reject invalid celestial bodies', () => {
  const store = new UniverseDataStore();
  const body = makeBody('invalid');

  body.position.coordinate = {
    x: { cell: 0, offsetPc: 0 },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  assert.throws(() => store.add(body), /Invalid celestial body/);
  assert.equal(store.size, 0);
});

test('Reject duplicate IDs without changing the existing body', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 10));

  assert.throws(
    () => store.add(makeBody('star-1', 20)),
    /already exists/,
  );

  assert.equal(store.get('star-1').position.coordinate.x.cell, 10n);
});

test('Isolate stored data from later input mutations', () => {
  const store = new UniverseDataStore();
  const body = makeBody('star-1', 10, {
    details: { classification: 'G' },
  });

  store.add(body);

  body.name = 'modified';
  body.position.coordinate = pc(500);
  body.metadata.details.classification = 'changed';

  const stored = store.get('star-1');

  assert.equal(stored.name, 'star-1');
  assert.equal(stored.position.coordinate.x.cell, 10n);
  assert.equal(stored.metadata.details.classification, 'G');
});

test('Prevent mutation through retrieved snapshots', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 10, {
    details: { classification: 'G' },
  }));

  const copy = store.get('star-1');

  assert.throws(() => {
    copy.name = 'changed';
  }, TypeError);

  assert.throws(() => {
    copy.metadata.details.classification = 'changed';
  }, TypeError);

  assert.equal(store.get('star-1').name, 'star-1');
  assert.equal(
    store.get('star-1').metadata.details.classification,
    'G',
  );
});

test('Return independent snapshots from getAll', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1'));
  store.add(makeBody('star-2', 20));

  const bodies = store.getAll();

  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0], bodies[1]);
  assert.ok(Object.isFrozen(bodies[0]));
  assert.ok(Object.isFrozen(bodies[1]));
});

test('Reject circular metadata', () => {
  const store = new UniverseDataStore();
  const metadata = {};
  metadata.self = metadata;

  assert.throws(
    () => store.add(makeBody('star-1', 0, metadata)),
    /circular reference/,
  );

  assert.equal(store.size, 0);
});

test('Reject unsupported object types in metadata', () => {
  const store = new UniverseDataStore();

  assert.throws(
    () => store.add(makeBody('star-1', 0, {
      created: new Date(),
    })),
    /plain objects/,
  );

  assert.equal(store.size, 0);
});

test('Reject accessor properties instead of executing them', () => {
  const store = new UniverseDataStore();
  const metadata = {};

  Object.defineProperty(metadata, 'secret', {
    enumerable: true,
    get() {
      throw new Error('Getter must not execute');
    },
  });

  assert.throws(
    () => store.add(makeBody('star-1', 0, metadata)),
    /accessor/,
  );

  assert.equal(store.size, 0);
});

test('Update a body and its spatial position', () => {
  const store = new UniverseDataStore();

  store.add(makeBody('star-1', 10));
  store.update(makeBody('star-1', 50));

  assert.equal(store.get('star-1').position.coordinate.x.cell, 50n);
  assert.equal(store.queryNearby(pc(10), 1).length, 0);
  assert.equal(store.queryNearby(pc(50), 1).length, 1);
});

test('Reject update of a missing body', () => {
  const store = new UniverseDataStore();

  assert.throws(
    () => store.update(makeBody('missing')),
    /does not exist/,
  );

  assert.equal(store.size, 0);
});

test('Preserve previous data and index after invalid update', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 10));

  const invalid = makeBody('star-1', 50);
  invalid.position.coordinate = {
    x: { cell: 0, offsetPc: 0 },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  assert.throws(
    () => store.update(invalid),
    /Invalid celestial body/,
  );

  assert.equal(store.get('star-1').position.coordinate.x.cell, 10n);
  assert.equal(store.queryNearby(pc(10), 1).length, 1);
  assert.equal(store.queryNearby(pc(50), 1).length, 0);
});

test('Upsert inserts a new body and updates an existing one', () => {
  const store = new UniverseDataStore();

  store.upsert(makeBody('star-1', 10));
  assert.equal(store.size, 1);

  store.upsert(makeBody('star-1', 30));
  assert.equal(store.size, 1);
  assert.equal(store.get('star-1').position.coordinate.x.cell, 30n);

  store.upsert(makeBody('star-2', 40));
  assert.equal(store.size, 2);
});

test('Remove a body from storage and spatial index', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 10));

  assert.equal(store.remove('star-1'), true);
  assert.equal(store.remove('star-1'), false);
  assert.equal(store.has('star-1'), false);
  assert.equal(store.size, 0);
  assert.equal(store.queryNearby(pc(10), 1).length, 0);
});

test('Query nearby bodies in ascending distance order', () => {
  const store = new UniverseDataStore();

  store.add(makeBody('far', 8));
  store.add(makeBody('near', 2));
  store.add(makeBody('middle', 5));

  const results = store.queryNearby(pc(0), 10);

  assert.deepEqual(
    results.map((result) => result.body.id),
    ['near', 'middle', 'far'],
  );

  assert.deepEqual(
    results.map((result) => result.distancePc),
    [2, 5, 8],
  );
});

test('Return isolated bodies from spatial queries', () => {
  const store = new UniverseDataStore();
  store.add(makeBody('star-1', 10));

  const results = store.queryNearby(pc(10), 1);

  assert.equal(results.length, 1);
  assert.ok(Object.isFrozen(results[0].body));

  assert.throws(() => {
    results[0].body.name = 'changed';
  }, TypeError);

  assert.equal(store.get('star-1').name, 'star-1');
});

test('Preserve large cosmic coordinates', () => {
  const store = new UniverseDataStore();
  const body = makeBody('distant-star');

  body.position.coordinate = core.coordinateFromParts({
    x: { wholePc: 10n ** 30n, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  store.add(body);

  const stored = store.get('distant-star');

  assert.equal(
    stored.position.coordinate.x.cell,
    10n ** 30n,
  );
});

test('Clear storage and spatial index together', () => {
  const store = new UniverseDataStore();

  store.add(makeBody('star-1', 10));
  store.add(makeBody('star-2', 20));

  store.clear();

  assert.equal(store.size, 0);
  assert.deepEqual(store.getAll(), []);
  assert.equal(store.has('star-1'), false);
  assert.equal(store.queryNearby(pc(10), 100).length, 0);
});
