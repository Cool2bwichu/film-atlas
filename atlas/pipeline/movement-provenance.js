"use strict";

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function hasAuthoritativeMovement(film) {
  return Array.isArray(film.movementDirect) || Array.isArray(film.movementInherited);
}

function movementValues(film) {
  if (!hasAuthoritativeMovement(film)) return uniqueSorted(film.movement || []);
  return uniqueSorted([
    ...(film.movementDirect || []),
    ...(film.movementInherited || []).map((membership) => membership.value),
  ]);
}

function synchronizeLegacyMovement(film) {
  film.movement = movementValues(film);
}

function addDirectMovement(film, movementQid) {
  if (!Array.isArray(film.movementDirect)) film.movementDirect = [];
  if (!Array.isArray(film.movementInherited)) film.movementInherited = [];
  if (!film.movementDirect.includes(movementQid)) film.movementDirect.push(movementQid);
  film.movementDirect.sort();
  synchronizeLegacyMovement(film);
}

function addInheritedMovement(film, movementQid, directorQid) {
  if (!Array.isArray(film.movementDirect)) film.movementDirect = [];
  if (!Array.isArray(film.movementInherited)) film.movementInherited = [];
  if (!film.movementInherited.some((membership) =>
    membership.value === movementQid && membership.viaDirector === directorQid)) {
    film.movementInherited.push({ value: movementQid, viaDirector: directorQid });
  }
  film.movementInherited.sort((a, b) =>
    a.value.localeCompare(b.value) || a.viaDirector.localeCompare(b.viaDirector));
  synchronizeLegacyMovement(film);
}

module.exports = { addDirectMovement, addInheritedMovement, movementValues };
