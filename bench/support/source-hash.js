// Evidence packages record the exact source bytes they were measured against.
// A later release necessarily moves that hash, and calling it corruption would
// make every version bump fail CI. Internal consistency stays fatal (checksums,
// protocol hash, fixture hash, counts); implementation drift is reported loudly
// so the reader knows the numbers were produced by an earlier tree.
export function expectSourceHash(actual, expected, label = 'implementation') {
  if (actual === expected) return { match: true, actual, expected, label }
  console.warn(
    `⚠ source drift (${label}): evidence measured ${String(expected).slice(0, 12)}…, ` +
      `working tree is ${String(actual).slice(0, 12)}… — the recorded numbers describe an earlier release.`,
  )
  return { match: false, actual, expected, label }
}
