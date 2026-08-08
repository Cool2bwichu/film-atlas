"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasRadialInspection = api;
})(typeof globalThis === "object" ? globalThis : this, function createApi() {
  function selectRadialFilm({ centreKey, ring, selectedKey }) {
    if (selectedKey === centreKey) {
      return { kind: "centre", selectedKey, centreKey, connection: null };
    }

    const connection = Array.isArray(ring)
      ? ring.find((item) => item && item.key === selectedKey) || null
      : null;

    if (!connection) {
      return { kind: "missing", selectedKey: null, centreKey, connection: null };
    }

    return { kind: "inspect", selectedKey, centreKey, connection };
  }

  function createRadialSnapshot({ centreKey, ring, trail }, options) {
    const { edgeIndex } = options;
    if (typeof centreKey !== "string" || !Array.isArray(ring) || !Array.isArray(trail)) return null;
    if (typeof edgeIndex !== "function") return null;

    const snapshotRing = [];
    for (const item of ring) {
      const index = item && typeof item.key === "string" ? edgeIndex(item.e) : -1;
      if (!Number.isInteger(index) || index < 0) return null;
      snapshotRing.push({ key: item.key, edgeIndex: index });
    }

    const snapshot = {
      version: 1,
      centreKey,
      ring: snapshotRing,
      trail: [...trail],
    };
    return restoreRadialSnapshot(snapshot, options) ? snapshot : null;
  }

  function restoreRadialSnapshot(snapshot, { edgeAt, filmExists }) {
    if (!snapshot || snapshot.version !== 1 || typeof snapshot.centreKey !== "string") return null;
    if (!Array.isArray(snapshot.ring) || snapshot.ring.length > 6 || !Array.isArray(snapshot.trail)) return null;
    if (typeof edgeAt !== "function" || typeof filmExists !== "function") return null;
    if (!filmExists(snapshot.centreKey) || snapshot.trail.length < 1) return null;
    if (snapshot.trail[snapshot.trail.length - 1] !== snapshot.centreKey) return null;
    if (!snapshot.trail.every((key) => typeof key === "string" && filmExists(key))) return null;

    const seen = new Set([snapshot.centreKey]);
    const ring = [];
    for (const item of snapshot.ring) {
      if (!item || typeof item.key !== "string" || seen.has(item.key) || !filmExists(item.key)) return null;
      if (!Number.isInteger(item.edgeIndex) || item.edgeIndex < 0) return null;
      const edge = edgeAt(item.edgeIndex);
      const joinsWeb = edge && (
        (edge.a === snapshot.centreKey && edge.b === item.key) ||
        (edge.b === snapshot.centreKey && edge.a === item.key)
      );
      if (!joinsWeb) return null;
      seen.add(item.key);
      ring.push({ key: item.key, e: edge });
    }

    return {
      centreKey: snapshot.centreKey,
      ring,
      trail: [...snapshot.trail],
    };
  }

  function panelScrollTarget(previousKey, nextKey, scrollTop) {
    return previousKey === nextKey && Number.isFinite(scrollTop)
      ? Math.max(0, scrollTop)
      : 0;
  }

  return Object.freeze({
    createRadialSnapshot,
    panelScrollTarget,
    restoreRadialSnapshot,
    selectRadialFilm,
  });
});
