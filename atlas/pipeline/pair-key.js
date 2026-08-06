/* The corpus's one-edge-per-pair invariant, everywhere it's checked, keys on
 * this exact string: two film keys, sorted, joined. associate.js uses it to
 * pick the strongest signal per pair; merge-corpus.js uses it to make a
 * reading supersede a record on the same pair; validate-corpus.js uses it to
 * detect a violation that got through anyway. Three independent copies of
 * `[a, b].sort().join("|")` drifted into the pipeline before this existed —
 * harmless while they agree, a silent correctness gap the moment they don't.
 */
module.exports = function pairKey(a, b) {
  return [a, b].sort().join("|");
};
