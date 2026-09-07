// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Book-lending domain of the plain-JavaScript example:
 * plain ESM, JSDoc types, no decorators, no TypeScript — the API as a JavaScript consumer sees it.
 *
 * @typedef {{ readonly isbn: string, readonly title: string, readonly author: string, readonly available: boolean }} Book
 * @typedef {{ readonly id: string, readonly name: string, readonly cardNumber: string }} Member
 * @typedef {{ readonly bookTitle: string, readonly memberName: string, readonly dueDate: string }} LoanReceipt
 */

export class BookNotFoundError extends Error {
  /** @param {string} isbn */
  constructor(isbn) {
    super(`Book not found: ${isbn}`);
    this.name = "BookNotFoundError";
  }
}

export class BookUnavailableError extends Error {
  /** @param {string} isbn */
  constructor(isbn) {
    super(`Book not available: ${isbn}`);
    this.name = "BookUnavailableError";
  }
}
