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

  return Object.freeze({ selectRadialFilm });
});
