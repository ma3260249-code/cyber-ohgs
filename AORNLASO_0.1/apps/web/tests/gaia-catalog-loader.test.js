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

const loaderUrl = transpileUrl(
  'src/universe/GaiaCatalogLoader.ts',
  {
    './UniverseCore': coreUrl,
    './CelestialBody': bodyUrl,
    './UniverseDataStore': storeUrl,
  },
);

const { UniverseDataStore } = await import(storeUrl);
const { loadGaiaCatalog } = await import(loaderUrl);

const catalogPath =
  'public/data/catalogs/gaia-dr3/processed/' +
  'gaia_dr3_bright_nearby_sample_200.json';

test('Load all real Gaia DR3 sample records', () => {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const store = new UniverseDataStore();

  const report = loadGaiaCatalog(document, store);

  assert.equal(report.total, 200);
  assert.equal(report.loaded, 200);
  assert.equal(report.rejected, 0);
  assert.equal(store.size, 200);
  assert.deepEqual(report.errors, []);
});

test('Restore BigInt coordinates and preserve scientific metadata', () => {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const store = new UniverseDataStore();

  loadGaiaCatalog(document, store);

  const original = document.records[0];
  const body = store.get(original.id);

  assert.equal(typeof body.position.coordinate.x.cell, 'bigint');
  assert.equal(
    body.position.coordinate.x.cell,
    BigInt(original.position.coordinate.x.cell),
  );

  assert.equal(
    body.position.coordinate.x.offsetPc,
    original.position.coordinate.x.offsetPc,
  );

  assert.equal(body.position.referenceFrame, 'ICRS');
  assert.equal(body.position.source.name, 'Gaia DR3');
  assert.equal(body.metadata.sourceId, original.metadata.sourceId);
  assert.equal(
    body.metadata.derivedPosition.distancePc,
    original.metadata.derivedPosition.distancePc,
  );
});

test('Reject unsupported catalog schema', () => {
  const store = new UniverseDataStore();

  assert.throws(
    () => loadGaiaCatalog({ schema: 'invalid', records: [], recordCount: 0 }, store),
    /Unsupported Gaia catalog schema/,
  );

  assert.equal(store.size, 0);
});

test('Reject mismatched record count without importing records', () => {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  document.recordCount++;

  const store = new UniverseDataStore();

  assert.throws(
    () => loadGaiaCatalog(document, store),
    /record count mismatch/,
  );

  assert.equal(store.size, 0);
});

test('Reject malformed coordinate cells without corrupting the store', () => {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  document.records[0].position.coordinate.x.cell = 'not-an-integer';

  const store = new UniverseDataStore();
  const report = loadGaiaCatalog(document, store);

  assert.equal(report.loaded, 199);
  assert.equal(report.rejected, 1);
  assert.equal(store.size, 199);
  assert.match(report.errors[0], /Invalid coordinate cell/);
});

test('Report duplicate IDs while preserving existing records', () => {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const store = new UniverseDataStore();

  const first = document.records[0];
  const existing = {
    ...first,
    position: {
      ...first.position,
      coordinate: {
        x: { cell: BigInt(first.position.coordinate.x.cell), offsetPc: first.position.coordinate.x.offsetPc },
        y: { cell: BigInt(first.position.coordinate.y.cell), offsetPc: first.position.coordinate.y.offsetPc },
        z: { cell: BigInt(first.position.coordinate.z.cell), offsetPc: first.position.coordinate.z.offsetPc },
      },
    },
  };

  store.add(existing);

  const report = loadGaiaCatalog(document, store);

  assert.equal(report.loaded, 199);
  assert.equal(report.rejected, 1);
  assert.equal(store.size, 200);
  assert.match(report.errors[0], /already exists/);
});
