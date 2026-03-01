#!/usr/bin/env node

/**
 * Syncs reference docs from @mindyournow/skills into skills/myn/references/
 * Runs as prebuild hook so every `npm run build` picks up latest references.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const src = resolve(projectRoot, 'node_modules', '@mindyournow', 'skills', 'skills', 'myn-api', 'references');
const dest = resolve(projectRoot, 'skills', 'myn', 'references');

if (!existsSync(src)) {
  console.log('[sync-skills] @mindyournow/skills not installed, skipping reference sync');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log(`[sync-skills] Synced references from @mindyournow/skills → skills/myn/references/`);
