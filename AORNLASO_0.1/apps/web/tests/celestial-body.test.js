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
const celestial = await loadTS('src/universe/CelestialBody.ts');

function createValidBody(overrides = {}) {
  return {
    id: 'sol-star',
    name: 'Sun',
    type: 'star',

    position: {
      coordinate: core.coordinateFromParsecs({
        x: 0,
        y: 0,
        z: 0,
      }),
      referenceFrame: 'ICRS',
      epoch: 'J2000.0',
      source: {
        type: 'catalog',
        name: 'Solar System',
      },
    },

    properties: {
      mass: {
        value: 1.989e30,
        unit: 'kg',
        status: 'observed',
      },
      radius: {
        value: 696340000,
        unit: 'm',
        status: 'observed',
      },
      temperature: {
        value: 5772,
        unit: 'K',
        status: 'observed',
      },
      luminosity: {
        value: 3.828e26,
        unit: 'W',
        status: 'derived',
      },
    },

    ...overrides,
  };
}

test('Accept a valid celestial body', () => {
  const body = createValidBody();

  assert.deepEqual(
    celestial.validateCelestialBody(body),
    [],
  );

  assert.equal(
    celestial.isValidCelestialBody(body),
    true,
  );
});

test('Reject empty body ID', () => {
  const body = createValidBody({
    id: '   ',
  });

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Body ID cannot be empty'),
  );
});

test('Reject empty body name', () => {
  const body = createValidBody({
    name: '',
  });

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Body name cannot be empty'),
  );
});

test('Reject empty reference frame', () => {
  const body = createValidBody();

  body.position.referenceFrame = '';

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Reference frame cannot be empty'),
  );
});

test('Reject empty epoch', () => {
  const body = createValidBody();

  body.position.epoch = '';

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Position epoch cannot be empty'),
  );
});

test('Reject non-finite coordinate offset', () => {
  const body = createValidBody();

  body.position.coordinate = {
    x: { cell: 0n, offsetPc: NaN },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Coordinate offset must be finite'),
  );
});

test('Reject unnormalized coordinate offset', () => {
  const body = createValidBody();

  body.position.coordinate = {
    x: { cell: 0n, offsetPc: 0.5 },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('Coordinate offset must be normalized'),
  );
});

test('Accept unknown measurements without treating them as zero', () => {
  const body = createValidBody();

  body.properties.age = {
    value: null,
    unit: 's',
    status: 'unknown',
  };

  assert.deepEqual(
    celestial.validateCelestialBody(body),
    [],
  );

  assert.equal(body.properties.age.value, null);
});

test('Reject null measurement with non-unknown status', () => {
  const body = createValidBody();

  body.properties.age = {
    value: null,
    unit: 's',
    status: 'estimated',
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('age null value must have unknown status'),
  );
});

test('Reject unknown measurement with a known value', () => {
  const body = createValidBody();

  body.properties.age = {
    value: 1e9,
    unit: 's',
    status: 'unknown',
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('age cannot be unknown with a known value'),
  );
});

test('Reject non-finite physical measurements', () => {
  const body = createValidBody();

  body.properties.mass = {
    value: Infinity,
    unit: 'kg',
    status: 'observed',
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('mass value must be finite'),
  );
});

test('Reject empty measurement unit', () => {
  const body = createValidBody();

  body.properties.mass.unit = '';

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('mass unit cannot be empty'),
  );
});

test('Accept valid measurement uncertainty', () => {
  const body = createValidBody();

  body.properties.mass.uncertainty = {
    plus: 1e20,
    minus: 1e20,
    confidenceLevel: 95,
    method: 'Statistical uncertainty',
  };

  assert.deepEqual(
    celestial.validateCelestialBody(body),
    [],
  );
});

test('Reject negative uncertainty', () => {
  const body = createValidBody();

  body.properties.mass.uncertainty = {
    plus: -1,
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('mass positive uncertainty is invalid'),
  );
});

test('Reject invalid confidence level', () => {
  const body = createValidBody();

  body.properties.mass.uncertainty = {
    confidenceLevel: 101,
  };

  assert.ok(
    celestial.validateCelestialBody(body)
      .includes('mass confidence level is invalid'),
  );
});

test('Preserve scientific source metadata', () => {
  const body = createValidBody();

  body.properties.mass.source = {
    type: 'publication',
    name: 'Scientific reference',
    reference: 'DOI:example',
    recordId: 'mass-record-001',
  };

  assert.equal(
    body.properties.mass.source.type,
    'publication',
  );

  assert.equal(
    body.properties.mass.source.recordId,
    'mass-record-001',
  );

  assert.deepEqual(
    celestial.validateCelestialBody(body),
    [],
  );
});

test('Accept different celestial body types', () => {
  const types = [
    'star',
    'planet',
    'moon',
    'dwarf-planet',
    'asteroid',
    'comet',
    'galaxy',
    'nebula',
    'black-hole',
    'star-cluster',
    'other',
  ];

  for (const type of types) {
    const body = createValidBody({
      type,
    });

    assert.equal(
      celestial.isValidCelestialBody(body),
      true,
      `Body type ${type} should be valid`,
    );
  }
});

test('Reject unsupported celestial body type', () => {
  const body = createValidBody({ type: 'unknown-object' });
  assert.equal(celestial.isValidCelestialBody(body), false);
});

test('Reject coordinate axis with non-BigInt cell', () => {
  const body = createValidBody();
  body.position.coordinate = {
    x: { cell: 0, offsetPc: 0 },
    y: { cell: 0n, offsetPc: 0 },
    z: { cell: 0n, offsetPc: 0 },
  };
  assert.equal(celestial.isValidCelestialBody(body), false);
});

test('Handle missing position without throwing', () => {
  const body = createValidBody({ position: null });
  assert.doesNotThrow(() => celestial.validateCelestialBody(body));
  assert.equal(celestial.isValidCelestialBody(body), false);
});

test('Reject unsupported measurement status', () => {
  const body = createValidBody();
  body.properties.mass.status = 'predicted';
  assert.equal(celestial.isValidCelestialBody(body), false);
});

test('Reject unsupported scientific source type', () => {
  const body = createValidBody();
  body.properties.mass.source = { type: 'unverified-source' };
  assert.equal(celestial.isValidCelestialBody(body), false);
});

test('Handle missing coordinate axis without throwing', () => {
  const body = createValidBody();
  body.position.coordinate = {
    x: { cell: 0n, offsetPc: 0 },
    y: { cell: 0n, offsetPc: 0 },
  };
  assert.doesNotThrow(() => celestial.validateCelestialBody(body));
  assert.equal(celestial.isValidCelestialBody(body), false);
});
