// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  loadConfig,
  schemaViolations,
  untaggedFences,
  versionDrift,
  versionTags,
} from "./context7-check.js";

// CLI entry `check` runs every commit, no network: `context7.json` must validate against the
// committed Context7 schema, list exactly the repository's `v*` tags, and every code fence in the
// files Context7 indexes must carry a language tag (see context7-check.ts).

const repoRoot = process.cwd();
const { config, schema } = loadConfig(repoRoot);
const problems = schemaViolations(config, schema).map((v) => `schema: ${v}`);
const tags = versionTags(repoRoot);
if (tags.length === 0)
  console.log("context7-check: no v* tags in this checkout — previousVersions drift not checked");
else problems.push(...versionDrift(config, tags).map((v) => `versions: ${v}`));
problems.push(
  ...untaggedFences(repoRoot, config).map((f) => `untagged code fence: ${f.file}:${f.line}`),
);

if (problems.length > 0) {
  console.error(`context7-check: ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("context7-check: ok");
