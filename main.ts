// Neon Vice entrypoint (Node 22, standard library only).
// Hands the app in: copies this repo's app/ and screenshots/ into the output
// directory and writes dossier.json there with the vendored make.fun library,
// which is the summary the judge reads. Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader, MAKEFUN_OUTPUT_DIR is unset and /output is used instead.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoRoot, 'app'), join(outputDir, 'app'));
copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

// The gate's caps, as the kit's reference/gate.json states them: the dossier
// text cap shapes the bytes; the rest refuse an entry the scorer would refuse
// (over 4 screenshots, one over 256 KiB, over 993 app files or 48 MiB of app
// files, or an app path over 1000 bytes; app/ shares /output's own cap of
// 1000 entries with screenshots/ and dossier.json).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
