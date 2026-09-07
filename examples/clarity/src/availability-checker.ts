// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";
import type { DateRange, Room } from "./domain.js";

export interface AvailabilityChecker {
  findAvailableRooms(roomCategory: string, dateRange: DateRange): Room[];
}

export class DefaultAvailabilityChecker implements AvailabilityChecker {
  @traced("roomCategory", "dateRange")
  findAvailableRooms(roomCategory: string, _dateRange: DateRange): Room[] {
    return [
      { roomNumber: "301", category: roomCategory, pricePerNight: 189.0 },
      { roomNumber: "405", category: roomCategory, pricePerNight: 219.0 },
    ];
  }
}
