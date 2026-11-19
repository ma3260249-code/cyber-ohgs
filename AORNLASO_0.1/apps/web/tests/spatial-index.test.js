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

const bodySource = fs.readFileSync(
  'src/universe/CelestialBody.ts',
  'utf8',
);

const coreUrl =
  'data:text/javascript;base64,' +
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
  ).toString('base64');

const bodyJS = ts.transpileModule(
  bodySource.replace(
    'from "./UniverseCore"',
    `from "${coreUrl}"`,
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;

const bodyModule = await import(
  'data:text/javascript;base64,' +
  Buffer.from(bodyJS).toString('base64')
);

const spatialSource = fs.readFileSync(
  'src/universe/SpatialIndex.ts',
  'utf8',
).replace(
  'from "./UniverseCore"',
  `from "${coreUrl}"`,
).replace(
  'from "./CelestialBody"',
  `from "${'data:text/javascript;base64,' + Buffer.from(bodyJS).toString('base64')}"`,
);

const spatialJS = ts.transpileModule(spatialSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const spatialModule = await import(
  'data:text/javascript;base64,' +
  Buffer.from(spatialJS).toString('base64')
);

const { SpatialIndex } = spatialModule;

function makeBody(id, position) {
  return {
    id,
    name: id,
    type: 'star',
    position: {
      coordinate: position,
      referenceFrame: 'ICRS',
      epoch: 'J2000.0',
    },
    properties: {},
  };
}

function pc(x, y = 0, z = 0) {
  return core.coordinateFromParsecs({ x, y, z });
}

test('Index starts empty', () => {
  const index = new SpatialIndex();

  assert.equal(index.size, 0);
  assert.equal(index.get('missing'), undefined);
});

test('Add and retrieve a celestial body', () => {
  const index = new SpatialIndex();
  const body = makeBody('star-1', pc(5));

  index.add(body);

  assert.equal(index.size, 1);
  assert.equal(index.get('star-1'), body);
});

test('Reject duplicate body IDs', () => {
  const index = new SpatialIndex();
  index.add(makeBody('star-1', pc(5)));

  assert.throws(
    () => index.add(makeBody('star-1', pc(8))),
    /already indexed/,
  );

  assert.equal(index.size, 1);
});

test('Find bodies inside the requested radius', () => {
  const index = new SpatialIndex();

  index.add(makeBody('near', pc(3)));
  index.add(makeBody('middle', pc(8)));
  index.add(makeBody('far', pc(20)));

  const results = index.query(pc(0), 10);

  assert.deepEqual(
    results.map(result => result.body.id),
    ['near', 'middle'],
  );
});

test('Return exact distances and sort nearest first', () => {
  const index = new SpatialIndex();

  index.add(makeBody('farther', pc(4)));
  index.add(makeBody('nearest', pc(1)));
  index.add(makeBody('diagonal', pc(0, 3, 4)));

  const results = index.query(pc(0), 10);

  assert.deepEqual(
    results.map(result => result.body.id),
    ['nearest', 'farther', 'diagonal'],
  );

  assert.equal(results[0].distancePc, 1);
  assert.equal(results[1].distancePc, 4);
  assert.equal(results[2].distancePc, 5);
});

test('Include a body exactly on the radius boundary', () => {
  const index = new SpatialIndex();

  index.add(makeBody('boundary', pc(10)));

  assert.equal(index.query(pc(0), 10).length, 1);
});

test('Find bodies across positive cell boundaries', () => {
  const index = new SpatialIndex({ cellSizePc: 10 });

  index.add(makeBody('boundary-neighbor', pc(10.2)));

  const results = index.query(pc(9.8), 1);

  assert.equal(results.length, 1);
  assert.equal(results[0].body.id, 'boundary-neighbor');
});

test('Find bodies in negative coordinate cells', () => {
  const index = new SpatialIndex({ cellSizePc: 10 });

  index.add(makeBody('negative', pc(-15)));

  const results = index.query(pc(-14), 2);

  assert.equal(results.length, 1);
  assert.equal(results[0].distancePc, 1);
});

test('Find bodies across the zero boundary', () => {
  const index = new SpatialIndex({ cellSizePc: 10 });

  index.add(makeBody('negative-side', pc(-0.2)));

  const results = index.query(pc(0.2), 1);

  assert.equal(results.length, 1);
  assert.ok(Math.abs(results[0].distancePc - 0.4) < 1e-9);
});

test('Remove a body and its spatial entry', () => {
  const index = new SpatialIndex();

  index.add(makeBody('star-1', pc(5)));

  assert.equal(index.remove('star-1'), true);
  assert.equal(index.remove('star-1'), false);
  assert.equal(index.size, 0);
  assert.equal(index.query(pc(0), 10).length, 0);
});

test('Update a body position', () => {
  const index = new SpatialIndex();

  index.add(makeBody('moving', pc(5)));
  index.update(makeBody('moving', pc(50)));

  assert.equal(index.size, 1);
  assert.equal(index.query(pc(0), 10).length, 0);
  assert.equal(index.query(pc(50), 1).length, 1);
});

test('Clear all indexed bodies', () => {
  const index = new SpatialIndex();

  index.add(makeBody('one', pc(1)));
  index.add(makeBody('two', pc(2)));

  index.clear();

  assert.equal(index.size, 0);
  assert.equal(index.get('one'), undefined);
  assert.equal(index.get('two'), undefined);
});

test('Preserve nearby positions at huge cosmic coordinates', () => {
  const index = new SpatialIndex();

  const huge = 10n ** 30n;

  const origin = core.coordinateFromParts({
    x: { wholePc: huge, fractionalPc: 0 },
    y: { wholePc: 0n, fractionalPc: 0 },
    z: { wholePc: 0n, fractionalPc: 0 },
  });

  const nearby = core.addDisplacementParsecs(origin, {
    x: 0.25,
    y: 0,
    z: 0,
  });

  index.add(makeBody('distant-star', nearby));

  const results = index.query(origin, 1);

  assert.equal(results.length, 1);
  assert.equal(results[0].body.id, 'distant-star');
  assert.ok(Math.abs(results[0].distancePc - 0.25) < 1e-9);
});

test('Do not return objects beyond exact distance despite shared cells', () => {
  const index = new SpatialIndex({ cellSizePc: 100 });

  index.add(makeBody('inside', pc(2)));
  index.add(makeBody('outside', pc(20)));

  const results = index.query(pc(0), 5);

  assert.deepEqual(
    results.map(result => result.body.id),
    ['inside'],
  );
});

test('Reject invalid cell size', () => {
  assert.throws(
    () => new SpatialIndex({ cellSizePc: 0 }),
    /cellSizePc/,
  );

  assert.throws(
    () => new SpatialIndex({ cellSizePc: 1.5 }),
    /cellSizePc/,
  );
});

test('Reject invalid query radius', () => {
  const index = new SpatialIndex();

  assert.throws(() => index.query(pc(0), -1), /radiusPc/);
  assert.throws(() => index.query(pc(0), Infinity), /radiusPc/);
  assert.throws(() => index.query(pc(0), NaN), /radiusPc/);
});

test('Protect queries exceeding the configured cell limit', () => {
  const index = new SpatialIndex({
    cellSizePc: 1,
    maxCellsPerQuery: 100,
  });

  assert.throws(
    () => index.query(pc(0), 100),
    /exceeds maximum cells/,
  );
});

test('Preserve the previous body when an update position is invalid', () => {
  const index = new SpatialIndex();
  const original = makeBody('atomic-update', pc(5));

  index.add(original);

  const invalid = makeBody('atomic-update', pc(50));
  invalid.position.coordinate = {
    x: { cell: 0n, offsetPc: NaN },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  assert.throws(() => index.update(invalid));

  assert.equal(index.get('atomic-update'), original);

  const oldResults = index.query(pc(5), 1);
  assert.equal(oldResults.length, 1);
  assert.equal(oldResults[0].body, original);

  assert.equal(index.query(pc(50), 1).length, 0);
});
