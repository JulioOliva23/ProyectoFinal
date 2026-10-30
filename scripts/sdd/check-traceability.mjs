#!/usr/bin/env node
/* eslint-disable no-console -- a command line tool: printing the report is its job */
// SDD traceability check (constitution C2.3 / C4.1).
//
//   node scripts/sdd/check-traceability.mjs [--detail] <test dir> [<test dir> ...]
//
// For every spec in specs/NNN-name/spec.md that is not a proposal:
//   * each requirement ("**RF-n · ...") and each acceptance criterion ("- RF-n.m")
//     needs at least one test whose title carries a tag such as [001/RF-2.2];
// and for every tag found in the tests:
//   * the requirement it names must exist in that spec (no typos, no rot).
// Prints a Markdown report (usable as a job summary) and exits 1 on any gap.
// --detail also lists, per requirement, the tests that prove it; that is what
// specs/trazabilidad.md keeps (npm run sdd:report).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const specsDir = join(root, 'specs');
const args = process.argv.slice(2);
const detail = args.includes('--detail');
const testDirs = args.filter((arg) => !arg.startsWith('--')).map((dir) => resolve(root, dir));

if (testDirs.length === 0) {
  console.error('Usage: check-traceability.mjs [--detail] <test dir> [<test dir> ...]');
  process.exit(2);
}

const TEST_FILE = /\.(spec|test|e2e-spec)\.(ts|tsx)$/;
const TAG = /\[(\d{3})\/(RF-\d+(?:\.\d+)?)\]/g;
const TITLE = /(?:\b(?:it|test)\(|\]\)\()(['"`])(.*?)\1\s*,/;
const TEST_CALL = /\b(it|test|describe)(\.each\([^)]*\))?\(|^\s*\]\)\(['"`]/;
const byRequirement = (a, b) => Number(a.slice(3)) - Number(b.slice(3));
const relative = (file) => file.replace(root, '').replaceAll('\\', '/').replace(/^\//, '');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'generated') return [];
    return statSync(path).isDirectory() ? walk(path) : TEST_FILE.test(name) ? [path] : [];
  });
}

// Spec -> { proposal, top: Set("RF-1"), all: Set("RF-1", "RF-1.1") }
const specs = new Map();
for (const folder of readdirSync(specsDir).filter((name) => /^\d{3}-/.test(name))) {
  const text = readFileSync(join(specsDir, folder, 'spec.md'), 'utf8');
  const status = /\*\*Estado:\*\*\s*([^\n·]+)/.exec(text)?.[1]?.trim() ?? '';
  const top = new Set([...text.matchAll(/^\*\*(RF-\d+) ·/gm)].map((match) => match[1]));
  const sub = [...text.matchAll(/^- (RF-\d+\.\d+) /gm)].map((match) => match[1]);
  specs.set(folder.slice(0, 3), { folder, proposal: /^Propuesta/i.test(status), top, all: new Set([...top, ...sub]) });
}

const covered = new Set(); // "001/RF-2"
const taggedExactly = new Set(); // "001/RF-2.2"
const proofs = new Map(); // "001/RF-2" -> [{ tag, file, title }]
const errors = [];
for (const file of testDirs.flatMap(walk)) {
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (!TEST_CALL.test(line)) return;
      for (const [, number, id] of line.matchAll(TAG)) {
        const spec = specs.get(number);
        const where = `${relative(file)}:${index + 1}`;
        if (!spec) {
          errors.push(`${where} cites spec ${number}, which does not exist`);
          continue;
        }
        if (!spec.all.has(id)) {
          errors.push(`${where} cites ${number}/${id}, which ${spec.folder}/spec.md does not declare`);
          continue;
        }
        const key = `${number}/${id.split('.')[0]}`;
        covered.add(key);
        taggedExactly.add(`${number}/${id}`);
        const title = (TITLE.exec(line)?.[2] ?? line.trim()).replace(/\s*\[\d{3}\/RF-[\d.]+\]/g, '').trim();
        proofs.set(key, [...(proofs.get(key) ?? []), { tag: id, file: relative(file).split('/').pop(), title }]);
      }
    });
}

const rows = [];
let missing = 0;
let required = 0;
for (const [number, spec] of [...specs].sort()) {
  if (spec.proposal) {
    rows.push(`| ${spec.folder} | _propuesta_ | — | exenta hasta que se implemente |`);
    continue;
  }
  const tops = [...spec.top].sort(byRequirement);
  const lacking = tops.filter((id) => !covered.has(`${number}/${id}`));
  required += tops.length;
  missing += lacking.length;
  rows.push(`| ${spec.folder} | ${tops.length} | ${tops.length - lacking.length} | ${lacking.length ? `❌ sin test: ${lacking.join(', ')}` : '✅'} |`);
}

console.log('## Trazabilidad spec → test\n');
console.log('| Spec | Requisitos | Con test | Estado |\n| --- | --- | --- | --- |');
console.log(rows.join('\n'));
console.log(`\n${required - missing} de ${required} requisitos tienen al menos un test etiquetado.`);

// Every acceptance criterion (RF-n.m) needs its own tagged test too (C4.1).
let subTotal = 0;
const lackingSubs = [];
for (const [number, spec] of [...specs].sort()) {
  if (spec.proposal) continue;
  for (const id of [...spec.all].filter((candidate) => !spec.top.has(candidate)).sort()) {
    subTotal += 1;
    if (!taggedExactly.has(`${number}/${id}`)) lackingSubs.push(`${number}/${id}`);
  }
}
console.log(`${subTotal - lackingSubs.length} de ${subTotal} criterios de aceptación (RF-n.m) tienen su propio test etiquetado.`);
if (lackingSubs.length > 0) {
  console.log('\n### Criterios sin test\n');
  console.log(lackingSubs.map((id) => `- ${id}`).join('\n'));
}
if (errors.length > 0) {
  console.log('\n### Etiquetas inválidas\n');
  for (const error of errors) console.log(`- ${error}`);
}

if (detail) {
  console.log('\n## Requisito → tests\n');
  for (const [number, spec] of [...specs].sort()) {
    if (spec.proposal) continue;
    console.log(`### ${spec.folder}\n`);
    console.log('| Requisito | Tests que lo prueban |\n| --- | --- |');
    for (const id of [...spec.top].sort(byRequirement)) {
      const list = proofs.get(`${number}/${id}`) ?? [];
      const cell = list.length === 0 ? '❌ ninguno' : list.map((proof) => `\`${proof.tag}\` ${proof.title} _(${proof.file})_`).join('<br>');
      console.log(`| ${id} | ${cell} |`);
    }
    console.log('');
  }
}

process.exit(missing > 0 || lackingSubs.length > 0 || errors.length > 0 ? 1 : 0);
