// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";
import type { AvailabilityChecker } from "./availability-checker.js";
import type { Reservation, Room } from "./domain.js";
import type { PaymentGateway } from "./payment-gateway.js";

/** Tier 1 — excellent, domain-specific naming: every name says what the hotel does. */
export interface ReservationService {
  confirmReservation(
    guestId: string,
    roomCategory: string,
    checkInDate: string,
    checkOutDate: string,
  ): Reservation;
}

function firstAvailable(rooms: readonly Room[], roomCategory: string): Room {
  const room = rooms[0];
  if (room === undefined) throw new Error(`No ${roomCategory} room available`);
  return room;
}

export class DefaultReservationService implements ReservationService {
  private reservationCounter = 0;

  constructor(
    private readonly availabilityChecker: AvailabilityChecker,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  @traced("guestId", "roomCategory", "checkInDate", "checkOutDate")
  confirmReservation(
    guestId: string,
    roomCategory: string,
    checkInDate: string,
    checkOutDate: string,
  ): Reservation {
    const dateRange = { start: checkInDate, end: checkOutDate };
    const rooms = this.availabilityChecker.findAvailableRooms(roomCategory, dateRange);
    const room = firstAvailable(rooms, roomCategory);
    const reservationId = this.nextReservationId();
    this.paymentGateway.authorizePayment(reservationId, room.pricePerNight);
    return {
      reservationId,
      guestId,
      roomNumber: room.roomNumber,
      checkIn: checkInDate,
      checkOut: checkOutDate,
    };
  }

  private nextReservationId(): string {
    this.reservationCounter++;
    return `RES-${String(this.reservationCounter).padStart(4, "0")}`;
  }
}
