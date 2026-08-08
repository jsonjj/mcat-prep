import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { once } from 'node:events';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const configurationBytes = process.argv[1]?.startsWith('base64:')
  ? Buffer.from(process.argv[1].slice('base64:'.length), 'base64')
  : readFileSync(process.argv[2]);
const configuration = JSON.parse(configurationBytes.toString('utf8'));
const descriptors = [];
const authorizedSources = new Map();
const mappedExecutables = new Set();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const synchronousExecutableSupervisor = `
  import { spawn, spawnSync } from 'node:child_process';
  import { lstatSync } from 'node:fs';
  import { resolve } from 'node:path';
  const configuration = JSON.parse(
    Buffer.from(process.argv[1].slice('base64:'.length), 'base64').toString('utf8'),
  );
  const records = (pid) => {
    const result = spawnSync(
      '/usr/sbin/lsof',
      ['-a', '-p', String(pid), '-d', 'txt', '-FfnDi'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    if (result.status !== 0) return [];
    return result.stdout.split(/\\nf/).map((entry) => entry.split('\\n')).map((lines) => ({
      descriptor: lines[0]?.replace(/^p[0-9]+$/, ''),
      device: Number.parseInt(lines.find((line) => line.startsWith('D'))?.slice(1) ?? '', 0),
      inode: Number(lines.find((line) => line.startsWith('i'))?.slice(1)),
      path: lines.find((line) => line.startsWith('n'))?.slice(1),
    }));
  };
  const mapped = (pid, expected) =>
    records(pid).some((record) =>
      record.descriptor === 'txt' &&
      record.path === resolve(expected.path) &&
      record.device === expected.device &&
      record.inode === expected.inode
    );
  if (!mapped(process.pid, configuration.node)) {
    throw new Error('SYNC_SUPERVISOR_NODE_MAPPING_UNVERIFIED');
  }
  const child = spawn(configuration.command, configuration.arguments, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let verified = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (mapped(child.pid, configuration.executable)) {
      verified = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
  if (!verified) {
    child.kill('SIGKILL');
    throw new Error('SYNC_SUPERVISOR_EXECUTABLE_MAPPING_UNVERIFIED');
  }
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const [status, signal] = await new Promise((resolveExit) =>
    child.once('exit', (code, value) => resolveExit([code, value])),
  );
  if (signal !== null) process.kill(process.pid, signal);
  process.exitCode = status ?? 1;
`;
const sealedRoots = configuration.sealedRoots.map((root) => resolve(root));
const isSealed = (path) =>
  sealedRoots.some((root) => {
    const candidate = relative(root, path);
    return candidate === '' || (!candidate.startsWith('..') && !isAbsolute(candidate));
  });
const assertAuthorizedPath = (path, expected, code) => {
  const actual = lstatSync(path);
  const pathnameBytes = readFileSync(path);
  if (
    !actual.isFile() ||
    actual.isSymbolicLink() ||
    actual.dev !== expected.device ||
    actual.ino !== expected.inode ||
    actual.size !== expected.size ||
    digest(pathnameBytes) !== expected.sha256
  ) {
    throw new Error(code);
  }
};
const readAcknowledgment = () => {
  const chunks = [];
  for (;;) {
    const bytes = Buffer.alloc(256);
    try {
      const count = readSync(0, bytes, 0, bytes.length, null);
      if (count === 0) return Buffer.concat(chunks).toString('utf8');
      chunks.push(bytes.subarray(0, count));
      const value = Buffer.concat(chunks).toString('utf8');
      if (value.endsWith('\n')) return value;
    } catch (error) {
      if (error?.code !== 'EAGAIN') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
};
try {
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
      throw new Error('SUPERVISOR_FILE_IDENTITY_MISMATCH');
    }
    descriptors.push(descriptor);
    authorizedSources.set(resolve(expected.path), {
      bytes,
      device: expected.device,
      inode: expected.inode,
      sha256: expected.sha256,
      size: expected.size,
    });
  }
  registerHooks({
    load(url, context, nextLoad) {
      if (!url.startsWith('file:')) return nextLoad(url, context);
      const path = resolve(fileURLToPath(url));
      if (!isSealed(path)) return nextLoad(url, context);
      const expected = authorizedSources.get(path);
      if (expected === undefined) throw new Error('SUPERVISOR_MODULE_NOT_AUTHORIZED');
      const loaded = nextLoad(url, context);
      assertAuthorizedPath(path, expected, 'SUPERVISOR_MODULE_PATH_IDENTITY_MISMATCH');
      return { ...loaded, source: expected.bytes };
    },
    resolve(specifier, context, nextResolve) {
      const packageAlias = configuration.packageAliases?.[specifier];
      if (packageAlias !== undefined) {
        const path = resolve(packageAlias);
        if (!isSealed(path) || !authorizedSources.has(path)) {
          throw new Error('SUPERVISOR_PACKAGE_ALIAS_NOT_AUTHORIZED');
        }
        return { shortCircuit: true, url: pathToFileURL(path).href };
      }
      const resolved = nextResolve(specifier, context);
      if (resolved.url.startsWith('file:')) {
        const path = resolve(fileURLToPath(resolved.url));
        if (isSealed(path) && !authorizedSources.has(path)) {
          throw new Error('SUPERVISOR_MODULE_NOT_AUTHORIZED');
        }
      }
      return resolved;
    },
  });
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function (command, args, options) {
    const path = resolve(String(command));
    if (!isSealed(path)) return originalSpawn.apply(this, arguments);
    const expected = authorizedSources.get(path);
    if (expected === undefined) throw new Error('SUPERVISOR_EXECUTABLE_NOT_AUTHORIZED');
    assertAuthorizedPath(path, expected, 'SUPERVISOR_EXECUTABLE_PATH_IDENTITY_MISMATCH');
    const child = originalSpawn.call(this, command, args, options);
    writeSync(
      3,
      `${JSON.stringify({
        device: expected.device,
        inode: expected.inode,
        nonce: configuration.nonce,
        path,
        pid: child.pid,
        type: 'EXECUTABLE_READY',
      })}\n`,
    );
    if (readAcknowledgment() !== `EXEC_GO ${configuration.nonce} ${child.pid}\n`) {
      child.kill('SIGKILL');
      throw new Error('SUPERVISOR_EXECUTABLE_MAPPING_UNVERIFIED');
    }
    mappedExecutables.add(path);
    return child;
  };
  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function (command, args, options) {
    const path = resolve(String(command));
    if (!isSealed(path)) return originalExecFileSync.apply(this, arguments);
    const expected = authorizedSources.get(path);
    const node = authorizedSources.get(resolve(configuration.node));
    if (expected === undefined || node === undefined) {
      throw new Error('SUPERVISOR_EXECUTABLE_NOT_AUTHORIZED');
    }
    assertAuthorizedPath(path, expected, 'SUPERVISOR_EXECUTABLE_PATH_IDENTITY_MISMATCH');
    assertAuthorizedPath(
      resolve(configuration.node),
      node,
      'SUPERVISOR_NODE_PATH_IDENTITY_MISMATCH',
    );
    const wrapperConfiguration = Buffer.from(
      JSON.stringify({
        arguments: args ?? [],
        command: path,
        executable: { ...expected, path },
        node: { ...node, path: resolve(configuration.node) },
      }),
    ).toString('base64');
    const result = originalExecFileSync.call(
      this,
      configuration.node,
      [
        '--input-type=module',
        '--eval',
        synchronousExecutableSupervisor,
        `base64:${wrapperConfiguration}`,
      ],
      options,
    );
    mappedExecutables.add(path);
    writeSync(
      3,
      `${JSON.stringify({
        device: expected.device,
        inode: expected.inode,
        nonce: configuration.nonce,
        path,
        type: 'EXECUTABLE_VERIFIED',
      })}\n`,
    );
    return result;
  };
  syncBuiltinESMExports();
  writeSync(
    3,
    `${JSON.stringify({
      nonce: configuration.nonce,
      openFileCount: descriptors.length,
      pid: process.pid,
    })}\n`,
  );
  const [command] = await once(process.stdin, 'data');
  if (String(command) !== `GO ${configuration.nonce}\n`) {
    throw new Error('SUPERVISOR_HANDSHAKE_INVALID');
  }
  process.stdin.pause();
  const childBootstrap = authorizedSources.get(resolve(configuration.childBootstrap));
  if (childBootstrap === undefined) {
    throw new Error('SUPERVISOR_CHILD_BOOTSTRAP_NOT_AUTHORIZED');
  }
  assertAuthorizedPath(
    resolve(configuration.childBootstrap),
    childBootstrap,
    'SUPERVISOR_CHILD_BOOTSTRAP_PATH_IDENTITY_MISMATCH',
  );
  process.env.TEAM_RUNTIME_CONFIGURATION_PATH = configuration.configurationPath;
  process.env.TEAM_RUNTIME_CONFIGURATION_SHA256 = digest(configurationBytes);
  process.env.NODE_OPTIONS = `--import=data:text/javascript;base64,${childBootstrap.bytes.toString(
    'base64',
  )}`;
  process.argv = [configuration.node, configuration.tsxCli, ...configuration.arguments];
  await import(pathToFileURL(configuration.tsxCli).href);
  if (
    !(configuration.parentRequiredExecutablePaths ?? []).every((path) =>
      mappedExecutables.has(resolve(path)),
    )
  ) {
    throw new Error('SUPERVISOR_REQUIRED_EXECUTABLE_NOT_MAPPED');
  }
} finally {
  for (const descriptor of descriptors) closeSync(descriptor);
}
