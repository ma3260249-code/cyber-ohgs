import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import fs from "node:fs";
import ts from "typescript";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = fs.readFileSync(
  "src/universe/GaiaThreeRenderer.ts",
  "utf8",
);

const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const temporaryFile = path.resolve(
  "tests/.gaia-three-renderer-test-module.mjs",
);

fs.writeFileSync(temporaryFile, js);

let GaiaThreeRenderer;

try {
  ({ GaiaThreeRenderer } = await import(
    pathToFileURL(temporaryFile).href
  ));
} finally {
  fs.rmSync(temporaryFile, { force: true });
}

function makeBody(x, y, z) {
  return {
    body: {},
    position: { x, y, z },
    distancePc: 1,
  };
}

test("Create Gaia points inside the Three.js scene", () => {
  const scene = new THREE.Scene();
  const renderer = new GaiaThreeRenderer(scene);

  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0].name, "AORNLASO_GAIA_DR3_STARS");

  renderer.dispose();
});

test("Update geometry with real projected star positions", () => {
  const scene = new THREE.Scene();
  const renderer = new GaiaThreeRenderer(scene);

  assert.equal(renderer.update([
    makeBody(1, 2, 3),
    makeBody(-4, 5, 6),
    makeBody(7, 8, -9),
  ]), 3);

  assert.equal(renderer.getCount(), 3);

  const positions = scene.children[0].geometry.getAttribute("position");

  assert.equal(positions.getX(0), 1);
  assert.equal(positions.getY(0), 2);
  assert.equal(positions.getZ(0), 3);
  assert.equal(positions.getX(1), -4);
  assert.equal(positions.getY(1), 5);
  assert.equal(positions.getZ(1), 6);
  assert.equal(positions.getX(2), 7);
  assert.equal(positions.getY(2), 8);
  assert.equal(positions.getZ(2), -9);

  renderer.dispose();
});

test("Update existing geometry with a new star count", () => {
  const scene = new THREE.Scene();
  const renderer = new GaiaThreeRenderer(scene);

  renderer.update([makeBody(1, 0, 0), makeBody(2, 0, 0)]);
  assert.equal(renderer.getCount(), 2);

  renderer.update([makeBody(3, 0, 0)]);
  assert.equal(renderer.getCount(), 1);

  renderer.dispose();
});

test("Dispose removes Gaia points from the scene", () => {
  const scene = new THREE.Scene();
  const renderer = new GaiaThreeRenderer(scene);

  renderer.update([makeBody(1, 2, 3)]);
  renderer.dispose();
  renderer.dispose();

  assert.equal(scene.children.length, 0);
  assert.throws(() => renderer.update([]), /has been disposed/);
});

test("Empty Gaia catalog produces empty geometry", () => {
  const scene = new THREE.Scene();
  const renderer = new GaiaThreeRenderer(scene);

  assert.equal(renderer.update([]), 0);
  assert.equal(renderer.getCount(), 0);

  renderer.dispose();
});
