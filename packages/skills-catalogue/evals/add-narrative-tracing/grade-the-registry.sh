#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for a REGISTRY case: what the registry left in the project, and what the
# installer then did with it. Shared by both registry cases; run with cwd set to the scaffolded
# fixture copy, from a case's graders/verify.sh, with $1 naming the registry that delivered the
# pages (claude-marketplace | npx-skills) and $2 the service boundary that fixture defines.
#
# The published prompt's own promises are NOT graded here — grade-the-prompt.sh is the whole of
# that, and it runs last. What is graded here is the three things only a registry case can be
# asked, in the order that fails cheapest first:
#
#   1. No vendor page was written THROUGH a symbolic link. `npx skills add` makes
#      .claude/skills/<name> a link to .agents/skills/<name>, so writing the vendor flavour through
#      it would destroy the open-standard page it had just adopted. The invariant is keyed on the
#      one line the two flavours differ by: `allowed-tools` is in the vendor page and in no other.
#   2. The installer refused nothing, so no `--force` was needed. A registry's pages are our own
#      rendered pages, so an identical one is adopted rather than refused — and the refusal a
#      pre-adoption installer produced is exactly what a reader would have reached for --force over.
#   3. The registry's own files are still the registry's: its lock file, and the pages it wrote
#      where our installer never looks.
#
# $NARRATIVETRACE_CLI_BIN is THIS checkout's CLI, which the runner points at. Not `npx
# @narrativetrace/cli`: the published package is a release behind the adoption and symlink safety
# this script reads, so grading through it would measure the previous release's installer.
set -e

registry="$1"
service="$2"
if [ -z "$registry" ] || [ -z "$service" ]; then
  echo "usage: grade-the-registry.sh <claude-marketplace|npx-skills> <TracedServiceName>" >&2
  exit 1
fi
here=$(dirname "$0")
if [ -z "$NARRATIVETRACE_CLI_BIN" ] || [ ! -f "$NARRATIVETRACE_CLI_BIN" ]; then
  echo "NARRATIVETRACE_CLI_BIN names no file — the runner sets it to this checkout's own CLI, and" >&2
  echo "a registry case grades the plan THIS code makes. Harness defect, not a verdict." >&2
  exit 1
fi

# ------------------------------------------------------------------------------------------------
# 1. Nothing was written through a link.
# ------------------------------------------------------------------------------------------------
for page in .agents/skills/*/SKILL.md; do
  [ -f "$page" ] || continue
  if grep -q "^allowed-tools:" "$page"; then
    echo "$page carries the VENDOR flavour's allowed-tools line — the open-standard page was" >&2
    echo "overwritten, which is what writing through .claude/skills's symbolic link does" >&2
    exit 1
  fi
done

for entry in .claude/skills/*; do
  { [ -e "$entry" ] || [ -L "$entry" ]; } || continue
  if [ -L "$entry" ]; then
    target=$(readlink "$entry")
    case "$target" in
      *.agents/skills/*)
        echo "no write-through: $entry is still the registry's link to $target" ;;
      *)
        echo "$entry is a symbolic link to $target, which is not the open-standard page the" >&2
        echo "registry pointed it at — something replaced a link the installer must refuse" >&2
        exit 1 ;;
    esac
  elif ! grep -q "^allowed-tools:" "$entry/SKILL.md"; then
    echo "$entry/SKILL.md is a real page in the vendor's own directory but carries no" >&2
    echo "allowed-tools line — the wrong flavour was installed there" >&2
    exit 1
  else
    echo "no write-through: $entry holds the vendor flavour, as a real directory of its own"
  fi
done

# ------------------------------------------------------------------------------------------------
# 2. The installer refuses nothing on the tree the registry made, and needs no --force.
#    A dry run writes nothing and always exits 0, so the plan itself is what is read.
# ------------------------------------------------------------------------------------------------
plan=$(node "$NARRATIVETRACE_CLI_BIN" init --dry-run --json)

# printf, never echo: dash's echo turns the JSON's escaped \n back into a line break.
printf '%s\n' "$plan" | node -e '
  const plan = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const actions = plan.actions || [];
  const refused = actions.filter((a) => a.status === "refused");
  if (refused.length > 0) {
    console.error("the installer refuses actions on the registry-installed tree, so a reader would");
    console.error("reach for --force:", JSON.stringify(refused));
    process.exit(1);
  }
  const kinds = [...new Set(actions.map((a) => a.kind))].sort();
  console.log("no refusals: the plan is", kinds.join(", ") || "empty");
'

# ------------------------------------------------------------------------------------------------
# 3. What this particular registry leaves behind, and what the installer may never touch of it.
# ------------------------------------------------------------------------------------------------
case "$registry" in
  npx-skills)
    test -f skills-lock.json || {
      echo "the registry tool's own lock file is gone — the installer may remove only what it" >&2
      echo "wrote itself" >&2
      exit 1
    }
    node -e '
      const fs = require("fs");
      const lock = JSON.parse(fs.readFileSync("skills-lock.json", "utf8"));
      const names = Object.keys(lock.skills || {}).sort();
      if (names.length === 0) {
        console.error("skills-lock.json names no skill at all: the registry installed nothing");
        process.exit(1);
      }
      const missing = names.filter((n) => !fs.existsSync(`.agents/skills/${n}/SKILL.md`));
      if (missing.length > 0) {
        console.error("the lock file names skills with no page left on disk:", missing.join(", "));
        process.exit(1);
      }
      // The vendor side the tool symlinked has to be there too — as the link it made, or as the
      // real directory the installer replaced it with. Gone means somebody removed what the
      // registry left. lstatSync, never existsSync: a link whose target was removed is still the
      // leftover of a registry, and existsSync follows the link and answers false.
      const vendorless = names.filter((n) => {
        try {
          fs.lstatSync(`.claude/skills/${n}`);
          return false;
        } catch {
          return true;
        }
      });
      if (vendorless.length > 0) {
        console.error("the registry pointed .claude/skills at these and now nothing is there:",
          vendorless.join(", "));
        process.exit(1);
      }
      console.log("the registry left " + names.length + " pages and a lock file, all intact:",
        names.join(", "));
    '
    # A third place this tool has been seen to write: real pages under agent/skills, whose
    # frontmatter it reflows itself. Absent in the version that resolves today, and the argv is
    # unpinned on purpose — so the check stays, because our installer never looks there and must
    # therefore never have stamped one.
    for page in agent/skills/*/SKILL.md; do
      [ -f "$page" ] || continue
      if grep -q "installed by narrativetrace init from" "$page"; then
        echo "$page carries our provenance line, but it is the registry tool's own copy in a" >&2
        echo "directory the installer does not own" >&2
        exit 1
      fi
    done
    ;;
  claude-marketplace)
    test ! -f skills-lock.json || {
      echo "a user-scope plugin install writes no lock file into the project, so this tree was" >&2
      echo "not made by the registry this case names" >&2
      exit 1
    }
    # User scope: the plugin's pages live in the agent's own configuration, never in the project.
    # So every page that IS in the project has to be one the installer wrote and stamped.
    for page in .agents/skills/*/SKILL.md .claude/skills/*/SKILL.md; do
      [ -f "$page" ] || continue
      grep -q "installed by narrativetrace init from" "$page" || {
        echo "$page is in the project without the installer's provenance line, and a user-scope" >&2
        echo "plugin install puts nothing in the project — where did it come from?" >&2
        exit 1
      }
    done
    echo "user scope: the project carries no page the installer did not write"
    ;;
  *)
    echo "unknown registry \"$registry\" — the graders know claude-marketplace and npx-skills" >&2
    exit 1
    ;;
esac

# ------------------------------------------------------------------------------------------------
# 4. Everything the published prompt itself promises, graded exactly as the other cases grade it.
# ------------------------------------------------------------------------------------------------
sh "$here/grade-the-prompt.sh" "$service"
