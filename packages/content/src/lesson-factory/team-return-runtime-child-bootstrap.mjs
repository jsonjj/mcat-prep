import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const configurationDescriptor = openSync(
  process.env.TEAM_RUNTIME_CONFIGURATION_PATH,
  constants.O_RDONLY | constants.O_NOFOLLOW,
);
const configurationBytes = readFileSync(configurationDescriptor);
if (digest(configurationBytes) !== process.env.TEAM_RUNTIME_CONFIGURATION_SHA256) {
  throw new Error('CHILD_RUNTIME_CONFIGURATION_INVALID');
}
const configuration = JSON.parse(configurationBytes.toString('utf8'));
const authorizedSources = new Map();
const sealedRoots = configuration.sealedRoots.map((root) => resolve(root));
const isSealed = (path) =>
  sealedRoots.some((root) => {
    const candidate = relative(root, path);
    return candidate === '' || (!candidate.startsWith('..') && !isAbsolute(candidate));
  });
const assertAuthorizedPath = (path, expected, code) => {
  const actual = lstatSync(path);
  const bytes = readFileSync(path);
  if (
    !actual.isFile() ||
    actual.isSymbolicLink() ||
    actual.dev !== expected.device ||
    actual.ino !== expected.inode ||
    actual.size !== expected.size ||
    digest(bytes) !== expected.sha256
  ) {
    throw new Error(code);
  }
};
for (const expected of configuration.files) {
  const descriptor = openSync(expected.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const actual = fstatSync(descriptor);
  const bytes = readFileSync(descriptor);
  if (
    !actual.isFile() ||
    actual.dev !== expected.device ||
    actual.ino !== expected.inode ||
    actual.size !== expected.size ||
    digest(bytes) !== expected.sha256
  ) {
    throw new Error('CHILD_RUNTIME_FILE_IDENTITY_MISMATCH');
  }
  authorizedSources.set(resolve(expected.path), { ...expected, bytes });
}
registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:')) return nextLoad(url, context);
    const path = resolve(fileURLToPath(url));
    if (!isSealed(path)) return nextLoad(url, context);
    const expected = authorizedSources.get(path);
    if (expected === undefined) throw new Error('CHILD_RUNTIME_MODULE_NOT_AUTHORIZED');
    const loaded = nextLoad(url, context);
    assertAuthorizedPath(path, expected, 'CHILD_RUNTIME_MODULE_PATH_IDENTITY_MISMATCH');
    return { ...loaded, source: expected.bytes };
  },
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.startsWith('file:')) {
      const path = resolve(fileURLToPath(resolved.url));
      const parentPath =
        context.parentURL?.startsWith('file:') === true
          ? resolve(fileURLToPath(context.parentURL))
          : null;
      if (
        (isSealed(path) && !authorizedSources.has(path)) ||
        (parentPath !== null && isSealed(parentPath) && !isSealed(path))
      ) {
        throw new Error('CHILD_RUNTIME_MODULE_NOT_AUTHORIZED');
      }
    }
    return resolved;
  },
});
const mappedImage = (pid, expected) => {
  const result = childProcess.spawnSync(
    '/usr/sbin/lsof',
    ['-a', '-p', String(pid), '-d', 'txt', '-FfnDi'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) return false;
  return result.stdout
    .split(/\nf/)
    .map((entry) => entry.split('\n'))
    .some((lines) => {
      const descriptor = lines[0]?.replace(/^p[0-9]+$/, '');
      const device = Number.parseInt(lines.find((line) => line.startsWith('D'))?.slice(1) ?? '', 0);
      const inode = Number(lines.find((line) => line.startsWith('i'))?.slice(1));
      const path = lines.find((line) => line.startsWith('n'))?.slice(1);
      return (
        descriptor === 'txt' &&
        path === realpathSync(expected.path) &&
        device === expected.device &&
        inode === expected.inode
      );
    });
};
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  const path = resolve(String(command));
  if (!isSealed(path)) return originalSpawn.apply(this, arguments);
  const expected = authorizedSources.get(path);
  if (expected === undefined) throw new Error('CHILD_RUNTIME_EXECUTABLE_NOT_AUTHORIZED');
  assertAuthorizedPath(path, expected, 'CHILD_RUNTIME_EXECUTABLE_PATH_IDENTITY_MISMATCH');
  const child = originalSpawn.call(this, command, args, options);
  let verified = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (mappedImage(child.pid, expected)) {
      verified = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
  if (!verified) {
    child.kill('SIGKILL');
    throw new Error(`CHILD_RUNTIME_EXECUTABLE_MAPPING_UNVERIFIED:${path}`);
  }
  return child;
};
syncBuiltinESMExports();
