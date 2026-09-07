// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { hasNoun, isValidCollocation } from "../src/collocation-dictionary.js";

describe("CollocationDictionary", () => {
  test("recognizes valid business-domain collocations", () => {
    expect(isValidCollocation("place", "order")).toBe(true);
    expect(isValidCollocation("create", "order")).toBe(true);
    expect(isValidCollocation("cancel", "order")).toBe(true);
    expect(isValidCollocation("find", "customer")).toBe(true);
    expect(isValidCollocation("charge", "payment")).toBe(true);
  });

  test("rejects invalid verb-noun combinations", () => {
    expect(isValidCollocation("swim", "order")).toBe(false);
    expect(isValidCollocation("eat", "customer")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(isValidCollocation("Place", "Order")).toBe(true);
    expect(isValidCollocation("CREATE", "ORDER")).toBe(true);
  });

  test("returns false for unknown verb or noun", () => {
    expect(isValidCollocation("fly", "banana")).toBe(false);
  });

  describe("programming-domain collocations", () => {
    test("recognizes valid node collocations", () => {
      expect(isValidCollocation("render", "node")).toBe(true);
      expect(isValidCollocation("visit", "node")).toBe(true);
      expect(isValidCollocation("traverse", "node")).toBe(true);
    });

    test("recognizes valid tree collocations", () => {
      expect(isValidCollocation("build", "tree")).toBe(true);
      expect(isValidCollocation("traverse", "tree")).toBe(true);
      expect(isValidCollocation("prune", "tree")).toBe(true);
    });

    test("recognizes valid score collocations", () => {
      expect(isValidCollocation("compute", "score")).toBe(true);
      expect(isValidCollocation("normalize", "score")).toBe(true);
      expect(isValidCollocation("aggregate", "score")).toBe(true);
    });

    test("recognizes valid text and value collocations", () => {
      expect(isValidCollocation("tokenize", "text")).toBe(true);
      expect(isValidCollocation("render", "value")).toBe(true);
      expect(isValidCollocation("parse", "value")).toBe(true);
    });

    test("recognizes valid source and method collocations", () => {
      expect(isValidCollocation("scan", "source")).toBe(true);
      expect(isValidCollocation("analyze", "source")).toBe(true);
      expect(isValidCollocation("score", "method")).toBe(true);
      expect(isValidCollocation("extract", "method")).toBe(true);
    });

    test("recognizes valid context and state collocations", () => {
      expect(isValidCollocation("create", "context")).toBe(true);
      expect(isValidCollocation("restore", "context")).toBe(true);
      expect(isValidCollocation("reset", "state")).toBe(true);
      expect(isValidCollocation("initialize", "state")).toBe(true);
    });

    test("recognizes valid error and result collocations", () => {
      expect(isValidCollocation("handle", "error")).toBe(true);
      expect(isValidCollocation("wrap", "error")).toBe(true);
      expect(isValidCollocation("aggregate", "result")).toBe(true);
      expect(isValidCollocation("collect", "result")).toBe(true);
    });

    test("recognizes valid list, name, parameter, issue collocations", () => {
      expect(isValidCollocation("filter", "list")).toBe(true);
      expect(isValidCollocation("sort", "list")).toBe(true);
      expect(isValidCollocation("tokenize", "name")).toBe(true);
      expect(isValidCollocation("validate", "parameter")).toBe(true);
      expect(isValidCollocation("detect", "issue")).toBe(true);
    });

    test("rejects invalid verb for programming noun", () => {
      expect(isValidCollocation("swim", "node")).toBe(false);
      expect(isValidCollocation("eat", "score")).toBe(false);
    });

    test("recognizes class and object collocations", () => {
      expect(isValidCollocation("define", "class")).toBe(true);
      expect(isValidCollocation("instantiate", "class")).toBe(true);
      expect(isValidCollocation("serialize", "object")).toBe(true);
      expect(isValidCollocation("deserialize", "object")).toBe(true);
    });
  });

  describe("platform, observability, and ml collocations", () => {
    test("recognizes api and platform collocations", () => {
      expect(isValidCollocation("expose", "endpoint")).toBe(true);
      expect(isValidCollocation("deliver", "webhook")).toBe(true);
      expect(isValidCollocation("enqueue", "job")).toBe(true);
      expect(isValidCollocation("advance", "workflow")).toBe(true);
    });

    test("recognizes observability collocations", () => {
      expect(isValidCollocation("record", "metric")).toBe(true);
      expect(isValidCollocation("annotate", "trace")).toBe(true);
      expect(isValidCollocation("escalate", "incident")).toBe(true);
      expect(isValidCollocation("drilldown", "dashboard")).toBe(true);
    });

    test("recognizes ml and ai collocations", () => {
      expect(isValidCollocation("train", "model")).toBe(true);
      expect(isValidCollocation("generate", "embedding")).toBe(true);
      expect(isValidCollocation("compose", "prompt")).toBe(true);
      expect(isValidCollocation("materialize", "featurestore")).toBe(true);
    });

    test("recognizes quality and governance collocations", () => {
      expect(isValidCollocation("execute", "testcase")).toBe(true);
      expect(isValidCollocation("prepare", "fixture")).toBe(true);
      expect(isValidCollocation("measure", "coverage")).toBe(true);
      expect(isValidCollocation("capture", "auditlog")).toBe(true);
      expect(isValidCollocation("enforce", "policy")).toBe(true);
    });

    test("merges event collocations across maps", () => {
      expect(isValidCollocation("consume", "event")).toBe(true); // programming/events
      expect(isValidCollocation("fanout", "event")).toBe(true); // messaging/events
      expect(isValidCollocation("replay", "event")).toBe(true); // messaging/events
    });

    test("merges message collocations across maps", () => {
      expect(isValidCollocation("unsend", "message")).toBe(true); // social
      expect(isValidCollocation("dequeue", "message")).toBe(true); // messaging/events
      expect(isValidCollocation("deadletter", "message")).toBe(true); // messaging/events
    });

    test("merges policy collocations across domains", () => {
      expect(isValidCollocation("underwrite", "policy")).toBe(true); // insurance
      expect(isValidCollocation("enforce", "policy")).toBe(true); // governance
      expect(isValidCollocation("simulate", "policy")).toBe(true); // governance
    });
  });

  describe("hasNoun", () => {
    test("returns true for known domain nouns", () => {
      expect(hasNoun("order")).toBe(true);
      expect(hasNoun("customer")).toBe(true);
      expect(hasNoun("payment")).toBe(true);
      expect(hasNoun("node")).toBe(true);
      expect(hasNoun("score")).toBe(true);
      expect(hasNoun("method")).toBe(true);
      expect(hasNoun("endpoint")).toBe(true);
      expect(hasNoun("metric")).toBe(true);
      expect(hasNoun("model")).toBe(true);
    });

    test("returns false for unknown nouns", () => {
      expect(hasNoun("banana")).toBe(false);
      expect(hasNoun("widget")).toBe(false);
    });

    test("is case-insensitive", () => {
      expect(hasNoun("Order")).toBe(true);
      expect(hasNoun("ORDER")).toBe(true);
    });
  });
});
