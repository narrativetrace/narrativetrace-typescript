// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPENAI_DIRECTORY, SKILLS } from "@narrativetrace/skills-catalogue";
import { packageVersion, packPlugin } from "./openai-plugin-pack.js";

// `--check` is wired into `pnpm run check` (after `pnpm run build`, so the catalogue's dist
// exists): it packs the OpenAI plugin directory's ZIP into a temporary directory, asserts the
// entry list and every package rule, and deletes it — the ZIP is a build output, never committed.
// `--pack` writes it under reports/openai-plugin/ for the owner to upload from a `v*` tag checkout
// (never a release workflow step; uploading and submitting stay the owner's action).

const PACK_DIR = "reports/openai-plugin";

function run(outDir: string): void {
  const root = process.cwd();
  const { path, entries } = packPlugin({
    root,
    outDir,
    version: packageVersion(root),
    skills: SKILLS,
    listing: OPENAI_DIRECTORY,
  });
  console.log(`openai-plugin: ${path} holds exactly the derived ${entries.length} entries:`);
  for (const entry of entries) console.log(`  ${entry}`);
}

const mode = process.argv[2];
if (mode === "--check") {
  const scratch = mkdtempSync(join(tmpdir(), "openai-plugin-check-"));
  try {
    run(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else if (mode === "--pack") {
  run(PACK_DIR);
} else {
  console.error("Usage: tsx tools/openai-plugin-pack-cli.ts --check|--pack");
  process.exit(1);
}
