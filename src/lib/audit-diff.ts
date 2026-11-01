function same(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  // Arrays (role tags) compare by value; two arrays are never ===.
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

// The fields whose values differ, as before/after objects.
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
) {
  const changed = Object.keys(after).filter(
    (key) => !same(before[key], after[key]),
  );
  return {
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    changed: changed.length > 0,
  };
}
