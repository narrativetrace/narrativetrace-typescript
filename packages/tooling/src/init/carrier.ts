// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { readJsonFile, resolvePackageDirectory } from "../package-resolution.js";
import { readSkillCatalogue } from "./catalogue-reader.js";
import { isDirectory, readTextFile } from "./files.js";
import {
  pathFor,
  SKILL_FLAVOURS,
  type SkillCatalogue,
  type SkillEntry,
  type SkillFlavour,
} from "./skill-catalogue.js";

/**
 * An opened skills carrier: the catalogue, every flavour's rendered page, and the coordinate that
 * stamps whatever gets installed from it.
 *
 * INTENT: the installer's read side. A carrier is opened once, validated whole, and then behaves as
 * a value — every page is in memory, so nothing downstream holds a file handle or can see a carrier
 * change under it mid-install.
 *
 * @llmNote A carrier whose catalogue is malformed, whose catalogue lists a page the carrier does not
 * have, or whose catalogue names a skill twice is REFUSED here, with a message naming the entry. That
 * is deliberate: validation happens before any plan exists, so a broken carrier can never
 * half-install.
 *
 * @llmNote Three homes, all local, none of them a network call: a directory given with `--from`, the
 * `@narrativetrace/skills` package the PROJECT resolves, and the copy bundled in the running CLI
 * (D1/D4 as ruled). The npm cache has no layout stable enough to read, so a coordinate is never
 * looked up — `--from` takes a path.
 *
 * @sideEffects Reads the given directory once at open time. Never writes, never resolves anything
 * over a network.
 *
 * @example
 * ```ts
 * const carrier = resolveCarrier({ projectDirectory: process.cwd() });
 * const page = carrierBody(carrier, carrier.catalogue.skills[0], "agents");
 * ```
 */

/**
 * The package name every coordinate this installer stamps is built from.
 *
 * @llmNote D6 as ruled: the marker coordinate is the SKILLS package's, whichever home the bytes came
 * from. The CLI bundles a byte-identical copy of the same pages and is published from the same commit
 * at the same version, so reading its manifest still yields the release the pages belong to — and a
 * project's installed stamp then means the same thing whether `init` ran from the bundled copy or the
 * resolved package. The doctor compares the VERSION for exactly this reason (D9).
 */
export const CARRIER_COORDINATE_NAME = "@narrativetrace/skills";

/** The carrier's index file, at the carrier root. */
export const CATALOGUE_FILE = "catalogue.json";

/** Where a package that is not itself the carrier keeps one — the CLI's bundled copy. */
const BUNDLED_SUBDIRECTORY = "skills";

/** The version part of a coordinate that names no version — honest, and visibly stale. */
const UNKNOWN_VERSION = "unknown";

/** Which of the three homes a carrier came from. */
export type CarrierHome = "from" | "project" | "bundled";

/** An opened, validated carrier. */
export interface Carrier {
  /** The coordinate everything installed from this carrier is stamped with. */
  readonly coordinate: string;
  /** The carrier's index, already validated. */
  readonly catalogue: SkillCatalogue;
  /** The carrier root the pages were read from, for a message that has to name it. */
  readonly root: string;
  /** Which home answered; `"from"` unless {@link resolveCarrier} decided otherwise. */
  readonly source: CarrierHome;
  /** Every listed page, keyed by its carrier-relative path. Read once; never re-read. */
  readonly pages: ReadonlyMap<string, string>;
}

/**
 * The text at a carrier-relative path, or `undefined` when the carrier has no such entry. A page that
 * is not valid UTF-8 is refused by {@link readTextFile}, naming the file, rather than installed with
 * replacement characters where its text used to be.
 */
function pageAt(root: string, relativePath: string): string | undefined {
  return readTextFile(join(root, relativePath));
}

/** Where a carrier's pages are, and the index text that proved they are there. */
interface CarrierLayout {
  readonly root: string;
  readonly catalogueJson: string;
}

/**
 * The carrier inside a package directory: the package root itself, or its `skills/`.
 *
 * @llmNote Returns the catalogue TEXT along with the root, so the file that decides which layout
 * this is, is the same read the catalogue is parsed from — one read, and no "the file was there a
 * moment ago" branch that no test could reach.
 */
function carrierLayoutIn(directory: string): CarrierLayout | undefined {
  for (const root of [directory, join(directory, BUNDLED_SUBDIRECTORY)]) {
    const catalogueJson = pageAt(root, CATALOGUE_FILE);
    if (catalogueJson !== undefined) return { root, catalogueJson };
  }
  return undefined;
}

/**
 * The version a carrier stamps with, validated.
 *
 * INTENT: this string is written into every page the carrier installs and read back by the doctor,
 * so a version carrying the coordinate separator, a path segment or whitespace is refused before any
 * page is written rather than after.
 */
function versionIn(directory: string): string {
  const version = readJsonFile(join(directory, "package.json"))?.version?.trim();
  if (version === undefined || version === "") return UNKNOWN_VERSION;
  if (/[@/\\\s]/.test(version) || version === "..") {
    throw new TypeError(
      `a carrier is stamped with its own coordinate, and the version "${version}" cannot be one —` +
        ' it must carry no "@", no path separator and no whitespace',
    );
  }
  return version;
}

function catalogueOf(json: string, coordinate: string): SkillCatalogue {
  try {
    return readSkillCatalogue(json);
  } catch (cause) {
    throw new TypeError(
      `the carrier ${coordinate}'s ${CATALOGUE_FILE} is unusable: ${(cause as Error).message}`,
    );
  }
}

function pagesOf(root: string, coordinate: string, catalogue: SkillCatalogue): Map<string, string> {
  const pages = new Map<string, string>();
  for (const skill of catalogue.skills) {
    for (const flavour of SKILL_FLAVOURS) {
      const path = pathFor(skill, flavour);
      const page = pageAt(root, path);
      if (page === undefined) {
        throw new TypeError(
          `the carrier ${coordinate} lists ${skill.name} at ${path}, which it does not carry`,
        );
      }
      pages.set(path, page);
    }
  }
  return pages;
}

/**
 * Opens the carrier inside a package directory — the package root itself when it holds the
 * catalogue, else its `skills/` subdirectory.
 *
 * @param directory the package directory, whose own `package.json` supplies the stamped version
 * @throws {TypeError} when the directory does not exist, carries no catalogue, or carries a catalogue
 * that does not describe what is there.
 */
export function openCarrier(directory: string, source: CarrierHome = "from"): Carrier {
  if (!isDirectory(directory)) throw new TypeError(`no carrier at ${directory}`);
  const layout = carrierLayoutIn(directory);
  if (layout === undefined) {
    throw new TypeError(
      `no ${CATALOGUE_FILE} in ${directory} — looked there and in ${BUNDLED_SUBDIRECTORY}/`,
    );
  }
  const coordinate = `${CARRIER_COORDINATE_NAME}@${versionIn(directory)}`;
  const catalogue = catalogueOf(layout.catalogueJson, coordinate);
  return Object.freeze({
    coordinate,
    catalogue,
    root: layout.root,
    source,
    pages: pagesOf(layout.root, coordinate, catalogue),
  });
}

/**
 * The rendered page for one skill in one flavour, exactly as the carrier carries it.
 *
 * @throws {TypeError} when the skill is not this carrier's.
 */
export function carrierBody(carrier: Carrier, skill: SkillEntry, flavour: SkillFlavour): string {
  const page = carrier.pages.get(pathFor(skill, flavour));
  if (page === undefined) {
    throw new TypeError(`this carrier does not carry ${skill.name} (${carrier.coordinate})`);
  }
  return page;
}

/** Where {@link resolveCarrier} should look, in the order D4 rules. */
export interface CarrierSearch {
  /** The consumer project the install is for; its `node_modules` is searched upward. */
  readonly projectDirectory: string;
  /** The running CLI's own package directory, which bundles a copy. */
  readonly bundledDirectory?: string | undefined;
  /** A directory given explicitly, overriding both. */
  readonly from?: string | undefined;
}

/** Each home to try, in order, as (kind, directory) — skipping the ones this search has none of. */
function homesOf(search: CarrierSearch): (readonly [CarrierHome, string])[] {
  const project = resolvePackageDirectory(CARRIER_COORDINATE_NAME, search.projectDirectory);
  return [
    ["from", search.from],
    ["project", project],
    ["bundled", search.bundledDirectory],
  ].filter((entry): entry is [CarrierHome, string] => entry[1] !== undefined);
}

/**
 * The first home that holds a carrier, opened.
 *
 * @llmNote An explicit `--from` is never a preference: a path that holds no carrier FAILS rather
 * than falling through, because a person who named a directory did not ask for a different one. Past
 * that, a home is skipped only when it holds no catalogue at all; one that holds a broken carrier is
 * a refusal, so a project is never silently installed from a different release than its own.
 *
 * @throws {TypeError} when no home holds a carrier, naming every one it tried.
 */
export function resolveCarrier(search: CarrierSearch): Carrier {
  const homes = homesOf(search);
  for (const [home, directory] of homes) {
    if (home === "from" || carrierLayoutIn(directory) !== undefined) {
      return openCarrier(directory, home);
    }
  }
  const tried = homes.map(([home, directory]) => `${home} (${directory})`).join(", ");
  throw new TypeError(
    `no skills carrier found — tried ${tried === "" ? "nothing: no home was given" : tried}`,
  );
}
