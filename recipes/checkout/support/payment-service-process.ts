// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/payment-service-process.ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type AsyncNarrativeContext,
  parseTraceparent,
  type TraceTree,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { CardPaymentService, PaymentDeclinedError, type PaymentService } from "../src/payments.js";
import { serviceContextLoggingTo } from "./service-log.js";

const OK = 200;
const PAYMENT_REQUIRED = 402;

/** What the payment service saw and recorded for the last request it served. */
export interface ServedRequest {
  readonly traceparent: string | undefined;
  readonly trace: TraceTree;
}

/**
 * The payment service, as a second traced service on a loopback port: a real socket, so the
 * `traceparent` the checkout sends really arrives as a request header.
 *
 * INTENT: the inbound half of cross-service correlation by hand — read the header, run the request
 * inside a scope that continues that trace, capture, done. `@narrativetrace/hono` and
 * `@narrativetrace/express` do exactly this per request; a checkout project that runs without a
 * framework reads the header itself, which is also the honest picture of what those do.
 *
 * @llmNote The service has a context of its own, never the caller's: it is another service. Its
 * log lines join the caller's file under `service.name` `payment-service`.
 */
export class PaymentServiceProcess {
  private readonly context: AsyncNarrativeContext;
  private readonly payments: PaymentService;
  private readonly server: Server = createServer((req, res) => void this.handle(req, res));
  private served: ServedRequest | undefined;

  constructor(logFile: string) {
    // snippet:begin own-context
    this.context = serviceContextLoggingTo(logFile, {
      serviceName: "payment-service",
      fresh: false,
    });
    this.payments = traceObject(
      new CardPaymentService(),
      this.context,
      { charge: ["customerId", "amountCents", "card"] },
      { className: "PaymentService" },
    );
    // snippet:end own-context
  }

  /** Starts listening on a free loopback port and resolves to the URL a client posts to. */
  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/charge`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** The last request served: the header it carried and the trace its own context recorded. */
  lastServed(): ServedRequest {
    if (this.served === undefined) throw new Error("no request has been served yet");
    return this.served;
  }

  // snippet:begin inbound
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const traceparent = req.headers.traceparent as string | undefined;
    const body = await readBody(req);
    await this.context.run(async () => {
      try {
        const [customerId, amountCents, card] = body.split(",") as [string, string, string];
        respond(res, OK, this.payments.charge(customerId, Number(amountCents), card));
      } catch (error) {
        if (!(error instanceof PaymentDeclinedError)) throw error;
        respond(res, PAYMENT_REQUIRED, error.message);
      } finally {
        this.served = { traceparent, trace: this.context.captureTrace() };
        this.context.reset();
      }
    }, parseTraceparent(traceparent));
  }
  // snippet:end inbound
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function respond(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain" }).end(body);
}
