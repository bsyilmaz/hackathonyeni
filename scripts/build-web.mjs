import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = join(projectRoot, 'src', 'renderer');
const agentsSource = join(projectRoot, 'agents');
const outputDirectory = join(projectRoot, 'web-dist');

if (relative(projectRoot, outputDirectory) !== 'web-dist') {
  throw new Error('Refusing to clean an unexpected output directory.');
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(rendererSource, outputDirectory, { recursive: true });
await cp(agentsSource, join(outputDirectory, 'agents'), { recursive: true });

console.log(`Static web demo built at ${outputDirectory}`);
