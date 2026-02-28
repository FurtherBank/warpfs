/**
 * OS file filtering: intercepts macOS/Windows system files
 * that should never be forwarded to remote APIs.
 */

const BLOCKED_PATTERNS = [
  /^\.DS_Store$/,
  /^\._/,
  /^\.Spotlight-V100$/,
  /^\.Trashes$/,
  /^\.fseventsd$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,
  /^\.localized$/,
  /^Icon\r$/,
];

/**
 * Returns true if the filename should be silently handled in-memory
 * without forwarding to any remote API.
 */
export function isBlockedOsFile(filename: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(filename));
}
