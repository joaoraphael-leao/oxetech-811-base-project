import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "../types";

function getDatabasePath(): string {
  const dataFile = process.env.DATA_FILE || "data/db.json";
  return path.resolve(process.cwd(), dataFile);
}

export function readDatabase(): Database {
  const content = fs.readFileSync(getDatabasePath(), "utf-8");
  return JSON.parse(content) as Database;
}

export function writeDatabase(database: Database): void {
  fs.writeFileSync(getDatabasePath(), JSON.stringify(database, null, 2));
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
