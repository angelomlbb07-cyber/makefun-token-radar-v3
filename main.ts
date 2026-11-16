// Token radar entry, radar-3 (Node 22/24, standard library only).
// Reads /input/snapshot.json (or --input), fits the size curve and validates
// it with lib/model.ts, writes /output/board.json, /output/data.js, copies
// dashboard/ and screenshots/ to /output, writes the runtime research note
// into the dashboard copy, and writes /output/dossier.json via vendor.
// Run locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit-v2/token-radar-01-kit/input/snapshot.json
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, researchNote } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`radar-3: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar, validation } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`radar-3: board refused: ${issue}\n`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}
const dash = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`radar-3: screenshots/ holds ${shots.length} images: need 3\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`radar-3: bad screenshot name ${name}\n`);
    process.exit(1);
  }
}
// The research note is generated from the validation this run just computed,
// so the dossier carries the model's own numbers, never asserted ones.
writeFileSync(join(out, 'dashboard', 'research.md'), researchNote(radar));
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));
process.stdout.write(
  `radar-3: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${board.length} rows\n` +
  `radar-3: fit log10(mcap) = ${validation.size_curve.a.toFixed(3)} + ${validation.size_curve.b.toFixed(3)} * log10(TVL) on ${validation.comps} comps\n` +
  `radar-3: CV median x${validation.cv.median_factor.toFixed(2)} (${Math.round(validation.cv.within_2x * 100)}% within 2x), time split median x${validation.time_split.median_factor.toFixed(2)} (${Math.round(validation.time_split.within_2x * 100)}% within 2x)\n` +
  `radar-3: growth/age ${validation.growth_age_included ? 'kept' : 'dropped'}\n` +
  `radar-3: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, dashboard (${dash.length + 1} files), screenshots (${shots.length}), ${join(out, 'dossier.json')}\n`,
);
