// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  BookNotFoundError,
  BookUnavailableError,
  DefaultLendingService,
  InMemoryCatalogService,
  InMemoryMemberService,
} from "../src/index.mjs";

const fixedToday = () => new Date("2026-03-01T12:00:00Z");

function lending() {
  return new DefaultLendingService(
    new InMemoryCatalogService(),
    new InMemoryMemberService(),
    fixedToday,
  );
}

test("a member borrows an available book and gets a receipt due in two weeks", () => {
  expect(lending().borrowBook("M-001", "978-0-13-468599-1")).toStrictEqual({
    bookTitle: "The Pragmatic Programmer",
    memberName: "Alice",
    dueDate: "2026-03-15",
  });
});

test("an unavailable book is refused before the member is looked up", () => {
  expect(() => lending().borrowBook("M-001", "978-0-13-235088-4")).toThrow(BookUnavailableError);
  expect(() => lending().borrowBook("M-001", "978-0-13-235088-4")).toThrow(
    "Book not available: 978-0-13-235088-4",
  );
});

test("an unknown ISBN and an unknown member each fail by name", () => {
  expect(() => lending().borrowBook("M-001", "978-1-23-456789-0")).toThrow(BookNotFoundError);
  expect(() => lending().borrowBook("M-999", "978-0-13-468599-1")).toThrow(
    "Member not found: M-999",
  );
});

test("the default clock is today", () => {
  const service = new DefaultLendingService(
    new InMemoryCatalogService(),
    new InMemoryMemberService(),
  );
  const receipt = service.borrowBook("M-002", "978-0-201-63361-0");
  expect(receipt.memberName).toBe("Bob");
  expect(receipt.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
