"use strict";

/* What counts as trivia, in one place.
 *
 * Trivia is not "the weak signals". It is the claims that tell a reader nothing
 * about the films: era-and-genre coincidence, and a face that happens to recur.
 * `genre` alone is borderline and counted in, because "both are horror films"
 * is a category rather than a connection.
 *
 * Weak ties still belong in the GRAPH — they are what keeps it traversable
 * (AGENTS, "weak ties are load-bearing"). This governs what gets SHOWN.
 *
 * This set had drifted into three copies (measure-claims.js, measure-maps.js,
 * and the app's own ranking). A fourth was about to be written into build.js
 * when the alternate-claim field was restored, so it lives here instead. The
 * app cannot require() it — template.html is a single file by design — so that
 * copy stays, and measure-claims.js already carries a drift guard for it.
 */
const TRIVIA = new Set(["genreEra", "countryEra", "genre", "cast"]);

const isTrivia = (signal) => TRIVIA.has(signal);

module.exports = { TRIVIA, isTrivia };
