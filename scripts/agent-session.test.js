'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { plan, run, sessionIdOf } = require('./agent-session.js');

const SID = '0b1c7a52-0e7d-4c43-9d1f-3a1c2b4d5e6f';
const PAYLOAD = JSON.stringify({ session_id: SID, hook_event_name: 'SessionStart', source: 'startup' });
const ENV = { DATATUG_AGENT_ID: 'ag-1', DATATUG_SPACE_ID: 's1', DATATUG_PROJECT_ID: 'p1', CLAUDE_ENV_FILE: '/env/file' };

function fakeIo(overrides = {}) {
  const io = {
    stdinText: PAYLOAD,
    env: { ...ENV },
    calls: [],
    appended: [],
    logs: [],
    result: { status: 0, stdout: 'Agent session as-1 started for ag-1\n', stderr: '' },
    ...overrides,
  };
  io.spawn = (cmd, args, options) => {
    io.calls.push({ cmd, args, options });
    return io.result;
  };
  io.appendFile = (file, text) => io.appended.push([file, text]);
  io.log = (line) => io.logs.push(line);
  return io;
}

test('start runs datatug agent session start with the payload session ID and exports it', () => {
  const io = fakeIo();
  assert.equal(run('start', io), 'started');
  assert.equal(io.calls.length, 1);
  assert.equal(io.calls[0].cmd, 'datatug');
  assert.deepEqual(io.calls[0].args, ['agent', 'session', 'start', '--harness', 'claude-code', '--harness-session', SID, '--agent-id', 'ag-1', '--space', 's1', '--project', 'p1']);
  assert.deepEqual(io.calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(io.appended, [['/env/file', 'export DATATUG_HARNESS_SESSION=' + SID + '\n']]);
  assert.deepEqual(io.logs, ['datatug agent session: Agent session as-1 started for ag-1']);
});

test('start falls back to the plugin settings and says what to do without CLAUDE_ENV_FILE', () => {
  const io = fakeIo({ env: { CLAUDE_PLUGIN_OPTION_AGENTID: ' ag-2 ', CLAUDE_PLUGIN_OPTION_SPACEID: 's2', CLAUDE_PLUGIN_OPTION_PROJECTID: 'p2' }, result: { status: 0, stdout: '', stderr: '' } });
  assert.equal(run('start', io), 'started');
  assert.deepEqual(io.calls[0].args.slice(-6), ['--agent-id', 'ag-2', '--space', 's2', '--project', 'p2']);
  assert.deepEqual(io.appended, []);
  assert.deepEqual(io.logs, ['datatug agent session: start done', 'datatug agent session: CLAUDE_ENV_FILE is not set: pass --harness-session ' + SID + ' on agent calls']);
});

test('end runs datatug agent session end with reason harness-ended and exports nothing', () => {
  const io = fakeIo({ env: {}, result: { status: 0, stdout: 'Agent session as-1 ended\n' } });
  assert.equal(run('end', io), 'ended');
  assert.deepEqual(io.calls[0].args, ['agent', 'session', 'end', '--harness-session', SID, '--reason', 'harness-ended']);
  assert.deepEqual(io.appended, []);
});

test('the hook is a no-op with a logged reason when something is missing', () => {
  const cases = [
    [{ stdinText: '' }, 'the hook payload has no valid session_id'],
    [{ stdinText: 'null' }, 'the hook payload has no valid session_id'],
    [{ stdinText: '{}' }, 'the hook payload has no valid session_id'],
    [{ stdinText: JSON.stringify({ session_id: 'x; rm -rf ~' }) }, 'the hook payload has no valid session_id'],
    [{ env: { DATATUG_SPACE_ID: 's', DATATUG_PROJECT_ID: 'p' } }, 'no agent ID'],
    [{ env: { DATATUG_AGENT_ID: 'not-an-agent', DATATUG_SPACE_ID: 's', DATATUG_PROJECT_ID: 'p' } }, 'no agent ID'],
    [{ env: { DATATUG_AGENT_ID: 'ag-1', DATATUG_SPACE_ID: 's' } }, 'no space or project'],
  ];
  for (const [overrides, reason] of cases) {
    const io = fakeIo(overrides);
    assert.equal(run('start', io), 'skipped');
    assert.equal(io.calls.length, 0);
    assert.equal(io.appended.length, 0);
    assert.equal(io.logs.length, 1);
    assert.ok(io.logs[0].startsWith('datatug agent session: skipped: ' + reason), io.logs[0]);
  }
  const io = fakeIo();
  assert.equal(run('restart', io), 'skipped');
  assert.match(io.logs[0], /unknown mode "restart"/);
});

test('a missing CLI, a CLI that hangs and a failing CLI never export the ID', () => {
  const missing = fakeIo({ result: { error: Object.assign(new Error('spawn datatug ENOENT'), { code: 'ENOENT' }) } });
  assert.equal(run('start', missing), 'skipped');
  assert.match(missing.logs[0], /the datatug CLI is not installed/);
  const hung = fakeIo({ result: { error: Object.assign(new Error('spawnSync datatug ETIMEDOUT'), { code: 'ETIMEDOUT' }) } });
  assert.equal(run('start', hung), 'skipped');
  assert.match(hung.logs[0], /datatug did not finish: spawnSync datatug ETIMEDOUT/);
  const failed = fakeIo({ result: { status: 4, stdout: '', stderr: '\n  access refused: AGENT_SESSION_INVALID\n' } });
  assert.equal(run('start', failed), 'failed');
  assert.deepEqual(failed.logs, ['datatug agent session: start failed: access refused: AGENT_SESSION_INVALID']);
  const silent = fakeIo({ result: { status: 1, stdout: '', stderr: '' } });
  assert.equal(run('end', silent), 'failed');
  assert.deepEqual(silent.logs, ['datatug agent session: end failed: exit code 1']);
  for (const io of [missing, hung, failed, silent]) assert.deepEqual(io.appended, []);
});

test('the session ID is taken only from the payload session_id field', () => {
  assert.equal(sessionIdOf(PAYLOAD), SID);
  assert.equal(sessionIdOf(JSON.stringify({ prompt: 'use session ' + SID })), '');
  assert.equal(sessionIdOf(JSON.stringify({ session_id: 42 })), '');
  assert.equal(sessionIdOf(JSON.stringify({ session_id: 'a'.repeat(257) })), '');
  assert.equal(plan('start', PAYLOAD, { ...ENV, DATATUG_HARNESS_SESSION: 'other' }).sessionId, SID);
});

test('the script runs as a hook: payload on stdin, export in CLAUDE_ENV_FILE, nothing on stdout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(bin, 'datatug'), '#!/bin/sh\nprintf "%s\\n" "$@" > "' + argsFile + '"\necho "Agent session as-9 started"\n', { mode: 0o755 });
  const envFile = path.join(dir, 'env');
  const script = path.join(__dirname, 'agent-session.js');
  const env = { PATH: bin + path.delimiter + process.env.PATH, DATATUG_AGENT_ID: 'ag-9', DATATUG_SPACE_ID: 's', DATATUG_PROJECT_ID: 'p', CLAUDE_ENV_FILE: envFile };
  const out = childProcess.spawnSync(process.execPath, [script, 'start'], { input: PAYLOAD, env, encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr, 'datatug agent session: Agent session as-9 started\n');
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export DATATUG_HARNESS_SESSION=' + SID + '\n');
  assert.match(fs.readFileSync(argsFile, 'utf8'), /--harness-session\n0b1c7a52/);
  // Without the CLI on PATH it exits 0 with the reason.
  const none = childProcess.spawnSync(process.execPath, [script, 'start'], { input: PAYLOAD, env: { ...env, PATH: dir }, encoding: 'utf8' });
  assert.equal(none.status, 0);
  assert.match(none.stderr, /not installed/);
  fs.rmSync(dir, { recursive: true, force: true });
});
