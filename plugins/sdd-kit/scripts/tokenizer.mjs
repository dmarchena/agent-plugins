// Deterministic, stdlib-only token estimator (task T1-tokenizer,
// docs/specs/sdd-kit-skill-token-budget). No npm deps, no network.
//
// This is a general-purpose, reusable counter: it does not know about
// SKILL.md or any budget/ceiling — that's a later task (T2) that will
// consume estimateTokens() to enforce a threshold.
//
// Approach: split the text into "word-ish" chunks (runs of alphanumerics)
// and punctuation/symbol characters (each counted individually, since
// tokenizers typically split punctuation into its own token), then apply a
// long-word sub-split so very long tokens (e.g. camelCase/snake_case blobs,
// URLs, or just long words) count as more than one token, roughly
// approximating subword tokenization. Purely a function of the input
// string - no I/O, no randomness, so it's deterministic by construction.

const WORD_CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens in `text`.
 *
 * @param {string} text
 * @returns {number} a non-negative integer token estimate
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }

  // Tokenize into runs of "word" characters (letters/digits/underscore)
  // and individual non-whitespace symbol/punctuation characters.
  const pieces = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];

  let count = 0;
  for (const piece of pieces) {
    const isWord = /[\p{L}\p{N}_]/u.test(piece[0]);
    if (isWord) {
      // Long word-like runs get split into multiple sub-tokens, roughly
      // approximating subword tokenization of long identifiers/URLs/words.
      count += Math.max(1, Math.ceil(piece.length / WORD_CHARS_PER_TOKEN));
    } else {
      count += 1;
    }
  }

  return count;
}
