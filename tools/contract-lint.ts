// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { type ContractEntry, type ContractKind, isContractKind } from "./contract-decision.js";

/**
 * Everything `documentation/contract.yaml` can be validated for WITHOUT the network: the schema
 * parses, no two entries make the same claim, every entry's probe file exists, and every
 * `page#anchor` pointer resolves to a heading that actually exists (a hand-rolled
 * GitHub-flavoured-Markdown slugifier). Runs every commit, no network. The holds/fails decision
 * for an actual probe result lives in contract-decision.ts, exercised nightly by contract-probe/
 * and, offline, by this module's own fixture tests.
 */
export interface ContractDocument {
  readonly versionSource: string;
  readonly entries: readonly ContractEntry[];
}

export interface ContractPageRef {
  readonly relativePath: string;
  readonly anchor: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * The GitHub-flavoured-Markdown heading slug: lowercase, strip anything but `[a-z0-9 _-]`, then
 * turn spaces into hyphens. Deliberately does not collapse repeated hyphens/spaces — a heading
 * with a colon or a parenthetical between two words legitimately slugs to a double hyphen,
 * matching the algorithm GitHub's own renderer uses, so an anchor validated here is also the one
 * a reader's click actually lands on.
 */
export function slugify(heading: string): string {
  const lower = heading.toLowerCase();
  let kept = "";
  for (const ch of lower) {
    if (/[a-z0-9 _-]/.test(ch)) kept += ch;
  }
  return kept.replaceAll(" ", "-");
}

/** Every anchor slug `markdown`'s headings produce, in document order, with GitHub's own
 * disambiguation for a repeated slug (`foo`, `foo-1`, `foo-2`, …). */
export function headingAnchors(markdown: string): ReadonlySet<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of markdown.split("\n")) {
    const match = HEADING_RE.exec(line);
    if (!match) continue;
    const base = slugify(match[2] as string);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** Splits `"documentation/foo.md#some-anchor"` into path and anchor; throws on a pointer with no
 * `#anchor` half — a contract entry is always about one specific claim, never a whole page. */
export function parsePageRef(page: string): ContractPageRef {
  const hashIndex = page.indexOf("#");
  if (hashIndex <= 0 || hashIndex === page.length - 1) {
    throw new Error(`"${page}" — a contract entry's page must be "<path>#<anchor>"`);
  }
  return { relativePath: page.slice(0, hashIndex), anchor: page.slice(hashIndex + 1) };
}

function requiredField(raw: Record<string, unknown>, name: string, id: string): string {
  const value = raw[name];
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`documentation/contract.yaml: entry "${id}" missing "${name}"`);
}

function parseEntry(raw: Record<string, unknown>): ContractEntry {
  const id = requiredField(raw, "id", String(raw.id ?? "<unknown>"));
  const kindRaw = requiredField(raw, "kind", id);
  if (!isContractKind(kindRaw)) {
    throw new Error(`documentation/contract.yaml: entry "${id}" has unknown kind "${kindRaw}"`);
  }
  const kind: ContractKind = kindRaw;
  const expect =
    (raw.documented_default as string | undefined) ?? (raw.expected_effect as string | undefined);
  if (!expect) {
    throw new Error(
      `documentation/contract.yaml: entry "${id}" needs "documented_default" or "expected_effect"`,
    );
  }
  if (kind === "entry-point") requiredField(raw, "coordinate", id);
  return {
    id,
    kind,
    page: requiredField(raw, "page", id),
    claim: requiredField(raw, "claim", id),
    expect,
    probe: requiredField(raw, "probe", id),
    coordinate: raw.coordinate as string | undefined,
    registry: raw.registry as string | undefined,
  };
}

/** Parses `documentation/contract.yaml`. Throws (never returns a partial document) on anything the
 * schema does not allow — a malformed contract must fail loud. */
export function parseContractYaml(content: string): ContractDocument {
  const root = parseYaml(content) as Record<string, unknown> | undefined;
  if (!root) throw new Error("documentation/contract.yaml: empty document");
  const versionSource = root.version_source;
  if (typeof versionSource !== "string" || versionSource.length === 0) {
    throw new Error('documentation/contract.yaml: missing "version_source"');
  }
  const rawEntries = root.entries;
  if (!Array.isArray(rawEntries)) {
    throw new Error('documentation/contract.yaml: missing "entries" list');
  }
  return {
    versionSource,
    entries: rawEntries.map((raw) => parseEntry(raw as Record<string, unknown>)),
  };
}

function lintOneEntry(repoRoot: string, entry: ContractEntry): string[] {
  const problems: string[] = [];
  if (!existsSync(join(repoRoot, entry.probe))) {
    problems.push(`"${entry.id}": probe "${entry.probe}" does not exist`);
  }
  try {
    const ref = parsePageRef(entry.page);
    const pageFile = join(repoRoot, ref.relativePath);
    if (!existsSync(pageFile)) {
      problems.push(`"${entry.id}": page "${ref.relativePath}" does not exist`);
    } else if (!headingAnchors(readFileSync(pageFile, "utf-8")).has(ref.anchor)) {
      problems.push(`"${entry.id}": anchor "#${ref.anchor}" not found in ${ref.relativePath}`);
    }
  } catch (error) {
    problems.push(`"${entry.id}": ${(error as Error).message}`);
  }
  return problems;
}

function lintDuplicates(entries: readonly ContractEntry[]): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenClaims = new Map<string, string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) problems.push(`duplicate entry id "${entry.id}"`);
    seenIds.add(entry.id);
    const firstId = seenClaims.get(entry.claim);
    if (firstId)
      problems.push(`"${entry.id}" and "${firstId}" make the same claim: "${entry.claim}"`);
    else seenClaims.set(entry.claim, entry.id);
  }
  return problems;
}

/** Every problem the contract gate reports, empty when `document` is internally consistent. */
export function lint(repoRoot: string, document: ContractDocument): readonly string[] {
  const problems = [
    ...lintDuplicates(document.entries),
    ...document.entries.flatMap((entry) => lintOneEntry(repoRoot, entry)),
  ];
  return problems.sort();
}
