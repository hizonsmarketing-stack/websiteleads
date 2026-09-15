/**
 * Bundles src/*.gs into a single dist/Code.gs.
 *
 * Apps Script concatenates every .gs file in a project before executing it, so
 * one bundled file behaves identically to the fifteen source files — it is
 * just far less tedious to paste into the editor by hand. Develop in src/;
 * run `npm run bundle` and install dist/.
 *
 *   node tools/bundle.js           write dist/
 *   node tools/bundle.js --check   say what the build should be, and whether
 *                                  dist/ is up to date — writes nothing
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

/**
 * The build identifier: a hash of the source this bundle was built from.
 *
 * It was the short git sha, which could not work and did not. The bundle is
 * built before the commit that carries it, so the sha it stamped was always
 * the previous commit's, and the working tree was always dirty at that moment,
 * so it always said "+local-changes" too. A deployment reporting
 * "f2ac07f+local-changes" was in fact running the code committed as 4ea4ff5 —
 * the one number nobody could get from it was the one it claimed to give.
 *
 * Hashing the source instead answers the question actually being asked, which
 * is not "which commit is this" but "is the deployed code the code I have".
 * It does not depend on when the bundle is built relative to the commit, on
 * the working tree being clean, or on git being there at all, and anybody with
 * a checkout can recompute it: `node tools/bundle.js --check`.
 *
 * @param {string} content The bundle with the stamp line left out.
 * @return {string}
 */
function buildStamp(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** Builds the bundle in memory. @return {{content: string, stamp: string, files: !Array<string>}} */
function build() {
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

  // Hashed over the source alone, so the stamp describes what it is stamping
  // rather than itself.
  const stampValue = buildStamp(banner + body);
  const stamp = [
    '',
    '/** Which build this is: a hash of src/. Written by tools/bundle.js. */',
    "const BUILD_ = '" + stampValue + "';",
    ''
  ].join('\n');

  return { content: banner + stamp + body + '\n', stamp: stampValue, files: files };
}

/** @return {string} The stamp inside an already-written bundle, or ''. */
function stampOf(text) {
  const match = String(text).match(/const BUILD_ = '([^']*)';/);
  return match ? match[1] : '';
}

const built = build();
const distFile = path.join(distDir, 'Code.gs');

if (process.argv.indexOf('--check') !== -1) {
  console.log('Build from src/: ' + built.stamp);
  let installed = '';
  try {
    installed = stampOf(fs.readFileSync(distFile, 'utf8'));
  } catch (err) {
    console.log('dist/Code.gs is not there — run `npm run bundle`.');
    process.exit(1);
  }
  if (installed === built.stamp) {
    console.log('dist/Code.gs matches. A deployment reporting ' + built.stamp +
      ' is running this code.');
    process.exit(0);
  }
  console.log('dist/Code.gs says ' + (installed || '(no stamp)') +
    ' — it is out of date. Run `npm run bundle`.');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(distFile, built.content);
// Everything that is not a .gs file is copied through as-is: the HTML dialogs
// and the manifest are separate files in the Apps Script editor too.
const assets = fs.readdirSync(srcDir).filter(f => !f.endsWith('.gs')).sort();
assets.forEach(name => {
  fs.copyFileSync(path.join(srcDir, name), path.join(distDir, name));
});

const lines = built.content.split('\n').length;
console.log('Wrote dist/Code.gs (' + built.files.length + ' files, ' + lines +
  ' lines, build ' + built.stamp + ')');
assets.forEach(name => console.log('Wrote dist/' + name));
