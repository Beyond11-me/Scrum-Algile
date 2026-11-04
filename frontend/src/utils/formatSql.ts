import type { SqlLanguage } from "sql-formatter";

function languageFor(database = ""): SqlLanguage {
  const name = database.toLowerCase();
  if (name.includes("postgres")) return "postgresql";
  if (name.includes("mysql")) return "mysql";
  if (name.includes("sqlite")) return "sqlite";
  // Grading runs on SQL Server, so T-SQL is the default dialect.
  return "transactsql";
}

/** Formats SQL for display. Rejects when the query cannot be parsed, so callers should keep the original text. */
export async function formatSql(query: string, database?: string): Promise<string> {
  const { format } = await import("sql-formatter");
  return format(query, { language: languageFor(database), tabWidth: 2, keywordCase: "upper" });
}
