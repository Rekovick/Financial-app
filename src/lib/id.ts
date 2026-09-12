/** Collision-resistant enough for a household ledger, and readable in the sheet. */
export function makeId(prefix = 'tx'): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(5)))
          .map((b) => b.toString(36).padStart(2, '0'))
          .join('')
          .slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}${rand}`;
}
