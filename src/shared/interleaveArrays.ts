/**
 * Interleaves items from two arrays in a given ratio.
 * Preserves original sort order within each group.
 */
export function interleaveArrays<T>(
  items: T[],
  predicate: (item: T) => boolean,
  ratio: { a: number; b: number } = { a: 2, b: 1 },
): T[] {
  const groupA: T[] = [];
  const groupB: T[] = [];

  for (const item of items) {
    if (predicate(item)) {
      groupA.push(item);
    } else {
      groupB.push(item);
    }
  }

  if (groupA.length === 0) return groupB;
  if (groupB.length === 0) return groupA;

  const result: T[] = [];
  let idxA = 0;
  let idxB = 0;

  while (idxA < groupA.length || idxB < groupB.length) {
    for (let i = 0; i < ratio.a && idxA < groupA.length; i++) {
      result.push(groupA[idxA++]!);
    }
    for (let i = 0; i < ratio.b && idxB < groupB.length; i++) {
      result.push(groupB[idxB++]!);
    }
  }

  return result;
}
