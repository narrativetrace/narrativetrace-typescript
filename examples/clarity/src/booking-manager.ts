// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";

/** Tier 2 — adequate naming: "handle" and "type"/"d1"/"d2" tell less than they could. */
export interface BookingManager {
  handleBooking(name: string, type: string, d1: string, d2: string): string;
}

export class DefaultBookingManager implements BookingManager {
  @traced("name", "type", "d1", "d2")
  handleBooking(name: string, type: string, d1: string, d2: string): string {
    return `Booking confirmed for ${name} (${type}) ${d1} to ${d2}`;
  }
}
