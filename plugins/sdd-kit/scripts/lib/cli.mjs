/**
 * Shared CLI I/O for sdd-kit scripts.
 *
 * Canonical envelope (the ONLY shape any CLI in this plugin puts on stdout):
 *   success -> { ok: true, data: <payload> }
 *   error   -> { ok: false, error: { reason: <string> } }
 *
 * stdout is data-exchange ONLY: it carries exclusively the envelope above,
 * never logs, debug output, or human-facing prose/progress lines. Anything
 * a human needs to read (or rich artifacts) belongs on stderr or in a file,
 * not stdout -- the calling skill/command parses stdout as a single JSON
 * value and nothing else.
 *
 * Serialization is compact: JSON.stringify(envelope) on ONE line, with NO
 * indentation, terminated by a single trailing "\n". This keeps the payload
 * small to re-read on every tool round-trip.
 *
 * Exit code mirrors `ok`:
 *   ok:true  -> exit 0 (the success path never terminates the process itself;
 *               the caller decides what happens next)
 *   ok:false -> emitError terminates the process with a non-zero exit code
 *               (default 1), so failure is always observable from the shell
 *               exit status, not just the JSON body.
 */

/**
 * Emit the success envelope to stdout: {ok:true,data:<payload>}, compact,
 * single line, trailing newline. Does not exit the process.
 */
export function emitSuccess(data) {
  process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
}

/**
 * Emit the error envelope to stdout: {ok:false,error:{reason}}, compact,
 * single line, trailing newline, then terminate the process with a non-zero
 * exit code (default 1; a `code` of 0 is coerced to 1 since ok:false must
 * never map to a zero exit status).
 */
export function emitError(reason, code = 1) {
  process.stdout.write(JSON.stringify({ ok: false, error: { reason } }) + '\n');
  process.exit(code === 0 ? 1 : code);
}

/**
 * Minimal `--name value` / `--name=value` flag parser. Returns a flat
 * object {name: value, ...}. A flag with no following value (end of argv,
 * or the next token is itself a flag) is set to boolean true.
 */
export function parseFlags(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const body = arg.slice(2);
    const eqIdx = body.indexOf('=');
    if (eqIdx !== -1) {
      flags[body.slice(0, eqIdx)] = body.slice(eqIdx + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[body] = true;
    } else {
      flags[body] = next;
      i++;
    }
  }
  return flags;
}
