#!/usr/bin/env node
/* Build a reviewable, deployable Apps Script source bundle.
 * This intentionally contains only the repository's canonical files. It
 * never fetches from or overwrites the live Apps Script project. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const outputFlag = process.argv.indexOf('--out');
const outputDir = path.resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : 'artifacts/apps-script');
const deployFiles = ['appsscript.json', 'Code.gs', 'index.html', 'smart_form.html', 'calling.html', 'voice.html'];

if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error('--out requires a directory.');
for (const file of deployFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Required deployable file is missing: ${file}`);
}

JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(root, 'Code.gs'), 'utf8'), { filename: 'Code.gs' });

const claspIgnore = fs.readFileSync(path.join(root, '.claspignore'), 'utf8');
for (const duplicate of ['Code_Part1.gs', 'Code_Part2.gs']) {
  if (!claspIgnore.includes(duplicate)) throw new Error(`${duplicate} must be excluded by .claspignore.`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const file of deployFiles) fs.copyFileSync(path.join(root, file), path.join(outputDir, file));

fs.writeFileSync(path.join(outputDir, 'deploy-manifest.json'), JSON.stringify({
  files: deployFiles,
  source: 'GitHub canonical Apps Script source',
  note: 'Review against the live Apps Script project before deployment; remote-only files are not included.',
}, null, 2) + '\n');

console.log(`Apps Script artifact built with ${deployFiles.length} canonical files.`);
