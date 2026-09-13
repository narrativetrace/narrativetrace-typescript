// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Straight to source, not `@narrativetrace/skills`'s built `dist/` — same choice
// publish-restore-exceptions-cli.ts's sibling tools make; a publish run must not silently depend
// on `pnpm run build` having happened first.
import { extractAgentsMdSection } from "../packages/skills/src/render/agents-md.js";

// CLI entry the publish pipeline shells out to: `.publishignore` strips AGENTS.md whole (it is a
// private agent-orientation briefing citing internal planning notes), but its
// `<!-- narrativetrace:skills:start/end -->` section is committed BUILD OUTPUT that ships the same
// way a rendered `SKILL.md` under `.claude/skills/` does (documentation/what-to-commit.md).
// Composes the public AGENTS.md from just that section, read from the pristine pre-strip snapshot.

const [, , pristineRoot, stageRoot] = process.argv;
if (!pristineRoot || !stageRoot) {
  console.error("usage: tsx publish-agents-md-section-cli.ts <pristineRoot> <stageRoot>");
  process.exit(1);
}

const pristineAgentsMd = join(pristineRoot, "AGENTS.md");
const section = extractAgentsMdSection(readFileSync(pristineAgentsMd, "utf-8"));
if (!section) {
  console.error(`ERROR: ${pristineAgentsMd} has no narrativetrace:skills section to extract.`);
  process.exit(1);
}
writeFileSync(join(stageRoot, "AGENTS.md"), `${section}\n`);
console.log("wrote AGENTS.md (managed section only)");
