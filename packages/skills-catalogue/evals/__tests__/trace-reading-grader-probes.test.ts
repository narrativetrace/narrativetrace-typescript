// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { divergingIds, editsSource, shapeOf } from "../narrativetrace-debug/grade-the-debug.mjs";
import { callAndId, hasNarrativeLine, promotes, prose } from "../trace-transcript.mjs";

/**
 * The debug and verify graders' pure evidence rules, probed one input at a time — Java's
 * `check_grade_the_debug.py` ported (cross-port item 5), with this runtime's paths: production
 * source is `src/`, tests are `test/`, and a narrative call line is Markdown's
 * `` - `Type.method(…)` … #id `` or the indented tree's `├── Type.method(…) … #id`.
 */

const SRC = "src/rate-table-converter.js";
const bash = (command: string) => ({
  index: 0,
  turn: 1,
  kind: "tool",
  payload: { name: "Bash", input: { command } },
});
const tool = (name: string, input: unknown) => ({
  index: 0,
  turn: 1,
  kind: "tool",
  payload: { name, input },
});
const result = (text: string) => ({ index: 0, turn: 1, kind: "result", payload: text });
const writes = (command: string) => editsSource(bash(command));

describe("a shell command that only READS src/ is not the fix", () => {
  it.each([
    [`sed -n '1,20p' ${SRC} 2>&1`],
    [`cat ${SRC} > /tmp/copy.js`],
    [`cat ${SRC} >/dev/null 2>&1`],
    [`cp ${SRC} /tmp/backup.js`],
    [`cp -n ${SRC} /tmp/a.js 2>&1`],
    [`grep -n 'a>b' ${SRC}`],
    [`grep -n "->" ${SRC}`],
    [`ls > /tmp/list.txt && cat ${SRC}`],
    ["find src -name '*.js' > /tmp/files.txt"],
    [`diff ${SRC} /tmp/B.js > /tmp/d.txt`],
    [`echo "see ${SRC}" > notes.txt`],
    [`cat ${SRC} | tee /tmp/copy.txt`],
    [`cat ${SRC}; echo done > /tmp/x`],
    ["echo x > srcx/converter.js"],
    ["sed -i 's#src/#gen/#' vitest.config.js"],
    ["grep -rn tee src/"],
    [`grep -n mv ${SRC}`],
    ['grep -rn "cp" src/'],
    [`npx vitest run test/ticket.test.js > /tmp/out.txt 2>&1`],
  ])("%s", (command) => {
    expect(writes(command)).toBe(false);
  });
});

describe("a shell command that WRITES src/ is the fix", () => {
  it.each([
    [`sed -i.bak 's/a/b/' ${SRC}`],
    [`sed --in-place 's/a/b/' ${SRC}`],
    [`sed -i 's/a/b/' "${SRC}"`],
    [`sed -i 's/a/b/' '${SRC}'`],
    [`sed -E -i 's/a/b/' ${SRC}`],
    [`cat <<EOF > ${SRC}\nexport class X {}\nEOF`],
    [`cat <<'EOF' >"${SRC}"\nexport class X {}\nEOF`],
    [`printf 'x' >> ${SRC}`],
    [`printf 'x'>>${SRC}`],
    [`echo x | tee -a ${SRC}`],
    [`echo x | tee ${SRC}`],
    [`perl -pi -e 's/a/b/' ${SRC}`],
    [`cp /tmp/Fixed.js ${SRC}`],
    [`mv /tmp/Fixed.js ${SRC}`],
    [`cp /tmp/Fixed.js '${SRC}'`],
    [`cp /tmp/Fixed.js ${SRC} 2>&1`],
    ["cd src && sed -i 's/a/b/' rate-table-converter.js"],
    [`git checkout -- ${SRC}`],
    [`git restore ${SRC}`],
    [`node -e "require('fs').writeFileSync('${SRC}', 'x')"`],
  ])("%s", (command) => {
    expect(writes(command)).toBe(true);
  });
});

describe("tool calls", () => {
  it("Edit, MultiEdit and Write on src/ are the fix, absolute or relative", () => {
    expect(editsSource(tool("Edit", { file_path: `/w/${SRC}` }))).toBe(true);
    expect(editsSource(tool("MultiEdit", { file_path: SRC }))).toBe(true);
    expect(editsSource(tool("Write", { file_path: "/w/test/../src/x.js", content: "x" }))).toBe(
      true,
    );
  });

  it("a read, a near-miss sibling, an empty Bash and a result are not", () => {
    expect(editsSource(tool("Read", { file_path: `/w/${SRC}` }))).toBe(false);
    expect(editsSource(tool("Edit", { file_path: "/w/srcx/x.js" }))).toBe(false);
    expect(editsSource(tool("Write", { file_path: "/w/test/ticket.test.js" }))).toBe(false);
    expect(editsSource(tool("Bash", {}))).toBe(false);
    expect(
      editsSource({ index: 0, turn: 1, kind: "tool", payload: { name: "Bash", input: null } }),
    ).toBe(false);
    expect(editsSource(result(`sed -i x ${SRC}`))).toBe(false);
  });
});

describe("divergingIds — the ids the agent was SHOWN for the diverging call", () => {
  it("a structural line names its own span", () => {
    expect(
      divergingIds([result("  #1.3 - RateTableConverter.convert(amountCents, from, to) → value")]),
    ).toEqual(new Set(["#1.3"]));
  });

  it("a Markdown narrative line names its trailing span", () => {
    const line =
      '  - `RateTableConverter.convert(amountCents: 4599, from: "EUR", to: "CHF")` → `4300` — 0.2ms #1.3';
    expect(divergingIds([result(line)])).toEqual(new Set(["#1.3"]));
  });

  it("an indented-text line names its trailing span", () => {
    expect(
      divergingIds([result("├── RateTableConverter.convert(amountCents: 4599) → 4300 #1.3")]),
    ).toEqual(new Set(["#1.3"]));
  });

  it.each([
    [
      "agent text is not evidence it was shown",
      { index: 0, turn: 1, kind: "text", payload: "#1.3 - RateTableConverter.convert(" },
    ],
    ["a call line with no span id", result("RateTableConverter.convert(amountCents: 1)")],
    ["convertAll is another call", result("#1.5 - RateTableConverter.convertAll(amountCents)")],
    [
      "a longer class name is another class",
      result("#1.5 - MyRateTableConverter.convert(amountCents)"),
    ],
    [
      "a parent quoting the call in a value",
      result('  - `Checkout.run(note: "RateTableConverter.convert")` → `ok` #1.2'),
    ],
  ])("%s names nothing", (_label, event) => {
    expect(divergingIds([event])).toEqual(new Set());
  });

  it("an id inside a value is not the span's id", () => {
    const line = '  - `RateTableConverter.convert(note: "see #9")` → `4300` #1.3';
    expect(divergingIds([result(line)])).toEqual(new Set(["#1.3"]));
  });
});

describe("prose — the agent's claims, without the trace lines it quoted", () => {
  it.each([
    ["a numbered structural line", "    12\t#1.3 - A.b(x)"],
    ["a structural line numbered with an arrow", "    12→#1.3 - A.b(x)"],
    [
      "a Markdown narrative line",
      "- `RateTableConverter.convert(amountCents: 4599)` → `4300` #1.3",
    ],
    ["an indented-text line", "│   ├── RateTableConverter.convert(amountCents: 4599) → 4300 #1.3"],
  ])("%s is a quote, not a claim", (_label, line) => {
    expect(prose(line)).not.toContain("#1.3");
  });

  it("a plain sentence keeps its citation, and a mixed reply drops only the quote", () => {
    expect(prose("The rounding happens at #1.3.")).toContain("#1.3");
    const kept = prose(
      "The rounding happens at #1.3.\n    12\t#1.3 - A.b(x)\nand #1.3 is the cause",
    );
    expect(kept.match(/#1\.3/g)).toHaveLength(2);
  });

  it("a claim that quotes a call mid-sentence keeps its citation", () => {
    expect(
      prose("Root cause at #1.3, where 4599 became 4300 near ├── RateTableConverter.convert("),
    ).toContain("#1.3");
  });
});

describe("shapeOf — a narrative line's call shape, values set aside", () => {
  it.each([
    ['- `Order.place(id: 42, note: "ok")` → `"done"` #1.3', "#1.3 Order.place(id, note)"],
    ['- `Order.place(id: "f(x)", note: "ok")` → `"done"` #1.3', "#1.3 Order.place(id, note)"],
    ['- `Order.place(ref: "#2", id: 42)` → `"done"` #1.3', "#1.3 Order.place(ref, id)"],
    ["  - `Svc.op()` #2.1", "#2.1 Svc.op()"],
  ])("%s", (line, shape) => {
    expect(shapeOf(line)).toBe(shape);
  });

  it("is null for a line that is not a call", () => {
    expect(shapeOf("**Scenario:** checkout")).toBeNull();
  });
});

describe("the shared reader's evidence rules", () => {
  it("a structural line alone is not a narrative line", () => {
    expect(hasNarrativeLine("#1 - A.b(x) → value")).toBe(false);
    expect(hasNarrativeLine("- `A.b(x: 1)` #1")).toBe(true);
  });

  it("a structural line's call comes from its own position", () => {
    expect(callAndId("#1.2 - Checkout.run(note) → value")).toEqual(["Checkout.run", "#1.2"]);
  });

  it.each([
    [tool("Bash", { command: "npx narrativetrace-approve" }), true],
    [tool("Bash", { command: "pnpm run approve-narratives" }), true],
    [tool("Bash", { command: "cp a.received.nt narratives/x.approved.nt" }), true],
    [tool("Write", { file_path: "narratives/x.approved.nt" }), true],
    [tool("Bash", { command: "cat narratives/x.approved.nt" }), false],
    [tool("Read", { file_path: "narratives/x.approved.nt" }), false],
  ])("promotes(%j) is %s", (event, expected) => {
    expect(promotes(event)).toBe(expected);
  });
});
