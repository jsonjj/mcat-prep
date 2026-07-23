/**
 * Locale-independent UTF-16 code-unit ordering. JavaScript relational string
 * comparison is specified in code-unit order and does not depend on host ICU
 * data or locale configuration.
 */
export const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Stable JSON encoding for hashes and exact frozen-manifest projections. */
export const deterministicJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(deterministicJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${deterministicJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
