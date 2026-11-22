// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { CLAUDE_DIRECTORY, MARKETPLACE, OPENAI_DIRECTORY } from "../src/catalogue-index.js";

// The Anthropic directory's listing fields, beside the vendor-neutral listing they extend.
describe("CLAUDE_DIRECTORY", () => {
  it("draws from the same marketplace listing as every other registry", () => {
    expect(CLAUDE_DIRECTORY.base).toBe(MARKETPLACE);
  });

  it("uses the display name the OpenAI listing uses", () => {
    expect(CLAUDE_DIRECTORY.displayName).toBe("NarrativeTrace for TypeScript");
    expect(CLAUDE_DIRECTORY.displayName).toBe(OPENAI_DIRECTORY.displayName);
  });

  it("points support, privacy and documentation at their pages", () => {
    expect(CLAUDE_DIRECTORY.supportUrl).toBe(
      "https://github.com/narrativetrace/narrativetrace-typescript/issues",
    );
    expect(CLAUDE_DIRECTORY.privacyPolicyUrl).toBe("https://narrativetrace.ai/privacy");
    expect(CLAUDE_DIRECTORY.documentationUrl).toBe(
      "https://github.com/narrativetrace/narrativetrace-typescript/tree/main/documentation",
    );
  });
});
