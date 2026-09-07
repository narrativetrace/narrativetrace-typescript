// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** @typedef {import("./model.mjs").Member} Member */

/** @type {ReadonlyMap<string, Member>} */
const MEMBERS = new Map([
  ["M-001", { id: "M-001", name: "Alice", cardNumber: "4111-XXXX-XXXX-1234" }],
  ["M-002", { id: "M-002", name: "Bob", cardNumber: "5500-XXXX-XXXX-5678" }],
]);

export class InMemoryMemberService {
  /**
   * @param {string} memberId
   * @param {string} cardNumber verified but never traced — see the `paramNames`/redaction wiring
   * @returns {Member}
   */
  lookupMember(memberId, cardNumber) {
    const member = MEMBERS.get(memberId);
    if (member === undefined) throw new Error(`Member not found: ${memberId}`);
    void cardNumber;
    return member;
  }
}
