import { useRef } from 'react';

/**
 * Custom Hook for element-wise memoization based on a unique key.
 *
 * @template TItem - The type of items in the array.
 * @template TResult - The type of the result returned by the mapping function.
 * @param items - Array of items to be memoized.
 * @param getKey - Function to extract a unique and stable key from each item.
 * @param mapFn - Function to compute a derived value for each item.
 * @returns Array of mapped results in the same order as `items`.
 */
function useKeyedMemo<TItem, TResult>(
  items: TItem[],
  getKey: (item: TItem) => string | number,
  mapFn: (item: TItem) => TResult
): TResult[] {
  // Cache is a Map<key, { item, value }>
  const cacheRef = useRef<Map<string | number, { item: TItem; value: TResult }>>(new Map());
  const resultCacheRef = useRef<TResult[]>([]);

  let hasChanges = false;

  const results = items.map((item, index) => {
    const key = getKey(item);
    const cached = cacheRef.current.get(key);

    // If there's no cache entry or the item reference is different, recompute
    if (!cached || cached.item !== item) {
      const value = mapFn(item);
      cacheRef.current.set(key, { item, value });
      if (resultCacheRef.current[index] !== value) {
        hasChanges = true;
      }
      return value;
    }

    // Otherwise return the previously computed value
    return cached.value;
  });

  cacheRef.current.forEach((_, key) => {
    if (!items.some((item) => getKey(item) === key)) {
      cacheRef.current.delete(key);
      hasChanges = true;
    }
  });

  if (hasChanges || resultCacheRef.current.length !== results.length) {
    resultCacheRef.current = results;
    return results;
  }

  return resultCacheRef.current;
}

export default useKeyedMemo;
