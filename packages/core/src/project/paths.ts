import { RexelError } from "../errors.ts";

const SEPARATOR = "/";
const CURRENT_SEGMENT = ".";
const PARENT_SEGMENT = "..";
const SCHEME_OR_DRIVE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const BACKSLASH = "\\";
const NUL = "\0";

function reject(raw: string, why: string): never {
  throw new RexelError({ reason: `Path "${raw}" is not allowed: ${why}` });
}

export function normalizeProjectPath(raw: string): string {
  if (raw.includes(BACKSLASH)) reject(raw, `use "${SEPARATOR}" as the separator`);
  if (raw.includes(NUL)) reject(raw, "it contains a NUL character");
  if (raw.startsWith(SEPARATOR)) reject(raw, "absolute paths are not allowed");
  if (SCHEME_OR_DRIVE.test(raw)) reject(raw, "drive letters and URL schemes are not allowed");
  const segments = raw.split(SEPARATOR).filter((segment) => segment !== CURRENT_SEGMENT);
  if (segments.includes(PARENT_SEGMENT)) reject(raw, `"${PARENT_SEGMENT}" is not allowed`);
  if (segments.length === 0 || segments.includes("")) reject(raw, "it has an empty segment");
  return segments.join(SEPARATOR);
}

function toPortable(path: string): string {
  const portable = path.replaceAll(BACKSLASH, SEPARATOR);
  return portable.endsWith(SEPARATOR) ? portable.slice(0, -1) : portable;
}

export function assertInsideRoot(
  rootRealPath: string,
  targetRealPath: string,
  projectPath: string,
) {
  if (!toPortable(targetRealPath).startsWith(toPortable(rootRealPath) + SEPARATOR)) {
    reject(projectPath, "it resolves outside the project folder");
  }
}
