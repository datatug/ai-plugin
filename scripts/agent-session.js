#!/usr/bin/env node
'use strict';
// Claude Code SessionStart / SessionEnd hook: starts and ends the DataTug agent
// session (Perimeter D29) of the Claude Code session it runs in, and on start
// exports the attribution-only caller context (DATATUG_CALLER_*; see callerContext).
//
//   node scripts/agent-session.js start   (SessionStart)
//   node scripts/agent-session.js end     (SessionEnd)
//
// The harness session ID is the `session_id` of the hook payload Claude Code
// writes to stdin; it never comes from model text. The agent, space and
// project come from the environment (DATATUG_AGENT_ID, DATATUG_SPACE_ID,
// DATATUG_PROJECT_ID) or the plugin's settings (agentId, spaceId, projectId,
// exposed to hooks as CLAUDE_PLUGIN_OPTION_*). Anything missing makes the hook
// a no-op with one logged reason on stderr. A hook never fails the session:
// it always exits 0. Nothing is written to stdout, so nothing enters Claude's
// context, and the session credential stays in the CLI's keyring.

const childProcess = require('node:child_process');
const fs = require('node:fs');

const HARNESS = 'claude-code';
const CLI = 'datatug';
const CLI_TIMEOUT_MS = 20000;
const HARNESS_SESSION_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const AGENT_ID = /^ag-[A-Za-z0-9_-]{1,125}$/;
const SELECTOR = /^[A-Za-z0-9_-]{1,128}$/;

// The first non-empty value of the named environment variables.
function setting(env, names) {
  for (const name of names) {
    const value = (env[name] || '').trim();
    if (value !== '') return value;
  }
  return '';
}

// Who is calling DataTug, for attribution only (never authority: an agent
// running as the same OS user can set these too). Written on every start, with
// or without a DataTug agent ID, so `datatug` commands can record the harness,
// its session and the model in their audit and proposals. Names are separate
// from DATATUG_HARNESS_SESSION, which drives the cloud agent session (D29).
const MODEL_ID = /^[A-Za-z0-9._:\[\]\/-]{1,128}$/;
const AGENT_TYPE = /^[A-Za-z0-9._:-]{1,64}$/;

function callerContext(stdinText) {
  let payload;
  try {
    payload = JSON.parse(stdinText);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== 'object') return [];
  const lines = ['DATATUG_CALLER_HARNESS=' + HARNESS];
  const sessionId = payload.session_id;
  if (typeof sessionId === 'string' && HARNESS_SESSION_ID.test(sessionId)) lines.push('DATATUG_CALLER_SESSION=' + sessionId);
  // The model can be absent (for example after /clear); a later SessionStart
  // writes it again, and a later export wins.
  const model = typeof payload.model === 'string' ? payload.model : payload.model && typeof payload.model.id === 'string' ? payload.model.id : '';
  if (MODEL_ID.test(model)) lines.push('DATATUG_CALLER_MODEL=' + model);
  if (typeof payload.agent_type === 'string' && AGENT_TYPE.test(payload.agent_type)) lines.push('DATATUG_CALLER_AGENT_TYPE=' + payload.agent_type);
  // Every value matched a pattern without shell metacharacters, so it needs no quoting.
  return lines.map((line) => 'export ' + line + '\n');
}

function sessionIdOf(stdinText) {
  let payload;
  try {
    payload = JSON.parse(stdinText);
  } catch {
    return '';
  }
  const id = payload && typeof payload === 'object' ? payload.session_id : undefined;
  return typeof id === 'string' && HARNESS_SESSION_ID.test(id) ? id : '';
}

// The datatug argument list for a mode, or a reason the hook does nothing.
function plan(mode, stdinText, env) {
  if (mode !== 'start' && mode !== 'end') return { reason: 'unknown mode ' + JSON.stringify(String(mode)) + ' (use start or end)' };
  const sessionId = sessionIdOf(stdinText);
  if (sessionId === '') return { reason: 'the hook payload has no valid session_id' };
  if (mode === 'end') {
    return { sessionId, args: ['agent', 'session', 'end', '--harness-session', sessionId, '--reason', 'harness-ended'] };
  }
  const agentId = setting(env, ['DATATUG_AGENT_ID', 'CLAUDE_PLUGIN_OPTION_AGENTID']);
  if (!AGENT_ID.test(agentId)) return { reason: 'no agent ID: set DATATUG_AGENT_ID (ag-...) or the plugin setting agentId' };
  const space = setting(env, ['DATATUG_SPACE_ID', 'CLAUDE_PLUGIN_OPTION_SPACEID']);
  const project = setting(env, ['DATATUG_PROJECT_ID', 'CLAUDE_PLUGIN_OPTION_PROJECTID']);
  if (!SELECTOR.test(space) || !SELECTOR.test(project)) {
    return { reason: 'no space or project: set DATATUG_SPACE_ID and DATATUG_PROJECT_ID, or the plugin settings spaceId and projectId' };
  }
  return {
    sessionId,
    args: ['agent', 'session', 'start', '--harness', HARNESS, '--harness-session', sessionId, '--agent-id', agentId, '--space', space, '--project', project],
  };
}

function firstLine(text) {
  return String(text || '').split('\n').map((line) => line.trim()).find((line) => line !== '') || '';
}

// Runs one hook. io: { stdinText, env, spawn(cmd, args, options), appendFile(path, text), log(line) }.
// Returns what it did, for tests: 'skipped', 'failed', 'started' or 'ended'.
function run(mode, io) {
  const log = (line) => io.log('datatug agent session: ' + line);
  if (mode === 'start' && io.env.CLAUDE_ENV_FILE) {
    const context = callerContext(io.stdinText);
    if (context.length > 0) io.appendFile(io.env.CLAUDE_ENV_FILE, context.join(''));
  }
  const step = plan(mode, io.stdinText, io.env);
  if (step.reason) {
    log('skipped: ' + step.reason);
    return 'skipped';
  }
  const result = io.spawn(CLI, step.args, { encoding: 'utf8', timeout: CLI_TIMEOUT_MS, env: io.env, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) {
    const missing = result.error.code === 'ENOENT';
    log('skipped: ' + (missing ? 'the datatug CLI is not installed (see /datatug:datatug-install)' : 'datatug did not finish: ' + result.error.message));
    return 'skipped';
  }
  if (result.status !== 0) {
    log(mode + ' failed: ' + (firstLine(result.stderr) || 'exit code ' + result.status));
    return 'failed';
  }
  log(firstLine(result.stdout) || mode + ' done');
  if (mode === 'end') return 'ended';
  const envFile = io.env.CLAUDE_ENV_FILE;
  if (envFile) {
    // The ID matched HARNESS_SESSION_ID, so it needs no shell quoting.
    io.appendFile(envFile, 'export DATATUG_HARNESS_SESSION=' + step.sessionId + '\n');
  } else {
    log('CLAUDE_ENV_FILE is not set: pass --harness-session ' + step.sessionId + ' on agent calls');
  }
  return 'started';
}

function main() {
  let stdinText = '';
  try {
    stdinText = fs.readFileSync(0, 'utf8');
  } catch {
    stdinText = '';
  }
  try {
    run(process.argv[2], {
      stdinText,
      env: process.env,
      spawn: childProcess.spawnSync,
      appendFile: fs.appendFileSync,
      log: (line) => process.stderr.write(line + '\n'),
    });
  } catch (e) {
    process.stderr.write('datatug agent session: hook error: ' + e.message + '\n');
  }
}

if (require.main === module) main();

module.exports = { callerContext, plan, run, sessionIdOf, setting };
