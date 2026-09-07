// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { hasInTreeHeader, stripInTreeHeader } from "../license-header-analyzer.js";

const APACHE_BLOCK = [
  "// Copyright 2026 Empower Agile",
  "//",
  '// Licensed under the Apache License, Version 2.0 (the "License");',
  "// you may not use this file except in compliance with the License.",
  "// limitations under the License.",
].join("\n");

const SPDX_STAMP = [
  "// SPDX-License-Identifier: BUSL-1.1",
  "// Copyright (c) 2026 Empower Agile",
].join("\n");

const BODY = "export const answer = 42;\n\nexport function ask(): number {\n  return answer;\n}\n";

describe("hasInTreeHeader", () => {
  it("finds the Apache boilerplate at the top of a file", () => {
    expect(hasInTreeHeader(`${APACHE_BLOCK}\n\n${BODY}`)).toBe(true);
  });

  it("finds an SPDX stamp at the top of a file", () => {
    expect(hasInTreeHeader(`${SPDX_STAMP}\n\n${BODY}`)).toBe(true);
  });

  it("finds a header that follows a shebang", () => {
    expect(hasInTreeHeader(`#!/usr/bin/env node\n${APACHE_BLOCK}\n\n${BODY}`)).toBe(true);
  });

  it("finds a header written as a block comment", () => {
    expect(hasInTreeHeader(`/*\n * SPDX-License-Identifier: Apache-2.0\n */\n\n${BODY}`)).toBe(
      true,
    );
  });

  it("ignores a file that opens with code", () => {
    expect(hasInTreeHeader(BODY)).toBe(false);
  });

  it("ignores an ordinary leading comment", () => {
    expect(hasInTreeHeader(`// A helper that answers.\n${BODY}`)).toBe(false);
  });

  it("ignores a module doc comment", () => {
    expect(hasInTreeHeader(`/** Answers questions. */\n${BODY}`)).toBe(false);
  });

  it("ignores license text quoted further down the file", () => {
    expect(hasInTreeHeader(`${BODY}\nconst H = "// Copyright 2026 Empower Agile";\n`)).toBe(false);
  });

  it("ignores an empty file", () => {
    expect(hasInTreeHeader("")).toBe(false);
  });

  it("ignores a file that is only a shebang", () => {
    expect(hasInTreeHeader("#!/usr/bin/env node\n")).toBe(false);
  });
});

describe("stripInTreeHeader", () => {
  it("removes the header and the blank line that separates it from the code", () => {
    expect(stripInTreeHeader(`${APACHE_BLOCK}\n\n${BODY}`)).toBe(BODY);
  });

  it("removes a header that is not followed by a blank line", () => {
    expect(stripInTreeHeader(`${APACHE_BLOCK}\n${BODY}`)).toBe(BODY);
  });

  it("removes a block-comment header", () => {
    expect(stripInTreeHeader(`/*\n * SPDX-License-Identifier: Apache-2.0\n */\n\n${BODY}`)).toBe(
      BODY,
    );
  });

  it("keeps the shebang", () => {
    expect(stripInTreeHeader(`#!/usr/bin/env node\n${APACHE_BLOCK}\n\n${BODY}`)).toBe(
      `#!/usr/bin/env node\n${BODY}`,
    );
  });

  it("removes only one blank line, so a deliberate gap survives", () => {
    expect(stripInTreeHeader(`${APACHE_BLOCK}\n\n\n${BODY}`)).toBe(`\n${BODY}`);
  });

  it("is idempotent", () => {
    const once = stripInTreeHeader(`${APACHE_BLOCK}\n\n${BODY}`);
    expect(stripInTreeHeader(once)).toBe(once);
  });

  it("leaves a file without a header untouched", () => {
    expect(stripInTreeHeader(`// A helper that answers.\n${BODY}`)).toBe(
      `// A helper that answers.\n${BODY}`,
    );
  });

  it("leaves an empty file untouched", () => {
    expect(stripInTreeHeader("")).toBe("");
  });
});
