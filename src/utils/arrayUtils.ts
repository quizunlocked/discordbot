export const groupBy = <T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> => {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
};

export const sumBy = <T>(array: T[], fn: (item: T) => number): number => 
  array.reduce((sum, item) => sum + fn(item), 0);

export const minBy = <T>(array: T[], fn: (item: T) => number): T | undefined => 
  array.reduce((min, item) => fn(item) < fn(min) ? item : min);

export const maxBy = <T>(array: T[], fn: (item: T) => number): T | undefined => 
  array.reduce((max, item) => fn(item) > fn(max) ? item : max);

export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const partition = <T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] => {
  return array.reduce(
    ([pass, fail], item) => {
      return predicate(item) ? [[...pass, item], fail] : [pass, [...fail, item]];
    },
    [[] as T[], [] as T[]]
  );
};

export const uniqBy = <T, K>(array: T[], keyFn: (item: T) => K): T[] => {
  const seen = new Set<K>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const mapToObject = <T, K extends string | number, V>(
  array: T[],
  keyFn: (item: T) => K,
  valueFn: (item: T) => V
): Record<K, V> => {
  return array.reduce((acc, item) => {
    acc[keyFn(item)] = valueFn(item);
    return acc;
  }, {} as Record<K, V>);
};