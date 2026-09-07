// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Resource-level identity of the emitting service: name, version, and deployment environment.
 *
 * INTENT: the OTel resource attributes bundled into a {@link SpanContext}. All fields are optional
 * so partially-configured or library-internal traces still work; exporters map these to the
 * `resource` attribute tier.
 */
export interface ServiceIdentity {
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
}
