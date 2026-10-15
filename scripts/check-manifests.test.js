'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkManifests } = require('./check-manifests.js');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}
const m = (extra = {}) => ({ name: 'x', version: '1.0.0', ...extra });

test('agreeing manifests with existing paths pass', () => {
  const root = repo({
    '.claude-plugin/plugin.json': m(),
    '.codex-plugin/plugin.json': m({ skills: './skills/' }),
    '.github/plugin.json': m({ skills: ['./skills/a'] }),
    'plugin.json': m(),
    'gemini-extension.json': m(),
    'skills/a/SKILL.md': 'x',
    'hooks/hooks.json': { modules: ['./register.js'] },
    'hooks/register.js': '',
  });
  assert.deepEqual(checkManifests(root).errors, []);
});

test('no manifest is an error', () => {
  assert.match(checkManifests(repo({})).errors[0], /no plugin manifest/);
});

test('invalid JSON is reported with the file name', () => {
  const root = repo({ 'plugin.json': '{nope', '.claude-plugin/plugin.json': m() });
  assert.ok(checkManifests(root).errors.some((e) => /^plugin\.json: invalid JSON/.test(e)));
});

test('a version mismatch names both versions and files', () => {
  const root = repo({ 'plugin.json': m(), '.claude-plugin/plugin.json': m({ version: '2.0.0' }) });
  const e = checkManifests(root).errors.join('\n');
  assert.match(e, /"version" differs/);
  assert.match(e, /1\.0\.0/);
  assert.match(e, /2\.0\.0/);
});

test('a name mismatch is reported', () => {
  const root = repo({ 'plugin.json': m(), 'gemini-extension.json': m({ name: 'y' }) });
  assert.match(checkManifests(root).errors.join('\n'), /"name" differs/);
});

test('a missing name or version is reported', () => {
  const root = repo({ 'plugin.json': { name: 'x' } });
  assert.match(checkManifests(root).errors.join('\n'), /plugin\.json: "version" is missing/);
});

test('a missing referenced path is reported', () => {
  const root = repo({ '.github/plugin.json': m({ skills: ['./skills/gone'] }) });
  assert.match(checkManifests(root).errors.join('\n'), /skills\[0\] references a missing path/);
});

test('a path escaping the repository is reported', () => {
  const root = repo({ 'plugin.json': m({ skills: '../elsewhere' }) });
  assert.match(checkManifests(root).errors.join('\n'), /outside the repository/);
});

test('a missing hooks module is reported relative to hooks/', () => {
  const root = repo({ 'plugin.json': m(), 'hooks/hooks.json': { modules: ['./register.js'] } });
  assert.match(checkManifests(root).errors.join('\n'), /modules\[0\] references a missing path/);
});

test('remote URLs are not treated as paths', () => {
  const root = repo({ 'plugin.json': m({ homepage: 'https://x', logo: 'https://x/logo.png' }) });
  assert.deepEqual(checkManifests(root).errors, []);
});

test('a marketplace entry with another version is reported; local sources must exist', () => {
  const root = repo({
    'plugin.json': m(),
    '.claude-plugin/marketplace.json': { plugins: [{ name: 'x', version: '9.9.9', source: './missing' }] },
  });
  const e = checkManifests(root).errors.join('\n');
  assert.match(e, /version 9\.9\.9/);
  assert.match(e, /source references a missing path/);
});

test('this repository passes', () => {
  assert.deepEqual(checkManifests(path.resolve(__dirname, '..')).errors, []);
});
