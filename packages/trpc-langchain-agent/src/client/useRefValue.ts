import { useRef } from 'react';

/**
 * Creates a ref that is always up-to-date with the current value of `value`.
 * This is useful for passing values to callbacks or effects that expect a ref.
 *
 * @example
 * const [count, setCount] = useState(0);
 * const countRef = useRefValue(count);
 * // Pass to a callback that expects a ref
 * useSomeCallback(countRef);
 */
export function useRefValue<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
