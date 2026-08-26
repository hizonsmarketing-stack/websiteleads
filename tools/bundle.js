/**
 * Bundles src/*.gs into a single dist/Code.gs.
 *
 * Apps Script concatenates every .gs file in a project before executing it, so
 * one bundled file behaves identically to the fourteen source files — it is
 * just far less tedious to paste into the editor by hand. Develop in src/;
 * run `npm run bundle` and install dist/.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

fs.mkdirSync(distDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.gs')).sort();
const banner = [
  '/**',
  ' * Website Leads Automation — bundled build.',
  ' *',
  ' * GENERATED FILE. Do not edit here: change the matching file under src/ and',
  ' * run `npm run bundle`. Built from:',
  ...files.map(f => ' *   src/' + f),
  ' */',
  ''
].join('\n');

const body = files.map(file => [
  '',
  '// ' + '='.repeat(74),
  '// src/' + file,
  '// ' + '='.repeat(74),
  '',
  fs.readFileSync(path.join(srcDir, file), 'utf8').trimEnd()
].join('\n')).join('\n');

fs.writeFileSync(path.join(distDir, 'Code.gs'), banner + body + '\n');
// Everything that is not a .gs file is copied through as-is: the HTML dialogs
// and the manifest are separate files in the Apps Script editor too.
const assets = fs.readdirSync(srcDir).filter(f => !f.endsWith('.gs')).sort();
assets.forEach(name => {
  fs.copyFileSync(path.join(srcDir, name), path.join(distDir, name));
});

const lines = (banner + body).split('\n').length;
console.log('Wrote dist/Code.gs (' + files.length + ' files, ' + lines + ' lines)');
assets.forEach(name => console.log('Wrote dist/' + name));
