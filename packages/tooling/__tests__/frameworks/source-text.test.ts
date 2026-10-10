// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { withoutComments } from "../../src/frameworks/source-text.js";

describe("withoutComments", () => {
  test("drops a line comment and keeps the code before it", () => {
    expect(withoutComments("app.use(x); // app.use(narrativeTrace(ctx))")).toBe("app.use(x); ");
  });

  test("drops a whole commented-out line, keeping the line break", () => {
    expect(withoutComments("a();\n// b();\nc();")).toBe("a();\n\nc();");
  });

  test("drops a block comment spanning lines, keeping its line breaks", () => {
    expect(withoutComments("a(); /* b();\n c(); */ d();")).toBe("a(); \n d();");
  });

  test("drops an unterminated block comment to the end", () => {
    expect(withoutComments("a(); /* b();")).toBe("a(); ");
  });

  test.each([
    ['"http://example.com"'],
    ["'http://example.com'"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the input IS a template literal's source.
    ["`http://example.com/*${x}*/`"],
    ['"a /* not a comment */ b"'],
  ])("keeps comment-shaped text inside the string literal %s", (literal) => {
    expect(withoutComments(`f(${literal});`)).toBe(`f(${literal});`);
  });

  test("an escaped quote does not end a string", () => {
    const source = String.raw`f("say \"//\" twice"); // gone`;
    expect(withoutComments(source)).toBe(String.raw`f("say \"//\" twice"); `);
  });

  test("a single slash is division, not a comment", () => {
    expect(withoutComments("const half = total / 2;")).toBe("const half = total / 2;");
  });

  test("an empty text stays empty", () => {
    expect(withoutComments("")).toBe("");
  });
});

describe("withoutComments — boundaries", () => {
  test("a block comment's own opening slash is never part of its close", () => {
    expect(withoutComments("/*/ still a comment */code();")).toBe("code();");
  });

  test("a literal left open at the end of the text is kept whole", () => {
    expect(withoutComments('f("abc')).toBe('f("abc');
    expect(withoutComments("`abc")).toBe("`abc");
  });

  test("a literal closed by the last character is kept, and what follows a line comment is not", () => {
    expect(withoutComments('"a"')).toBe('"a"');
    expect(withoutComments('x // "unterminated\ny')).toBe("x \ny");
  });

  test("a comment at the very start of the text is still a comment", () => {
    expect(withoutComments("// first line\nsecond")).toBe("\nsecond");
  });
});
