/**
 * lib/featureFlags.ts
 *
 * Compile-time feature flags for capabilities we want to keep the code
 * for but currently suppress. Flipping a value here is the ONLY change
 * needed to turn the feature on/off — no imports removed, no logic
 * deleted. The dead code stays in place, tested by type-check, and
 * ready to re-enable.
 */
export const FEATURES = {
  /**
   * GPS-based location resolution.
   *
   * When false:
   *   - useLocationResolver never reads permission state, never reads
   *     the saved-GPS slot, and always resolves to 'city' (if the
   *     signed-in user has one) or 'fallback'.
   *   - requestLocation() is a no-op.
   *   - SearchNearbyToggle hides itself.
   *   - useNearbyServiceProvidersIfGranted returns the disabled shape
   *     without ever asking the Permissions API.
   *
   * The entire GPS plumbing (native module, geo helpers, sequential
   * radius search, "استخدم موقعي" wiring) remains intact — set to true
   * to bring it back with no other edits.
   */
  GPS_LOCATION: false,
} as const;
