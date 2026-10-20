import type { DB } from '../db/connection';
import { MAX_QUEUE_SIZE, type Priority } from '../domain/constants';
import { AppError } from '../errors';
import { toSummary, type BusinessService, type BusinessSummary } from './businessService';

export interface QueueItem {
  businessId: number;
  position: number;
  priority: Priority;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  business: BusinessSummary;
}

interface QueueRow {
  business_id: number;
  agent_id: string;
  position: number;
  priority: Priority;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';

const normaliseNote = (note: string | null | undefined) => (note === undefined ? undefined : note?.trim() || null);

export function createQueueService(db: DB, businesses: BusinessService) {
  const stmts = {
    list: db.prepare(
      `SELECT qi.business_id, qi.agent_id, qi.position, qi.priority, qi.note, qi.created_at, qi.updated_at,
              b.*, qi.agent_id AS claim_agent_id, a.name AS claim_agent_name, qi.priority AS claim_priority
       FROM queue_items qi
       JOIN businesses b ON b.id = qi.business_id
       JOIN agents a ON a.id = qi.agent_id
       WHERE qi.agent_id = ?
       ORDER BY qi.position ASC, qi.id ASC`,
    ),
    claimOf: db.prepare(
      `SELECT qi.agent_id, a.name AS agent_name FROM queue_items qi JOIN agents a ON a.id = qi.agent_id WHERE qi.business_id = ?`,
    ),
    count: db.prepare('SELECT COUNT(*) AS n FROM queue_items WHERE agent_id = ?'),
    ownItem: db.prepare('SELECT * FROM queue_items WHERE agent_id = ? AND business_id = ?'),
    shiftDown: db.prepare('UPDATE queue_items SET position = position + 1 WHERE agent_id = ? AND position >= ?'),
    insert: db.prepare(
      'INSERT INTO queue_items (agent_id, business_id, position, priority, note) VALUES (@agentId, @businessId, @position, @priority, @note)',
    ),
    update: db.prepare(
      `UPDATE queue_items SET priority = COALESCE(@priority, priority),
         note = CASE WHEN @noteSet = 1 THEN @note ELSE note END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE agent_id = @agentId AND business_id = @businessId`,
    ),
    setPosition: db.prepare('UPDATE queue_items SET position = ? WHERE agent_id = ? AND business_id = ?'),
    delete: db.prepare('DELETE FROM queue_items WHERE agent_id = ? AND business_id = ?'),
    orderedIds: db.prepare('SELECT business_id FROM queue_items WHERE agent_id = ? ORDER BY position ASC, id ASC').pluck(),
  };

  /** Renumbers positions 0..n-1 (keeps order); call inside a transaction. */
  function compact(agentId: string) {
    (stmts.orderedIds.all(agentId) as number[]).forEach((id, idx) => stmts.setPosition.run(idx, agentId, id));
  }

  function conflictFor(businessId: number, agentId: string): AppError {
    const claim = stmts.claimOf.get(businessId) as { agent_id: string; agent_name: string } | undefined;
    if (claim?.agent_id === agentId) {
      return new AppError(409, 'ALREADY_IN_QUEUE', 'This business is already in your queue');
    }
    return new AppError(409, 'ALREADY_CLAIMED', `Already claimed by ${claim?.agent_name ?? 'another agent'}`, {
      claimedBy: claim ? { id: claim.agent_id, name: claim.agent_name } : null,
    });
  }

  function list(agentId: string): QueueItem[] {
    const rows = stmts.list.all(agentId) as Array<QueueRow & Parameters<typeof toSummary>[0]>;
    return rows.map((r) => ({
      businessId: r.business_id,
      position: r.position,
      priority: r.priority,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      business: toSummary(r, agentId),
    }));
  }

  function getOne(agentId: string, businessId: number): QueueItem {
    const item = list(agentId).find((i) => i.businessId === businessId);
    if (!item) throw AppError.notFound('Business is not in your queue');
    return item;
  }

  // IMMEDIATE transactions take the write lock up front, so check-then-insert can't interleave
  // with another writer. The UNIQUE constraint is still the final guard.
  const addTx = db.transaction(
    (agentId: string, input: { businessId: number; priority: Priority; note?: string | null; position?: number }) => {
      if (!businesses.getRow(input.businessId)) throw AppError.notFound(`Business ${input.businessId} not found`);
      if (stmts.claimOf.get(input.businessId)) throw conflictFor(input.businessId, agentId);

      const { n } = stmts.count.get(agentId) as { n: number };
      if (n >= MAX_QUEUE_SIZE) {
        throw new AppError(422, 'QUEUE_FULL', `Your queue is full (max ${MAX_QUEUE_SIZE}). Remove some leads first.`);
      }
      compact(agentId);
      const position = Math.min(input.position ?? n, n);
      stmts.shiftDown.run(agentId, position);
      stmts.insert.run({
        agentId,
        businessId: input.businessId,
        position,
        priority: input.priority,
        note: normaliseNote(input.note) ?? null,
      });
    },
  );

  const reorderTx = db.transaction((agentId: string, businessIds: number[]) => {
    const current = (stmts.list.all(agentId) as QueueRow[]).map((r) => r.business_id);
    const want = new Set(businessIds);
    const missing = current.filter((id) => !want.has(id));
    const extra = businessIds.filter((id) => !current.includes(id));
    if (missing.length || extra.length || businessIds.length !== current.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'businessIds must contain exactly the businesses in your queue', {
        missing,
        unexpected: extra,
      });
    }
    businessIds.forEach((id, idx) => stmts.setPosition.run(idx, agentId, id));
  });

  const removeTx = db.transaction((agentId: string, businessId: number) => {
    const result = stmts.delete.run(agentId, businessId);
    if (result.changes === 0) throw AppError.notFound('Business is not in your queue');
    compact(agentId);
  });

  return {
    list,

    add(agentId: string, input: { businessId: number; priority: Priority; note?: string | null; position?: number }): QueueItem {
      try {
        addTx.immediate(agentId, input);
      } catch (err) {
        if (isUniqueViolation(err)) throw conflictFor(input.businessId, agentId);
        throw err;
      }
      return getOne(agentId, input.businessId);
    },

    update(agentId: string, businessId: number, patch: { priority?: Priority; note?: string | null }): QueueItem {
      if (!stmts.ownItem.get(agentId, businessId)) throw AppError.notFound('Business is not in your queue');
      const note = normaliseNote(patch.note);
      stmts.update.run({
        agentId,
        businessId,
        priority: patch.priority ?? null,
        noteSet: note === undefined ? 0 : 1,
        note: note ?? null,
      });
      return getOne(agentId, businessId);
    },

    reorder(agentId: string, businessIds: number[]): QueueItem[] {
      reorderTx.immediate(agentId, businessIds);
      return list(agentId);
    },

    remove(agentId: string, businessId: number): void {
      removeTx.immediate(agentId, businessId);
    },
  };
}

export type QueueService = ReturnType<typeof createQueueService>;
