// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { analyzeFile } from "../analyze.js";

describe("analyzeFile", () => {
  it("extracts a function declaration with correct name, file, line, and line count", () => {
    const source = `function greet(name: string): string {
  const greeting = "Hello";
  return greeting + " " + name;
}`;
    const results = analyzeFile(source, "greet.ts");

    expect(results).toEqual([{ name: "greet", file: "greet.ts", line: 1, lines: 4 }]);
  });

  it("extracts a method declaration from a class", () => {
    const source = `class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    const result = a - b;
    return result;
  }
}`;
    const results = analyzeFile(source, "calc.ts");

    expect(results).toEqual([
      { name: "add", file: "calc.ts", line: 2, lines: 3 },
      { name: "subtract", file: "calc.ts", line: 6, lines: 4 },
    ]);
  });

  it("extracts a named arrow function assigned to const", () => {
    const source = `export const processItems = (items: string[]): string[] => {
  const filtered = items.filter(Boolean);
  const mapped = filtered.map(i => i.trim());
  return mapped;
};`;
    const results = analyzeFile(source, "process.ts");

    expect(results).toEqual([{ name: "processItems", file: "process.ts", line: 1, lines: 5 }]);
  });

  it("skips inline arrow callbacks not assigned to a variable", () => {
    const source = `function process(items: string[]) {
  return items
    .filter(x => x.length > 0)
    .map(x => x.trim())
    .reduce((acc, val) => {
      acc.push(val);
      return acc;
    }, [] as string[]);
}`;
    const results = analyzeFile(source, "inline.ts");

    expect(results).toEqual([{ name: "process", file: "inline.ts", line: 1, lines: 9 }]);
  });

  it("reports a single-line function as 1 line", () => {
    const source = "function identity(x: number) { return x; }";
    const results = analyzeFile(source, "identity.ts");

    expect(results).toEqual([{ name: "identity", file: "identity.ts", line: 1, lines: 1 }]);
  });

  it("returns empty array for file with no functions", () => {
    const source = `export interface Config {
  maxLines: number;
  top: number;
}

export type Result = { name: string };`;
    const results = analyzeFile(source, "types.ts");

    expect(results).toEqual([]);
  });

  it("extracts a function expression assigned to const", () => {
    const source = `const render = function(data: unknown): string {
  const json = JSON.stringify(data);
  return json;
};`;
    const results = analyzeFile(source, "render.ts");

    expect(results).toEqual([{ name: "render", file: "render.ts", line: 1, lines: 4 }]);
  });

  it("handles mixed function types in one file preserving source order", () => {
    const source = `function first() {
  return 1;
}

const second = () => {
  return 2;
};

class Foo {
  third() {
    return 3;
  }
}`;
    const results = analyzeFile(source, "mixed.ts");

    expect(results).toEqual([
      { name: "first", file: "mixed.ts", line: 1, lines: 3 },
      { name: "second", file: "mixed.ts", line: 5, lines: 3 },
      { name: "third", file: "mixed.ts", line: 10, lines: 3 },
    ]);
  });

  it("captures getters and setters", () => {
    const source = `class Store {
  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this._value = v;
    this.notify();
  }
}`;
    const results = analyzeFile(source, "store.ts");

    expect(results).toEqual([
      { name: "value", file: "store.ts", line: 2, lines: 3 },
      { name: "value", file: "store.ts", line: 6, lines: 4 },
    ]);
  });

  it("captures constructors", () => {
    const source = `class Service {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {
    this.logger.info("Service created");
    this.db.connect();
  }
}`;
    const results = analyzeFile(source, "service.ts");

    expect(results).toEqual([{ name: "constructor", file: "service.ts", line: 2, lines: 7 }]);
  });

  it("captures export default function with name", () => {
    const source = `export default function main() {
  console.log("hello");
  console.log("world");
}`;
    const results = analyzeFile(source, "main.ts");

    expect(results).toEqual([{ name: "main", file: "main.ts", line: 1, lines: 4 }]);
  });

  it("labels anonymous export default function as '<default>'", () => {
    const source = `export default function() {
  return 42;
}`;
    const results = analyzeFile(source, "anon.ts");

    expect(results).toEqual([{ name: "<default>", file: "anon.ts", line: 1, lines: 3 }]);
  });
});
