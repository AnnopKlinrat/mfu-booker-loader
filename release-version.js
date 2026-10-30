// Release version labels: YYYY.MM.DD-HHMM (UTC). Fixed width, so plain string comparison is also
// chronological order. Pure functions, shared by the license Worker, the publisher and the loader
// (this file is copied into the loader repo). Anything that does not match is never signed, never
// published and never accepted by a loader.
export const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}-\d{4}$/;

export const isValidVersion = (v) => typeof v === "string" && VERSION_RE.test(v);

/** -1 / 0 / 1. Only meaningful for two valid versions. */
export const compareVersions = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
