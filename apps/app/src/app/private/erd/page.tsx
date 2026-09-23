import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import * as schema from "@/db/schema";
import { ErdCanvas, type ErdTable } from "./erd-canvas";

export const metadata: Metadata = {
  title: "ERD",
  robots: { index: false, follow: false },
};

/**
 * Built from the Drizzle schema itself rather than a hand-drawn diagram, so it
 * can never drift from the real tables and foreign keys.
 */
function readSchema(): ErdTable[] {
  const tables = (Object.values(schema) as unknown[]).filter(
    (v): v is PgTable => is(v, PgTable),
  );

  return tables.map((table) => {
    const config = getTableConfig(table);

    const references = new Map<string, { table: string; column: string }>();
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      ref.columns.forEach((col, i) => {
        references.set(col.name, {
          table: getTableName(ref.foreignTable),
          column: ref.foreignColumns[i].name,
        });
      });
    }

    const compositePk = new Set(
      config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    );

    return {
      name: config.name,
      columns: config.columns.map((col) => ({
        name: col.name,
        type: col.getSQLType(),
        primaryKey: col.primary || compositePk.has(col.name),
        notNull: col.notNull,
        unique: col.isUnique,
        references: references.get(col.name) ?? null,
      })),
    };
  });
}

export default function ErdPage() {
  return <ErdCanvas tables={readSchema()} />;
}
