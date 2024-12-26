/**
 * Compare oldValue and newValue deeply.
 * If they are equal (structurally), return oldValue to keep the same reference.
 * Otherwise return a new object/array/value from newValue.
 */
export function mergeKeepingOldReferences<T>(oldValue: T, newValue: T): T {
  // If they are strictly equal by reference, reuse old
  if (oldValue === newValue) {
    return oldValue;
  }

  // If either is primitive (string, number, boolean, null, undefined)
  // or if they have different types, just return newValue
  if (
    oldValue === null ||
    newValue === null ||
    typeof oldValue !== "object" ||
    typeof newValue !== "object"
  ) {
    return newValue;
  }

  // Handle the Array case
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    // If different length, we definitely need the new array
    if (oldValue.length !== newValue.length) {
      return newValue;
    }

    // Otherwise compare item-by-item
    let didChange = false;
    const mergedArray = newValue.map((newItem, i) => {
      const oldItem = oldValue[i];
      const mergedItem = mergeKeepingOldReferences(oldItem, newItem);
      if (mergedItem !== oldItem) {
        didChange = true;
      }
      return mergedItem;
    });

    // If no items changed reference, just reuse the entire old array
    return didChange ? (mergedArray as unknown as T) : oldValue;
  }

  // If both values are objects (non-array)
  if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
    const oldKeys = Object.keys(oldValue) as (keyof T)[];
    const newKeys = Object.keys(newValue) as (keyof T)[];

    // If the set of keys changed, we have to use newValue
    if (
      oldKeys.length !== newKeys.length ||
      newKeys.some((k) => !oldKeys.includes(k))
    ) {
      return newValue;
    }

    let didChange = false;
    const mergedObj = { ...newValue }; // or {} as T

    for (const key of oldKeys) {
      const oldVal = oldValue[key];
      const newVal = newValue[key];

      const mergedVal = mergeKeepingOldReferences(oldVal, newVal);
      mergedObj[key] = mergedVal;

      if (mergedVal !== oldVal) {
        didChange = true;
      }
    }

    // If no fields changed reference, reuse the entire old object
    return didChange ? mergedObj : oldValue;
  }

  // If one is an array and the other is an object, they differ by type
  return newValue;
}
