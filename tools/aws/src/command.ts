import { spawn } from 'node:child_process';

export interface CommandSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  run(spec: CommandSpec): Promise<CommandResult>;
}

export const processCommandRunner: CommandRunner = {
  run: async (spec) =>
    new Promise((resolve, reject) => {
      const inherited = { ...process.env };
      for (const name of [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_SECURITY_TOKEN',
        'AWS_WEB_IDENTITY_TOKEN_FILE',
        'AWS_ROLE_ARN',
      ]) {
        delete inherited[name];
      }
      const child = spawn(spec.command, [...spec.args], {
        cwd: spec.cwd,
        env: spec.env === undefined ? inherited : { ...inherited, ...spec.env },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    }),
};

export async function runChecked(runner: CommandRunner, spec: CommandSpec): Promise<string> {
  const result = await runner.run(spec);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no command output';
    throw new Error(`${spec.command} failed with exit code ${result.exitCode}: ${detail}`);
  }
  return result.stdout;
}
