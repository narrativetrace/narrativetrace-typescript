// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { renderCarrierCatalogueJson } from "../../src/render/catalogue-json.js";
import type { Skill } from "../../src/skill.js";

const DOCTOR: Skill = {
  canonicalName: "narrativetrace-doctor",
  skillClass: "mechanical",
  description: "Diagnoses a NarrativeTrace install.",
  fixture: "examples/sixty-seconds",
  allowedTools: ["pnpm"],
  steps: [],
  always: [],
  never: [],
};

const ADD_TRACING: Skill = {
  canonicalName: "add-narrative-tracing",
  skillClass: "guided",
  description: "Installs NarrativeTrace and gets it to a first trace.",
  fixture: "examples/sixty-seconds",
  allowedTools: ["pnpm", "npx"],
  steps: [],
  always: [],
  never: [],
};

describe("renderCarrierCatalogueJson", () => {
  it("names the runtime and carries no version literal (D2)", () => {
    const parsed = JSON.parse(renderCarrierCatalogueJson([DOCTOR]));
    expect(parsed.runtime).toBe("typescript");
    expect(renderCarrierCatalogueJson([DOCTOR])).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("lists each skill's name, description, and both platform paths", () => {
    const parsed = JSON.parse(renderCarrierCatalogueJson([DOCTOR]));
    expect(parsed.skills).toEqual([
      {
        name: "narrativetrace-doctor",
        description: "Diagnoses a NarrativeTrace install.",
        agents: "agents/narrativetrace-doctor/SKILL.md",
        claude: "claude/narrativetrace-doctor/SKILL.md",
      },
    ]);
  });

  it("names every skill exactly once, in the given order", () => {
    const parsed = JSON.parse(renderCarrierCatalogueJson([DOCTOR, ADD_TRACING]));
    expect(parsed.skills.map((entry: { name: string }) => entry.name)).toEqual([
      "narrativetrace-doctor",
      "add-narrative-tracing",
    ]);
  });

  it("is stable, indented JSON ending in exactly one trailing newline", () => {
    const rendered = renderCarrierCatalogueJson([DOCTOR]);
    expect(rendered.endsWith("}\n")).toBe(true);
    expect(rendered.endsWith("}\n\n")).toBe(false);
    expect(rendered).toBe(renderCarrierCatalogueJson([DOCTOR]));
  });
});
