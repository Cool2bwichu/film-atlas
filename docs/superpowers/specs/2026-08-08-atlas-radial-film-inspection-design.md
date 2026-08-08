# Atlas Radial Film Inspection Design

**Status:** Awaiting written-spec approval

**Date:** 2026-08-08
**Scope:** Change linked-film selection in the radial map from immediate traversal to contextual inspection, with an explicit action for opening the selected film's web.

## 1. Purpose

The radial map is a room for comparing one film with six connected films. Today, selecting any surrounding poster immediately replaces the center film, redraws all six connections, updates the URL, and extends the trail. A reader cannot inspect several films in the current web before deciding which connection is worth following.

Atlas will separate two intentions:

- **Inspect:** learn about a connected film without leaving the current web.
- **Explore:** deliberately make that film the center of a new web.

The intended rhythm is:

> see a connection → inspect the film → understand why it is here → decide whether to follow it

## 2. Settled interaction model

The existing right-side film drawer is the inspection surface. The map does not gain a modal, second canvas, or two-click navigation rule.

When a user selects one of the six surrounding posters:

1. the current center film and its six-film web remain unchanged;
2. the selected poster receives the existing film-derived accent treatment plus a restrained `INSPECTING` slate marker and inset keyline;
3. the film drawer opens for the selected film;
4. the URL, trail, center-film key, and current ring remain unchanged;
5. selecting another surrounding poster replaces the drawer contents without closing or navigating;
6. only the drawer's explicit **Explore this film's web** action recenters the map.

Selecting the center poster continues to open the center film's normal detail drawer.

## 3. Inspection drawer

The drawer preserves Atlas's current editorial and darkroom visual language. It is not redesigned as a generic card or modal.

For a surrounding film, the reading order is:

1. **Context marker:** `Connected to [center film]`.
2. **Film identity:** title, year, director, and poster or generated film cell.
3. **Why it appears here:** the exact relationship label and claim joining the selected film to the current center. Evidence class, confidence treatment, and attribution remain visible under the existing rules.
4. **Synopsis:** the selected film's existing description, when available.
5. **Personal actions:** Seen and Love.
6. **Travel action:** a prominent `Explore this film's web` button.
7. **Filing details:** total known connections, palette source, and Wikipedia link when available.

The drawer does not show the selected film's separate six-connection list while it is being inspected from another film's web. Doing so would introduce a second hidden web before the reader has chosen to travel and would recreate the same disorientation in a narrower space.

For the center film, the existing **Why it connects** list remains. Activating a film in that list opens the same contextual inspection drawer for that linked film; it does not navigate immediately.

## 4. Explicit traversal

Activating **Explore this film's web** performs the existing deliberate traversal:

- the inspected film becomes the center;
- its six connections are resolved and rendered;
- one new semantic step is added to the current trail;
- the hash becomes `#/film/<selected-film-key>`;
- the new center film's normal drawer opens;
- focus moves to the new center node using the existing focus behavior.

The action must execute once per activation. Opening, changing, closing, or marking a preview Seen/Loved never appends a trail step.

## 5. Selection, closing, and focus

- Inspection is a selected state, not a hover state. Moving the pointer away does not close the drawer.
- Hover continues to reveal the current relationship tooltip and line emphasis without replacing drawer content.
- The selected ring poster remains visibly identifiable while the drawer is open through both its inset keyline and `INSPECTING` slate marker.
- Closing the drawer returns focus to the poster or relationship row that opened it when that control still exists.
- Escape closes the drawer before performing any broader map navigation.
- If the user selects another ring film, focus and selection move coherently to the new film.
- Re-rendering after Seen/Love preserves the inspected film and current web.

## 6. URL and browser history

Inspection is temporary local UI state. It does not alter the hash and does not create browser history entries.

Traversal is semantic navigation. **Explore this film's web** updates the existing film route exactly once. Back behavior therefore returns between webs rather than stepping through every inspected poster.

This feature does not add inspected-film state to share links. That decision belongs to the later versioned constellation URL contract.

## 7. Responsive behavior

The existing drawer remains a right-side panel on desktop and a bottom sheet on narrow screens.

- Desktop keeps the current web visible behind the panel and reuses the map's measured panel-width accommodation.
- Mobile keeps the current bottom-sheet composition, with the relationship claim and travel action visible before long filing details.
- The travel action uses a touch target of at least 44 pixels.
- The selected state is conveyed by the `INSPECTING` text marker and keyline geometry rather than color alone.
- Reduced motion removes the panel travel animation without removing its state change or focus behavior.

## 8. Missing-data behavior

- A missing synopsis does not block inspection; the relationship claim, film identity, and travel action remain.
- A missing poster uses the existing generated film cell.
- A missing Wikipedia record removes that filing row rather than showing a disabled link.
- A missing current-center relationship is treated as an invariant failure during development. The production drawer falls back to film identity and disables traversal only if the selected film itself is absent.

## 9. Accessibility contract

- Ring-node accessible names describe the action as opening film details, not opening a new map.
- The travel button names the selected film in its accessible label.
- The drawer exposes its existing labelled complementary-region semantics and announced title.
- Keyboard activation of a ring node produces the same inspection behavior as pointer or touch activation.
- Focus is never moved merely because a pointer hover changed.
- The exact connection claim remains available as text, independent of line color or dash pattern.

## 10. Validation

Automated and real-browser checks will cover the visible behavior using The Handmaiden's current web as a stable scenario:

1. open `#/film/the%20handmaiden`;
2. record the center title, six ring titles, hash, and trail length;
3. activate Rebecca;
4. verify the center, ring, hash, and trail are unchanged;
5. verify the drawer names Rebecca, leads with its relationship to The Handmaiden, displays available film information, and includes **Explore this film's web**;
6. activate a second surrounding film and verify only the inspection changes;
7. activate **Explore this film's web** and verify that film becomes the center, the hash changes, and the trail grows once;
8. repeat the flow with keyboard input and at desktop, tablet, and phone widths;
9. verify close/Escape focus restoration, Seen/Love preservation, missing-description behavior, and reduced motion;
10. run the full build, lint, corpus validation, and relationship-quality suite to catch unrelated regressions.

The browser check must inspect rendered state rather than relying only on generated-HTML string assertions.

## 11. Non-goals

This change does not:

- alter the whole-constellation orbit interaction;
- change relationship ranking, claims, or the corpus;
- implement the future persistent journey journal;
- add a second panel history or nested web;
- add a runtime dependency;
- update the frozen Sites reference build.

## 12. Success criterion

A user can inspect every surrounding film in a radial web, understand each film and its exact relationship to the center, and leave the web only through an unmistakable deliberate action.
