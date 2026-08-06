import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readlinkSync,
  readSync,
  symlinkSync,
  writeSync,
  type Stats,
} from 'node:fs';
import { dirname, join } from 'node:path';

const DIGEST = /^[0-9a-f]{64}$/;
export const ACCEPTANCE_RELATIVE_ROOT = 'TEAM.acceptance-v1';
export const MAX_ACCEPTANCE_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const MAX_ACCEPTANCE_MANIFEST_BYTES = 4 * 1024 * 1024;
export const MAX_ACCEPTANCE_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_ACCEPTANCE_AGGREGATE_BYTES =
  MAX_ACCEPTANCE_ARCHIVE_BYTES + MAX_ACCEPTANCE_MANIFEST_BYTES + MAX_ACCEPTANCE_RECEIPT_BYTES;
export const MAX_ACCEPTANCE_MARKERS = 16;
export const MAX_ACCEPTANCE_CHAIN_DEPTH = 16;

export type AcceptanceObjectKind = 'archive' | 'manifest' | 'receipt';

export interface AcceptanceObjectIdentity {
  readonly device: number;
  readonly inode: number;
  readonly mode: 256;
  readonly nlink: 1;
  readonly relativePath: string;
  readonly size: number;
}

export interface AcceptanceObjectRead {
  readonly bytes: Buffer;
  readonly identity: AcceptanceObjectIdentity;
}

export interface AcceptanceMarkerIdentity {
  readonly device: number;
  readonly inode: number;
  readonly mode: number;
  readonly target: string;
}

export type AcceptancePublicationBoundary =
  | 'ARCHIVE_OBJECT_WRITE'
  | 'ARCHIVE_OBJECT_FSYNC'
  | 'MANIFEST_OBJECT_WRITE'
  | 'MANIFEST_OBJECT_FSYNC'
  | 'RECEIPT_OBJECT_WRITE'
  | 'RECEIPT_OBJECT_FSYNC'
  | 'ARCHIVE_OBJECT_INDEX_CREATE'
  | 'ARCHIVE_OBJECT_INDEX_FSYNC'
  | 'MANIFEST_OBJECT_INDEX_CREATE'
  | 'MANIFEST_OBJECT_INDEX_FSYNC'
  | 'RECEIPT_OBJECT_INDEX_CREATE'
  | 'RECEIPT_OBJECT_INDEX_FSYNC'
  | 'PRE_MARKER_CREATE'
  | 'POST_MARKER_CREATE'
  | 'MARKER_PARENT_FSYNC';

interface RootIdentity {
  readonly device: number;
  readonly inode: number;
}

function rootIdentity(path: string): RootIdentity {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('ACCEPTANCE_ROOT_INVALID');
  return { device: info.dev, inode: info.ino };
}

function assertRootIdentity(path: string, expected: RootIdentity): void {
  const current = rootIdentity(path);
  if (current.device !== expected.device || current.inode !== expected.inode) {
    throw new Error('ACCEPTANCE_ROOT_IDENTITY_CHANGED');
  }
}

function openDirectory(path: string): number {
  const descriptor = openSync(
    path,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  const info = fstatSync(descriptor);
  if (!info.isDirectory()) {
    closeSync(descriptor);
    throw new Error('ACCEPTANCE_DIRECTORY_INVALID');
  }
  return descriptor;
}

function ensureDirectory(path: string, expectedDevice: number): void {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.dev !== expectedDevice ||
    (info.mode & 0o777) !== 0o700
  ) {
    throw new Error('ACCEPTANCE_DIRECTORY_INVALID');
  }
  for (const directory of [path, dirname(path)]) {
    const descriptor = openDirectory(directory);
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
}

export interface AcceptanceStore {
  readonly commitsIdentity: RootIdentity;
  readonly commitsRoot: string;
  readonly objectsRoot: string;
  readonly rootIdentity: RootIdentity;
  readonly storeIdentity: RootIdentity;
  readonly storeRoot: string;
}

export function openAcceptanceStore(teamRoot: string): AcceptanceStore {
  const expectedRoot = rootIdentity(teamRoot);
  const storeRoot = join(teamRoot, ACCEPTANCE_RELATIVE_ROOT);
  ensureDirectory(storeRoot, expectedRoot.device);
  const objectsRoot = join(storeRoot, 'objects');
  const commitsRoot = join(storeRoot, 'commits');
  ensureDirectory(objectsRoot, expectedRoot.device);
  ensureDirectory(commitsRoot, expectedRoot.device);
  for (const kind of ['archive', 'manifest', 'receipt'] as const) {
    ensureDirectory(join(objectsRoot, kind), expectedRoot.device);
  }
  assertRootIdentity(teamRoot, expectedRoot);
  return {
    commitsIdentity: rootIdentity(commitsRoot),
    commitsRoot,
    objectsRoot,
    rootIdentity: expectedRoot,
    storeIdentity: rootIdentity(storeRoot),
    storeRoot,
  };
}

function maximumBytes(kind: AcceptanceObjectKind): number {
  if (kind === 'archive') return MAX_ACCEPTANCE_ARCHIVE_BYTES;
  if (kind === 'manifest') return MAX_ACCEPTANCE_MANIFEST_BYTES;
  return MAX_ACCEPTANCE_RECEIPT_BYTES;
}

export function acceptanceObjectRelativePath(kind: AcceptanceObjectKind, sha256: string): string {
  if (!DIGEST.test(sha256)) throw new Error('ACCEPTANCE_OBJECT_DIGEST_INVALID');
  return `${ACCEPTANCE_RELATIVE_ROOT}/objects/${kind}/${sha256}.index`;
}

function indexBoundary(
  kind: AcceptanceObjectKind,
  phase: 'CREATE' | 'FSYNC',
): AcceptancePublicationBoundary {
  return `${kind.toUpperCase()}_OBJECT_INDEX_${phase}` as AcceptancePublicationBoundary;
}

function durableIndexedObjectRelativePath(
  teamRoot: string,
  kind: AcceptanceObjectKind,
  expectedSha256: string,
  onBoundary?: (boundary: AcceptancePublicationBoundary) => void,
): string {
  const indexRelativePath = acceptanceObjectRelativePath(kind, expectedSha256);
  const indexPath = join(teamRoot, indexRelativePath);
  const descriptor = openSync(indexPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o400 ||
      before.size !== 72
    ) {
      throw new Error('ACCEPTANCE_OBJECT_INDEX_INVALID');
    }
    const bytes = Buffer.alloc(72);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (read === 0) throw new Error('ACCEPTANCE_OBJECT_INDEX_INVALID');
      offset += read;
    }
    const target = bytes.toString('utf8');
    if (!/^[0-9a-f]{64}\.object\n$/.test(target)) {
      throw new Error('ACCEPTANCE_OBJECT_INDEX_INVALID');
    }
    const after = fstatSync(descriptor);
    const pathInfo = lstatSync(indexPath);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      pathInfo.isSymbolicLink() ||
      !pathInfo.isFile() ||
      pathInfo.dev !== before.dev ||
      pathInfo.ino !== before.ino ||
      pathInfo.nlink !== 1 ||
      (pathInfo.mode & 0o777) !== 0o400
    ) {
      throw new Error('ACCEPTANCE_OBJECT_INDEX_CHANGED');
    }
    fsyncSync(descriptor);
    onBoundary?.(indexBoundary(kind, 'FSYNC'));
    const parent = openDirectory(dirname(indexPath));
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
    return `${ACCEPTANCE_RELATIVE_ROOT}/objects/${kind}/${target.slice(0, -1)}`;
  } finally {
    closeSync(descriptor);
  }
}

function identityFromStat(relativePath: string, info: Stats): AcceptanceObjectIdentity {
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    (info.mode & 0o777) !== 0o400 ||
    !Number.isSafeInteger(info.size) ||
    info.size < 0 ||
    (info.size > 0 && Number(info.blocks) * 512 < info.size)
  ) {
    throw new Error('ACCEPTANCE_OBJECT_IDENTITY_INVALID');
  }
  return {
    device: info.dev,
    inode: info.ino,
    mode: 0o400,
    nlink: 1,
    relativePath,
    size: info.size,
  };
}

function boundedRead(
  descriptor: number,
  size: number,
  maximum: number,
  digest: (bytes: Buffer) => string,
  expectedSha256: string,
): Buffer {
  if (size > maximum) throw new Error('ACCEPTANCE_OBJECT_SIZE_LIMIT');
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = readSync(descriptor, bytes, offset, size - offset, offset);
    if (read === 0) throw new Error('ACCEPTANCE_OBJECT_TRUNCATED');
    offset += read;
  }
  if (digest(bytes) !== expectedSha256) throw new Error('ACCEPTANCE_OBJECT_HASH_MISMATCH');
  return bytes;
}

function exactPathIdentity(path: string, expected: AcceptanceObjectIdentity): void {
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.dev !== expected.device ||
    info.ino !== expected.inode ||
    info.size !== expected.size ||
    info.nlink !== 1 ||
    (info.mode & 0o777) !== 0o400
  ) {
    throw new Error('ACCEPTANCE_OBJECT_PATH_CHANGED');
  }
}

export function readImmutableObject(
  teamRoot: string,
  kind: AcceptanceObjectKind,
  expectedSha256: string,
  digest: (bytes: Buffer) => string,
  expectedIdentity?: AcceptanceObjectIdentity,
): AcceptanceObjectRead {
  const relativePath = durableIndexedObjectRelativePath(teamRoot, kind, expectedSha256);
  const path = join(teamRoot, relativePath);
  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = identityFromStat(relativePath, fstatSync(descriptor));
    if (
      expectedIdentity !== undefined &&
      (before.device !== expectedIdentity.device ||
        before.inode !== expectedIdentity.inode ||
        before.mode !== expectedIdentity.mode ||
        before.nlink !== expectedIdentity.nlink ||
        before.relativePath !== expectedIdentity.relativePath ||
        before.size !== expectedIdentity.size)
    ) {
      throw new Error('ACCEPTANCE_OBJECT_HANDLE_MISMATCH');
    }
    const bytes = boundedRead(descriptor, before.size, maximumBytes(kind), digest, expectedSha256);
    const after = identityFromStat(relativePath, fstatSync(descriptor));
    if (
      before.device !== after.device ||
      before.inode !== after.inode ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      before.size !== after.size
    ) {
      throw new Error('ACCEPTANCE_OBJECT_CHANGED_DURING_READ');
    }
    exactPathIdentity(path, after);
    return { bytes, identity: after };
  } finally {
    closeSync(descriptor);
  }
}

function objectBoundary(
  kind: AcceptanceObjectKind,
  phase: 'WRITE' | 'FSYNC',
): AcceptancePublicationBoundary {
  return `${kind.toUpperCase()}_OBJECT_${phase}` as AcceptancePublicationBoundary;
}

export function writeImmutableObject(
  store: AcceptanceStore,
  teamRoot: string,
  kind: AcceptanceObjectKind,
  bytes: Buffer,
  expectedSha256: string,
  digest: (bytes: Buffer) => string,
  onBoundary?: (boundary: AcceptancePublicationBoundary) => void,
  onBeforeValidation?: (kind: AcceptanceObjectKind, path: string) => void,
): AcceptanceObjectIdentity {
  if (
    !DIGEST.test(expectedSha256) ||
    bytes.byteLength > maximumBytes(kind) ||
    digest(bytes) !== expectedSha256
  ) {
    throw new Error('ACCEPTANCE_OBJECT_DIGEST_INVALID');
  }
  assertRootIdentity(teamRoot, store.rootIdentity);
  assertRootIdentity(store.storeRoot, store.storeIdentity);
  const name = `${randomBytes(32).toString('hex')}.object`;
  const relativePath = `${ACCEPTANCE_RELATIVE_ROOT}/objects/${kind}/${name}`;
  const path = join(teamRoot, relativePath);
  const descriptor = openSync(
    path,
    fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    onBoundary?.(objectBoundary(kind, 'WRITE'));
    let offset = 0;
    while (offset < bytes.byteLength) {
      offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    }
    fchmodSync(descriptor, 0o400);
    onBoundary?.(objectBoundary(kind, 'FSYNC'));
    fsyncSync(descriptor);
    onBeforeValidation?.(kind, path);
    const identity = identityFromStat(relativePath, fstatSync(descriptor));
    const verified = boundedRead(
      descriptor,
      identity.size,
      maximumBytes(kind),
      digest,
      expectedSha256,
    );
    if (verified.byteLength !== bytes.byteLength) {
      throw new Error('ACCEPTANCE_OBJECT_SIZE_CHANGED');
    }
    exactPathIdentity(path, identity);
    const indexPath = join(teamRoot, acceptanceObjectRelativePath(kind, expectedSha256));
    let indexDescriptor: number;
    try {
      indexDescriptor = openSync(
        indexPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const durableRelativePath = durableIndexedObjectRelativePath(
        teamRoot,
        kind,
        expectedSha256,
        onBoundary,
      );
      const existing = readImmutableObject(teamRoot, kind, expectedSha256, digest);
      if (existing.identity.relativePath !== durableRelativePath) {
        throw new Error('ACCEPTANCE_OBJECT_INDEX_CHANGED');
      }
      return existing.identity;
    }
    try {
      const indexBytes = Buffer.from(`${name}\n`);
      let indexOffset = 0;
      while (indexOffset < indexBytes.byteLength) {
        indexOffset += writeSync(
          indexDescriptor,
          indexBytes,
          indexOffset,
          indexBytes.byteLength - indexOffset,
        );
      }
      fchmodSync(indexDescriptor, 0o400);
      onBoundary?.(indexBoundary(kind, 'CREATE'));
      fsyncSync(indexDescriptor);
      onBoundary?.(indexBoundary(kind, 'FSYNC'));
    } finally {
      closeSync(indexDescriptor);
    }
    const indexedRelativePath = durableIndexedObjectRelativePath(teamRoot, kind, expectedSha256);
    if (indexedRelativePath !== relativePath) {
      throw new Error('ACCEPTANCE_OBJECT_INDEX_CHANGED');
    }
    const parent = openDirectory(dirname(indexPath));
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
    assertRootIdentity(teamRoot, store.rootIdentity);
    assertRootIdentity(store.storeRoot, store.storeIdentity);
    return identity;
  } finally {
    closeSync(descriptor);
  }
}

export function inspectAcceptanceMarker(
  teamRoot: string,
  markerRelativePath: string,
  expectedTarget: string,
): AcceptanceMarkerIdentity | null {
  if (
    !DIGEST.test(expectedTarget) ||
    !/^TEAM\.acceptance-v1\/commits\/[0-9a-f]{64}$/.test(markerRelativePath)
  ) {
    return null;
  }
  const path = join(teamRoot, markerRelativePath);
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!info.isSymbolicLink()) return null;
  const target = readlinkSync(path);
  if (target !== expectedTarget || !DIGEST.test(target)) return null;
  return { device: info.dev, inode: info.ino, mode: info.mode & 0o777, target };
}

export function createAcceptanceMarker(
  store: AcceptanceStore,
  teamRoot: string,
  markerRelativePath: string,
  manifestSha256: string,
  onBoundary?: (boundary: AcceptancePublicationBoundary) => void,
): AcceptanceMarkerIdentity {
  if (
    !DIGEST.test(manifestSha256) ||
    !/^TEAM\.acceptance-v1\/commits\/[0-9a-f]{64}$/.test(markerRelativePath)
  ) {
    throw new Error('ACCEPTANCE_MARKER_PATH_INVALID');
  }
  assertRootIdentity(teamRoot, store.rootIdentity);
  assertRootIdentity(store.storeRoot, store.storeIdentity);
  assertRootIdentity(store.commitsRoot, store.commitsIdentity);
  const markerPath = join(teamRoot, markerRelativePath);
  onBoundary?.('PRE_MARKER_CREATE');
  symlinkSync(manifestSha256, markerPath);
  onBoundary?.('POST_MARKER_CREATE');
  assertRootIdentity(teamRoot, store.rootIdentity);
  assertRootIdentity(store.storeRoot, store.storeIdentity);
  assertRootIdentity(store.commitsRoot, store.commitsIdentity);
  const marker = inspectAcceptanceMarker(teamRoot, markerRelativePath, manifestSha256);
  if (marker === null) throw new Error('ACCEPTANCE_MARKER_INVALID');
  const commits = openDirectory(store.commitsRoot);
  try {
    fsyncSync(commits);
  } finally {
    closeSync(commits);
  }
  onBoundary?.('MARKER_PARENT_FSYNC');
  assertRootIdentity(teamRoot, store.rootIdentity);
  assertRootIdentity(store.storeRoot, store.storeIdentity);
  assertRootIdentity(store.commitsRoot, store.commitsIdentity);
  return marker;
}
