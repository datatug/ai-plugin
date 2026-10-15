#!/usr/bin/env node
'use strict';
// Checks the plugin manifests of this repository (no dependencies):
//  - every manifest present is valid JSON,
//  - `name` and `version` are set and agree across them,
//  - every local path a manifest references exists.
// Usage: node scripts/check-manifests.js [repo-root]

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_MANIFESTS = [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  'plugin.json',
  'gemini-extension.json',
  '.github/plugin.json',
];
const MARKETPLACE_FILES = [
  '.claude-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
  '.github/plugin/marketplace.json',
  'marketplace.json',
];
// Keys whose string values (or arrays of strings) are paths inside the repo.
const PATH_KEYS = new Set([
  'skills', 'agents', 'commands', 'hooks', 'mcpServers', 'lspServers',
  'logo', 'icon', 'composerIcon', 'screenshots', 'source',
]);

function readJson(root, rel, errors) {
  const file = path.join(root, rel);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    errors.push(`${rel}: cannot read: ${e.message}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    errors.push(`${rel}: invalid JSON: ${e.message}`);
    return undefined;
  }
}

function isLocalPath(value) {
  return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'));
}

// Collects [keyPath, value] pairs for local paths found under PATH_KEYS.
function collectPaths(node, keyPath, inPathKey, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectPaths(v, `${keyPath}[${i}]`, inPathKey, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectPaths(v, keyPath ? `${keyPath}.${k}` : k, PATH_KEYS.has(k), out);
    }
  } else if (inPathKey && isLocalPath(node)) {
    out.push([keyPath, node]);
  }
}

function checkPath(root, baseDir, rel, keyPath, value, errors) {
  const target = path.resolve(baseDir, value);
  const inside = path.relative(root, target);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    errors.push(`${rel}: ${keyPath} points outside the repository: ${value}`);
  } else if (!fs.existsSync(target)) {
    errors.push(`${rel}: ${keyPath} references a missing path: ${value}`);
  }
}

function checkManifests(root) {
  const errors = [];
  const found = [];

  for (const rel of PLUGIN_MANIFESTS) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const data = readJson(root, rel, errors);
    if (data === undefined) continue;
    found.push({ rel, data });
  }
  if (found.length === 0) errors.push('no plugin manifest found');

  // name and version agree
  for (const key of ['name', 'version']) {
    const values = new Map();
    for (const { rel, data } of found) {
      const v = data && data[key];
      if (typeof v !== 'string' || v === '') {
        errors.push(`${rel}: "${key}" is missing or not a non-empty string`);
        continue;
      }
      if (!values.has(v)) values.set(v, []);
      values.get(v).push(rel);
    }
    if (values.size > 1) {
      const detail = [...values].map(([v, files]) => `${JSON.stringify(v)} in ${files.join(', ')}`).join('; ');
      errors.push(`"${key}" differs across manifests: ${detail}`);
    }
  }

  // referenced paths exist (relative to the repository root)
  for (const { rel, data } of found) {
    const refs = [];
    collectPaths(data, '', false, refs);
    for (const [keyPath, value] of refs) checkPath(root, root, rel, keyPath, value, errors);
  }

  // hooks file: its modules are relative to the hooks file itself
  const hooksRel = 'hooks/hooks.json';
  if (fs.existsSync(path.join(root, hooksRel))) {
    const hooks = readJson(root, hooksRel, errors);
    const modules = hooks && hooks.modules;
    if (hooks !== undefined && modules !== undefined && !Array.isArray(modules)) {
      errors.push(`${hooksRel}: "modules" must be an array`);
    } else if (Array.isArray(modules)) {
      modules.forEach((m, i) => {
        if (typeof m !== 'string') errors.push(`${hooksRel}: modules[${i}] is not a string`);
        else checkPath(root, path.dirname(path.join(root, hooksRel)), hooksRel, `modules[${i}]`, m, errors);
      });
    }
  }

  // marketplace files, when present: valid JSON, local sources exist,
  // and an entry for this plugin carries the same name/version
  const ref = found.length ? found[0].data : {};
  for (const rel of MARKETPLACE_FILES) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const data = readJson(root, rel, errors);
    if (data === undefined) continue;
    const refs = [];
    collectPaths(data, '', false, refs);
    for (const [keyPath, value] of refs) checkPath(root, root, rel, keyPath, value, errors);
    const plugins = Array.isArray(data.plugins) ? data.plugins : [];
    for (const p of plugins) {
      if (p && p.name === ref.name && typeof p.version === 'string' && p.version !== ref.version) {
        errors.push(`${rel}: plugin "${p.name}" has version ${p.version}, manifests say ${ref.version}`);
      }
    }
  }

  return { errors, manifests: found.map((f) => f.rel) };
}

module.exports = { checkManifests };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || process.cwd());
  const { errors, manifests } = checkManifests(root);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  console.log(`ok: ${manifests.length} manifests agree (${manifests.join(', ')})`);
}
