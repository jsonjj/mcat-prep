import { createHash } from 'node:crypto';

export type KitIdentityKind = 'SCHEMA' | 'TEMPLATE';

export interface KitIdentityAggregate {
  readonly identities: readonly (readonly [string, string])[];
  readonly sha256: string;
}

export function deriveKitIdentityAggregate(
  identities: readonly (readonly [string, string])[],
  kind: KitIdentityKind,
): KitIdentityAggregate {
  const prefix = kind === 'SCHEMA' ? 'schemas/' : 'template/';
  const paths = identities.map(([path]) => path);
  const collisionKeys = paths.map((path) =>
    path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC'),
  );
  const invalidIdentity =
    new Set(paths).size !== paths.length ||
    new Set(collisionKeys).size !== collisionKeys.length ||
    identities.some(([path, digest]) => {
      const segments = path.split('/');
      return (
        path.length === 0 ||
        Buffer.from(path, 'utf8').toString('utf8') !== path ||
        path !== path.normalize('NFC') ||
        path.startsWith('/') ||
        path.endsWith('/') ||
        path.includes('\\') ||
        [...path].some((character) => {
          const codeUnit = character.charCodeAt(0);
          return codeUnit <= 31 || (codeUnit >= 127 && codeUnit <= 159);
        }) ||
        /[<>:"|?*]/.test(path) ||
        segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
        segments.some((segment) => {
          const deviceName = (segment.split('.')[0] ?? '').toUpperCase();
          return (
            /[. ]$/.test(segment) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName)
          );
        }) ||
        !/^[0-9a-f]{64}$/.test(digest)
      );
    });
  if (invalidIdentity) throw new Error(`${kind}_IDENTITY_SET_INVALID`);
  const selected = identities
    .filter(([path]) => path.startsWith(prefix))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  if (selected.length === 0) throw new Error(`${kind}_IDENTITY_SET_EMPTY`);
  if (selected.some(([path]) => path.length === prefix.length)) {
    throw new Error(`${kind}_IDENTITY_SET_INVALID`);
  }
  return {
    identities: selected,
    sha256: createHash('sha256').update(JSON.stringify(selected)).digest('hex'),
  };
}
