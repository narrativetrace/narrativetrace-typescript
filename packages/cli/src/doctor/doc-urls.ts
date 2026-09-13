// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Public doc anchors every finding points at. The TypeScript runtime's guides are not yet
 * published on narrativetrace.ai (only the Java docs are, as of 2026-09 — see the doctor P1 run's
 * report for the amendment note); this repository is public on GitHub
 * (`publishConfig.access: "public"` on every package), so a stable blob link into `documentation/`
 * on `main` is the honest "public docs URL" today. Swap the base once the TS guides land on the
 * site — the anchors (GitHub's own heading slugs) do not change.
 */
const BASE = "https://github.com/narrativetrace/narrativetrace-typescript/blob/main/documentation/";

export const DOC = {
  installationPrerequisites: `${BASE}installation-guide.md#prerequisites`,
  installationDependencies: `${BASE}installation-guide.md#1-add-dependencies`,
  vitestConfiguration: `${BASE}configuration-guide.md#2-vitest-configuration`,
  whereSettingsComeFrom: `${BASE}configuration-guide.md#2b-where-settings-come-from`,
  proxyOptions: `${BASE}configuration-guide.md#6-proxy-options`,
  eventPipelineBuffering: `${BASE}configuration-guide.md#8-event-pipeline-buffering-bufferedeventconsumer`,
  noTraceFilesWritten: `${BASE}troubleshooting.md#no-trace-files-are-written`,
  manualParameterNames: `${BASE}troubleshooting.md#parameters-show-as-arg0-arg1`,
  redactionSurfaceBySurface: `${BASE}privacy-and-redaction.md#redaction-surface-by-surface`,
  approvalTracesEndToEnd: `${BASE}structural-trace-format.md#approval-traces-end-to-end`,
  sixtySecondsNewProject: `${BASE}sixty-seconds.md#1-new-project-add-the-packages`,
} as const;
