// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { NARRATIVETRACE_DOCTOR } from "../../src/catalogue/narrativetrace-doctor.js";
import type { ProListing } from "../../src/pro-listing.js";
import {
  AGENTS_MD_BEGIN,
  AGENTS_MD_END,
  extractAgentsMdSection,
  renderAgentsMdSnippet,
  spliceAgentsMdSection,
} from "../../src/render/agents-md.js";

const LISTING: ProListing = {
  canonicalName: "narrativetrace-mcp",
  prompt: "ask for trace data as a tool call",
  delivers: "an MCP server",
  needs: "a Pro license",
  comesFrom: "the Java Pro line",
  status: "in development",
  featureGuideStatusText: "In development (Pro)",
};

describe("renderAgentsMdSnippet", () => {
  it("is wrapped in the delimiter markers", () => {
    const rendered = renderAgentsMdSnippet([NARRATIVETRACE_DOCTOR], []);
    expect(rendered.startsWith(AGENTS_MD_BEGIN)).toBe(true);
    expect(rendered.endsWith(AGENTS_MD_END)).toBe(true);
  });

  it("lists every skill by canonical name and description", () => {
    const rendered = renderAgentsMdSnippet([NARRATIVETRACE_DOCTOR], []);
    expect(rendered).toContain("`narrativetrace-doctor`");
    expect(rendered).toContain(NARRATIVETRACE_DOCTOR.description);
  });

  it("marks a Pro listing with its status, never a price", () => {
    const rendered = renderAgentsMdSnippet([], [LISTING]);
    expect(rendered).toContain("(Pro, in development)");
    expect(rendered).not.toMatch(/\$|price/i);
  });

  it("matches the known-good line-by-line rendering", () => {
    // Pins the heading text, the blank-line separators, the llms.txt pointer line, and the "\n"
    // join itself — a piecemeal .toContain() assertion can't tell a real newline-joined document
    // apart from one long line that merely contains the same substrings.
    expect(renderAgentsMdSnippet([NARRATIVETRACE_DOCTOR], [LISTING])).toMatchSnapshot();
  });
});

describe("spliceAgentsMdSection", () => {
  it("replaces an existing delimited section in place, leaving the rest untouched", () => {
    const content = `before\n${AGENTS_MD_BEGIN}\nold\n${AGENTS_MD_END}\nafter`;
    const result = spliceAgentsMdSection(content, `${AGENTS_MD_BEGIN}\nnew\n${AGENTS_MD_END}`);
    expect(result).toBe(`before\n${AGENTS_MD_BEGIN}\nnew\n${AGENTS_MD_END}\nafter`);
  });

  it("appends the section when no markers exist yet", () => {
    const result = spliceAgentsMdSection("existing content", "SECTION");
    expect(result).toBe("existing content\n\nSECTION\n");
  });

  it("appends when only the begin marker is present without a matching end marker", () => {
    const content = `before\n${AGENTS_MD_BEGIN}\nunterminated`;
    const result = spliceAgentsMdSection(content, "SECTION");
    expect(result).toBe(`${content.trimEnd()}\n\nSECTION\n`);
  });

  it("appends when only the end marker is present without a matching begin marker", () => {
    const content = `before\nunopened\n${AGENTS_MD_END}\nafter`;
    const result = spliceAgentsMdSection(content, "SECTION");
    expect(result).toBe(`${content.trimEnd()}\n\nSECTION\n`);
  });

  it("trims trailing whitespace, not leading whitespace, when appending", () => {
    const content = "  leading spaces kept\nexisting content   \n\n";
    const result = spliceAgentsMdSection(content, "SECTION");
    expect(result).toBe("  leading spaces kept\nexisting content\n\nSECTION\n");
  });
});

describe("extractAgentsMdSection", () => {
  it("returns just the delimited section, markers included, leaving the rest out", () => {
    const content = `private briefing\n${AGENTS_MD_BEGIN}\nshared section\n${AGENTS_MD_END}\nmore private text`;
    expect(extractAgentsMdSection(content)).toBe(
      `${AGENTS_MD_BEGIN}\nshared section\n${AGENTS_MD_END}`,
    );
  });

  it("returns undefined when either marker is missing", () => {
    expect(extractAgentsMdSection(`no markers here`)).toBeUndefined();
    expect(extractAgentsMdSection(`${AGENTS_MD_BEGIN}\nonly the start marker`)).toBeUndefined();
    expect(extractAgentsMdSection(`only the end marker\n${AGENTS_MD_END}`)).toBeUndefined();
  });

  it("round-trips with spliceAgentsMdSection's own delimited output", () => {
    const rendered = renderAgentsMdSnippet([NARRATIVETRACE_DOCTOR], [LISTING]);
    const content = spliceAgentsMdSection("private briefing", rendered);
    expect(extractAgentsMdSection(content)).toBe(rendered);
  });
});
