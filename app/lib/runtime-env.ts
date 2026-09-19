type RuntimeGlobals = typeof globalThis & {
  __EXAM_COACH_DB__?: D1Database;
};

export function setRuntimeDatabase(database?: D1Database) {
  (globalThis as RuntimeGlobals).__EXAM_COACH_DB__ = database;
}

export function getRuntimeDatabase() {
  return (globalThis as RuntimeGlobals).__EXAM_COACH_DB__ ?? null;
}
