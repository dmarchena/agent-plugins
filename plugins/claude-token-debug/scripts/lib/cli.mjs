/**
 * Shared CLI I/O for shared/token-cost.mjs and its vendored copies.
 *
 * Canonical envelope (the ONLY shape token-cost.mjs puts on stdout):
 *   success -> { ok: true, data: <payload> }
 *   error   -> { ok: false, error: { reason: <string> } }
 *
 * stdout is data-exchange ONLY: it carries exclusively the envelope above,
 * never logs, debug output, or human-facing prose/progress lines.
 *
 * Serialization is compact: JSON.stringify(envelope) on ONE line, with NO
 * indentation, terminated by a single trailing "\n".
 *
 * Exit code mirrors `ok`:
 *   ok:true  -> exit 0 (the success path never terminates the process itself;
 *               the caller decides what happens next)
 *   ok:false -> emitError terminates the process with a non-zero exit code
 *               (default 1), so failure is always observable from the shell
 *               exit status, not just the JSON body.
 *
 * This file is NOT vendored by shared/build.sh (only files declared in
 * shared/manifest.json are); each plugin that vendors token-cost.mjs keeps
 * its own local ./lib/cli.mjs copy so token-cost.mjs's relative import
 * resolves after vendoring. Keep this file and every plugin's copy in sync
 * by hand if you change the envelope contract here.
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
