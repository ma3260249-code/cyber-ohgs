import fs from "node:fs";
import path from "node:path";

const root = path.resolve("public/data/catalogs/gaia-dr3");
const input = path.join(root, "raw/gaia_dr3_bright_nearby_sample_200.csv");
const output = path.join(root, "processed/gaia_dr3_bright_nearby_sample_200.json");

function parseCsvLine(line) {
  return line.split(",").map((value) => value.trim());
}

function finite(value, field, row) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${field} at CSV row ${row}`);
  }
  return number;
}

function axisFromParsecs(value) {
  if (!Number.isFinite(value)) throw new Error("Non-finite coordinate");
  const whole = Math.trunc(value);
  let cell = BigInt(whole);
  let offsetPc = value - whole;
  const carry = Math.floor(offsetPc + 0.5);
  cell += BigInt(carry);
  offsetPc -= carry;
  return { cell: cell.toString(), offsetPc };
}

if (!fs.existsSync(input)) {
  throw new Error(`Missing Gaia input file: ${input}`);
}

const lines = fs.readFileSync(input, "utf8").trim().split(/\r?\n/);
if (lines.length < 2) throw new Error("Gaia CSV contains no data rows");

const headers = parseCsvLine(lines[0]);
const required = [
  "source_id", "ref_epoch", "ra", "ra_error",
  "dec", "dec_error", "parallax", "parallax_error",
  "parallax_over_error", "pmra", "pmra_error",
  "pmdec", "pmdec_error", "phot_g_mean_mag", "bp_rp", "ruwe",
];

for (const field of required) {
  if (!headers.includes(field)) throw new Error(`Missing CSV column: ${field}`);
}

const column = Object.fromEntries(headers.map((name, index) => [name, index]));
const records = [];
const seen = new Set();

for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const values = parseCsvLine(lines[i]);
  const row = Object.fromEntries(
    headers.map((name) => [name, values[column[name]]])
  );

  const sourceId = row.source_id;
  if (!/^\d+$/.test(sourceId)) throw new Error(`Invalid source_id at row ${i + 1}`);
  if (seen.has(sourceId)) throw new Error(`Duplicate source_id: ${sourceId}`);
  seen.add(sourceId);

  const raDeg = finite(row.ra, "ra", i + 1);
  const decDeg = finite(row.dec, "dec", i + 1);
  const parallaxMas = finite(row.parallax, "parallax", i + 1);
  const parallaxErrorMas = finite(row.parallax_error, "parallax_error", i + 1);
  const snr = finite(row.parallax_over_error, "parallax_over_error", i + 1);
  const epoch = finite(row.ref_epoch, "ref_epoch", i + 1);

  if (raDeg < 0 || raDeg >= 360 || decDeg < -90 || decDeg > 90) {
    throw new Error(`Invalid sky coordinates for source ${sourceId}`);
  }
  if (parallaxMas <= 0 || parallaxErrorMas < 0 || snr <= 20) {
    throw new Error(`Invalid or insufficient parallax for source ${sourceId}`);
  }

  const distancePc = 1000 / parallaxMas;
  const ra = raDeg * Math.PI / 180;
  const dec = decDeg * Math.PI / 180;

  const x = distancePc * Math.cos(dec) * Math.cos(ra);
  const y = distancePc * Math.cos(dec) * Math.sin(ra);
  const z = distancePc * Math.sin(dec);

  const distanceUncertaintyPc =
    1000 * parallaxErrorMas / (parallaxMas * parallaxMas);

  records.push({
    id: `gaia-dr3-${sourceId}`,
    name: `Gaia DR3 ${sourceId}`,
    type: "star",
    position: {
      coordinate: {
        x: axisFromParsecs(x),
        y: axisFromParsecs(y),
        z: axisFromParsecs(z),
      },
      referenceFrame: "ICRS",
      epoch: String(epoch),
      source: {
        type: "catalog",
        name: "Gaia DR3",
        reference: "https://gea.esac.esa.int/archive/",
        recordId: sourceId,
      },
},
    properties: {},
    metadata: {
      catalog: "Gaia DR3",
      sourceId,
      measurementStatus: "observed",
      derivedPosition: {
        method: "inverse_parallax",
        formula: "distance_pc = 1000 / parallax_mas",
        coordinateMethod: "approximate ICRS Cartesian reconstruction; Solar System barycenter origin",
        distancePc,
        distanceUncertaintyPc,
      },
      astrometry: {
        raDeg,
        raErrorMas: finite(row.ra_error, "ra_error", i + 1),
        decDeg,
        decErrorMas: finite(row.dec_error, "dec_error", i + 1),
        parallaxMas,
        parallaxErrorMas,
        parallaxOverError: snr,
        pmraMasPerYear: finite(row.pmra, "pmra", i + 1),
        pmraErrorMasPerYear: finite(row.pmra_error, "pmra_error", i + 1),
        pmdecMasPerYear: finite(row.pmdec, "pmdec", i + 1),
        pmdecErrorMasPerYear: finite(row.pmdec_error, "pmdec_error", i + 1),
      },
      photometry: {
        gMagnitude: finite(row.phot_g_mean_mag, "phot_g_mean_mag", i + 1),
        bpMinusRp: finite(row.bp_rp, "bp_rp", i + 1),
      },
      quality: {
        ruwe: finite(row.ruwe, "ruwe", i + 1),
      },
    },
  });
}

const document = {
  schema: "aornlaso.gaia-dr3.catalog.v1",
  catalog: "Gaia DR3",
  source: "https://gea.esac.esa.int/archive/",
  retrievedAt: new Date().toISOString(),
  recordCount: records.length,
  coordinateEncoding: {
    axisCell: "decimal BigInt string",
    offsetUnit: "pc",
    referenceFrame: "ICRS",
    origin: "Solar System barycenter; approximate catalog-based reconstruction",
  },
  scientificNotes: [
    "Source astrometry and photometry are Gaia DR3 catalog values.",
    "Cartesian positions are derived from inverse parallax.",
    "Inverse-parallax distances are approximate and subject to measurement uncertainty and selection bias.",
    "Proper motions are retained as catalog measurements; positions are not propagated away from the Gaia reference epoch.",
    "This is a filtered bright nearby-star sample, not a complete Galactic census.",
  ],
  records,
};

fs.writeFileSync(output, JSON.stringify(document, null, 2) + "\n");
console.log(`Converted ${records.length} Gaia DR3 records`);
console.log(`Output: ${output}`);
console.log(`Unique source IDs: ${seen.size}`);
