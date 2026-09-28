export type MessageCatalog = Record<string, string>;

type UnionToIntersection<Value> = (
  Value extends unknown
    ? (argument: Value) => void
    : never
) extends (argument: infer Intersection) => void
  ? Intersection
  : never;

export function mergeCatalogs<const Catalogs extends readonly MessageCatalog[]>(
  ...catalogs: Catalogs
): UnionToIntersection<Catalogs[number]> {
  const messages: MessageCatalog = {};
  for (const catalog of catalogs) {
    for (const [key, message] of Object.entries(catalog)) {
      if (Object.hasOwn(messages, key)) throw new Error(`Duplicate locale key: ${key}`);
      messages[key] = message;
    }
  }
  return messages as UnionToIntersection<Catalogs[number]>;
}
