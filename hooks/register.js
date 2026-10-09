export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'datatug',
      description: 'Show the DataTug project in this directory',
    })
    return next(e)
  })

  on('command.run', { command: 'datatug' }, async ($) => {
    const cwd = await $.session.cwd()
    const result = await $.process.run(['datatug', '--version'], { cwd, timeoutMs: 15000 })
    return { text: 'cwd: ' + cwd + ' · datatug ' + result.stdout.trim() + ' (exit ' + result.exitCode + ')' }
  })
}
