// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BookNotFoundError } from "./model.mjs";

/** @typedef {import("./model.mjs").Book} Book */

/** @type {ReadonlyMap<string, Book>} */
const BOOKS = new Map([
  [
    "978-0-13-468599-1",
    {
      isbn: "978-0-13-468599-1",
      title: "The Pragmatic Programmer",
      author: "David Thomas & Andrew Hunt",
      available: true,
    },
  ],
  [
    "978-0-201-63361-0",
    {
      isbn: "978-0-201-63361-0",
      title: "Design Patterns",
      author: "Gang of Four",
      available: true,
    },
  ],
  [
    "978-0-13-235088-4",
    {
      isbn: "978-0-13-235088-4",
      title: "Clean Code",
      author: "Robert C. Martin",
      available: false,
    },
  ],
]);

export class InMemoryCatalogService {
  /**
   * @param {string} isbn
   * @returns {Book}
   */
  findBook(isbn) {
    const book = BOOKS.get(isbn);
    if (book === undefined) throw new BookNotFoundError(isbn);
    return book;
  }
}
