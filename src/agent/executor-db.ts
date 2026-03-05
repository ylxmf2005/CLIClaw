import type { HiBossDatabase } from "../daemon/db/database.js";

export function countDuePendingEnvelopesForAgent(db: HiBossDatabase, agentName: string): number {
  const rawDb = (db as any).db as { prepare?: (sql: string) => { get: (...args: any[]) => unknown } };
  if (!rawDb?.prepare) return 0;
  const address = `agent:${agentName}`;
  const addressPrefix = `agent:${agentName}:`;
  const sql =
    `SELECT COUNT(*) AS count FROM envelopes WHERE ("to" = ? OR "to" LIKE ? || '%') AND status = 'pending'` +
    ` AND (deliver_at IS NULL OR deliver_at <= ?)`;
  const row = rawDb.prepare(sql).get(address, addressPrefix, Date.now()) as { count: number } | undefined;
  return row?.count ?? 0;
}
