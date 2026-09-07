// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BookUnavailableError } from "./model.mjs";

/** @typedef {import("./model.mjs").LoanReceipt} LoanReceipt */

const LOAN_DAYS = 14;

/**
 * @param {Date} today
 * @returns {string} ISO date `LOAN_DAYS` after `today`
 */
function dueDateFrom(today) {
  const due = new Date(today.getTime());
  due.setUTCDate(due.getUTCDate() + LOAN_DAYS);
  return due.toISOString().slice(0, 10);
}

export class DefaultLendingService {
  /**
   * @param {import("./catalog-service.mjs").InMemoryCatalogService} catalog
   * @param {import("./member-service.mjs").InMemoryMemberService} members
   * @param {() => Date} [today] clock, injectable so a demo run is reproducible
   */
  constructor(catalog, members, today = () => new Date()) {
    this.catalog = catalog;
    this.members = members;
    this.today = today;
  }

  /**
   * @param {string} memberId
   * @param {string} isbn
   * @returns {LoanReceipt}
   */
  borrowBook(memberId, isbn) {
    const book = this.catalog.findBook(isbn);
    if (!book.available) throw new BookUnavailableError(isbn);
    const member = this.members.lookupMember(memberId, "CARD-VERIFY");
    return { bookTitle: book.title, memberName: member.name, dueDate: dueDateFrom(this.today()) };
  }
}
