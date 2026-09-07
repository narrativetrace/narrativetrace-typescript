// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** ANSI escapes for the launcher; every field is empty when colour is off. */
export interface Palette {
  readonly cyan: string;
  readonly green: string;
  readonly red: string;
  readonly yellow: string;
  readonly magenta: string;
  readonly dim: string;
  readonly reset: string;
}

const ANSI: Palette = Object.freeze({
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[1;31m",
  yellow: "\x1b[1;33m",
  magenta: "\x1b[1;35m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
});

const PLAIN: Palette = Object.freeze({
  cyan: "",
  green: "",
  red: "",
  yellow: "",
  magenta: "",
  dim: "",
  reset: "",
});

export const RULE = "────────────────────────────────────────────────────────────";

/**
 * Whether to emit colour: `NO_COLOR` (any non-empty value) always wins, `FORCE_COLOR` (non-empty,
 * not `0`) forces it for pipes and recordings, otherwise the terminal decides.
 */
export function colorMode(
  env: Readonly<Record<string, string | undefined>>,
  isTTY: boolean,
): boolean {
  if ((env.NO_COLOR ?? "") !== "") return false;
  const force = env.FORCE_COLOR ?? "";
  if (force !== "" && force !== "0") return true;
  return isTTY;
}

export function palette(enabled: boolean): Palette {
  return enabled ? ANSI : PLAIN;
}

/** Per-stream state: the live-line nesting depth and whether the renderers note was shown. */
export interface StreamState {
  depth: number;
  renderersExplained: boolean;
}

/** How renderings are chosen — said once per run, at the first rendering section. */
export const RENDERERS_NOTE =
  "Renderers are not configured: there is no default, no registry, no setting. Capture produces\n" +
  "a TraceTree and you call the renderer you want — here that is one line,\n" +
  "renderIndentedText(tree); renderProse, renderMarkdown and the diagram renderers below are the\n" +
  "same deal. A renderer is a function (tree) => string, so your own is a one-liner.\n" +
  "The live → ← !! lines are not a renderer at all: that is an EventConsumer on the inline path\n" +
  "of the DualPathPipeline, formatting each event as it happens — the only view you get without\n" +
  "writing any rendering code, and what your log tool ingests (see --classic).\n" +
  "Configuration picks a renderer in exactly one place, trace files written from tests:\n" +
  "NARRATIVETRACE_OUTPUT=true with NARRATIVETRACE_FORMAT=md|mmd|json|puml (md is the default).";

const SECTIONS: Readonly<Record<string, string>> = {
  "Trace tree":
    "Trace tree — renderIndentedText over the SAME trace as the stream above: structure, values, timings",
  Prose: "Prose — renderProse, same trace as English sentences; your names become the story",
  Mermaid: "Mermaid — renderMermaidSequence, markup to paste into mermaid.live",
  PlantUML: "PlantUML — renderPlantUmlSequence, markup for plantuml.com or the PlantUML CLI",
};

/** The launcher's richer marker for a known `--- section ---`, or `undefined` for other markers. */
export function describeSection(name: string): string | undefined {
  return SECTIONS[name];
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function styleSection(name: string, state: StreamState, p: Palette): string {
  const described = describeSection(name);
  if (described === undefined) return `${p.magenta}--- ${name} ---${p.reset}`;
  const marker = `${p.magenta}--- ${described} ---${p.reset}`;
  if (state.renderersExplained) return marker;
  state.renderersExplained = true;
  return `${marker}\n${dimBlock(RENDERERS_NOTE, p)}`;
}

/** A multi-line note, every line dimmed and indented four spaces. */
export function dimBlock(text: string, p: Palette): string {
  return text
    .split("\n")
    .map((line) => `${p.dim}    ${line}${p.reset}`)
    .join("\n");
}

/**
 * Styles one line of demo output by its shape: `→` entries nest by depth, `←`/`!!` unwind it,
 * `=== … ===` headers reset it, `--- … ---` markers are described. Other lines pass through.
 */
export function styleLine(line: string, state: StreamState, p: Palette): string {
  if (/^=== .* ===$/.test(line)) {
    state.depth = 0;
    return `${p.yellow}${line}${p.reset}`;
  }
  const section = /^--- (.*) ---$/.exec(line);
  if (section) return styleSection(section[1] ?? "", state, p);
  if (line.startsWith("→ ")) return `${indent(state.depth++)}${p.cyan}${line}${p.reset}`;
  if (line.startsWith("← ") || line.startsWith("!! ")) {
    state.depth = Math.max(0, state.depth - 1);
    const colour = line.startsWith("← ") ? p.green : p.red;
    return `${indent(state.depth)}${colour}${line}${p.reset}`;
  }
  return line;
}

export function legend(p: Palette): string {
  return [
    "",
    `${p.dim}One recording, many views — every section below is the SAME captured trace, re-rendered:${p.reset}`,
    "",
    `  ${p.cyan}→ method entered${p.reset}   ${p.green}← returned${p.reset}   ${p.red}!! exception${p.reset}   live, as the code runs; indent = call depth`,
    "",
    "  tree     structure, values, and timings; ✗ lines carry the @onError narration",
    "",
    "  prose    the trace as English sentences — derived from your class and method names",
    "",
    "  diagram  Mermaid markup, plus PlantUML markup where the example prints it",
    "",
    `${p.dim}Each scenario opens with how its trace is configured. No logging code was written for any of it.${p.reset}`,
    "",
  ].join("\n");
}
