import type { RollupOptions } from 'rollup';
import { fileURLToPath } from 'node:url';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = ['src/client/index.ts', 'src/server/index.ts'];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: fileURLToPath(new URL('.', import.meta.url)),
  });
}
