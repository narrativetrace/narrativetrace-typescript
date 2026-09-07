// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { buildTraceTree, extractClasses, scanSource } from "../clarity-scan-analyzer.js";

describe("extractClasses", () => {
  it("extracts a class with two methods and their parameter names", () => {
    const source = `class UserService {
  findById(id: string): User {
    return this.db.get(id);
  }

  deleteUser(userId: string, force: boolean): void {
    this.db.delete(userId);
  }
}`;
    const result = extractClasses(source, "user-service.ts");

    expect(result).toEqual([
      {
        className: "UserService",
        methods: [
          { name: "findById", parameters: ["id"] },
          { name: "deleteUser", parameters: ["userId", "force"] },
        ],
      },
    ]);
  });

  it("groups standalone functions under <module>", () => {
    const source = `export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.price, 0);
}

const formatCurrency = (amount: number, currency: string): string => {
  return currency + amount.toFixed(2);
};`;
    const result = extractClasses(source, "utils.ts");

    expect(result).toEqual([
      {
        className: "<module>",
        methods: [
          { name: "calculateTotal", parameters: ["items"] },
          { name: "formatCurrency", parameters: ["amount", "currency"] },
        ],
      },
    ]);
  });

  it("extracts interface declarations as classes", () => {
    const source = `interface OrderRepository {
  findOrder(orderId: string): Order;
  saveOrder(order: Order): void;
}`;
    const result = extractClasses(source, "repository.ts");

    expect(result).toEqual([
      {
        className: "OrderRepository",
        methods: [
          { name: "findOrder", parameters: ["orderId"] },
          { name: "saveOrder", parameters: ["order"] },
        ],
      },
    ]);
  });

  it("returns empty array for file with no classes or functions", () => {
    const source = `export type Config = {
  maxLines: number;
};

export const DEFAULT_TIMEOUT = 5000;`;
    const result = extractClasses(source, "config.ts");

    expect(result).toEqual([]);
  });

  it("skips constructors and anonymous callbacks", () => {
    const source = `class Service {
  constructor(private db: Database) {}

  process(items: string[]): void {
    items.forEach((item) => console.log(item));
  }
}`;
    const result = extractClasses(source, "service.ts");

    expect(result).toEqual([
      {
        className: "Service",
        methods: [{ name: "process", parameters: ["items"] }],
      },
    ]);
  });
});

describe("buildTraceTree", () => {
  it("produces a trace tree with correct node count and signatures", () => {
    const classes = [
      {
        className: "OrderService",
        methods: [
          { name: "createOrder", parameters: ["items", "userId"] },
          { name: "cancelOrder", parameters: ["orderId"] },
        ],
      },
    ];

    const tree = buildTraceTree(classes);

    expect(tree.isEmpty).toBe(false);
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[0].signature.className).toBe("OrderService");
    expect(tree.roots[0].signature.methodName).toBe("createOrder");
    expect(tree.roots[0].signature.parameters).toHaveLength(2);
    expect(tree.roots[0].signature.parameters[0].name).toBe("items");
    expect(tree.roots[1].signature.methodName).toBe("cancelOrder");
    expect(tree.roots[1].signature.parameters[0].name).toBe("orderId");
  });
});

describe("scanSource", () => {
  it("produces high scores for well-named code", () => {
    const source = `class OrderService {
  createOrder(items: string[], userId: string): Order {
    return new Order(items, userId);
  }

  cancelOrder(orderId: string): void {
    this.db.delete(orderId);
  }
}`;
    const results = scanSource(source, "order-service.ts");

    expect(results).toHaveLength(1);
    expect(results[0].className).toBe("OrderService");
    expect(results[0].result.overall).toBeGreaterThan(0.6);
  });

  it("produces low scores and issues for poorly-named code", () => {
    const source = `class Mgr {
  do(x: number, y: number): void {}
  proc(a: string): string { return a; }
}`;
    const results = scanSource(source, "mgr.ts");

    expect(results).toHaveLength(1);
    expect(results[0].result.overall).toBeLessThan(0.6);
    expect(results[0].result.issues.length).toBeGreaterThan(0);
  });

  it("returns separate results for multiple classes in one file", () => {
    const source = `class UserRepository {
  findUser(userId: string): User {
    return this.db.get(userId);
  }
}

class OrderRepository {
  findOrder(orderId: string): Order {
    return this.db.get(orderId);
  }
}`;
    const results = scanSource(source, "repositories.ts");

    expect(results).toHaveLength(2);
    expect(results[0].className).toBe("UserRepository");
    expect(results[1].className).toBe("OrderRepository");
  });

  it("includes getters and setters in extracted methods", () => {
    const source = `class ConfigStore {
  get maxRetries(): number {
    return this._maxRetries;
  }

  set maxRetries(value: number) {
    this._maxRetries = value;
  }
}`;
    const results = scanSource(source, "config-store.ts");

    expect(results).toHaveLength(1);
    expect(results[0].className).toBe("ConfigStore");
    // Both getter and setter should be extracted
    const classes = extractClasses(source, "config-store.ts");
    expect(classes[0].methods).toHaveLength(2);
    expect(classes[0].methods[0].name).toBe("maxRetries");
    expect(classes[0].methods[1].name).toBe("maxRetries");
    expect(classes[0].methods[1].parameters).toEqual(["value"]);
  });

  it("returns empty array for file with no extractable code", () => {
    const results = scanSource("const X = 42;", "constants.ts");

    expect(results).toEqual([]);
  });

  it("handles methods with zero parameters", () => {
    const source = `class Clock {
  getCurrentTime(): Date {
    return new Date();
  }
}`;
    const results = scanSource(source, "clock.ts");

    expect(results).toHaveLength(1);
    expect(results[0].className).toBe("Clock");
    expect(results[0].result.overall).toBeGreaterThan(0);
  });
});
