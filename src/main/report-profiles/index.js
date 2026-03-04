/**
 * Report Profiles — index
 * Re-exports all profiles by id.
 */
export { FAST } from "./fast.js";
export { PUBLIC } from "./public.js";
export { PRIVATE_ONLY } from "./private_only.js";
export { FULL } from "./full.js";

import { FAST } from "./fast.js";
import { PUBLIC } from "./public.js";
import { PRIVATE_ONLY } from "./private_only.js";
import { FULL } from "./full.js";

export const PROFILES = {
  fast: FAST,
  public: PUBLIC,
  private_only: PRIVATE_ONLY,
  full: FULL,
};

/**
 * Resolve a profile by id (case-insensitive). Returns FAST as fallback.
 * @param {string} id
 * @returns {object}
 */
export function resolveProfile(id) {
  const key = String(id || "fast").toLowerCase();
  return PROFILES[key] || FAST;
}
