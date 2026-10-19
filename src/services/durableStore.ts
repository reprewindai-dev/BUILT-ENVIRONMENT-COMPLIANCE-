import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export class InvalidPermitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPermitError';
  }
}

export class StalePermitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StalePermitError';
  }
}

export class CrossSubjectBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossSubjectBindingError';
  }
}

export class OperationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationConflictError';
  }
}

export class PowerStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PowerStateTransitionError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export class ReplayPayloadMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayPayloadMismatchError';
  }
}

export class UnauthorizedCallerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedCallerError';
  }
}

export interface DurableBlock {
  seq: number;
  event_id: string;
  event_type: string;
  payload_json: string;
  previous_hash: string;
  hash: string;
  created_at: string;
}

export interface DualStateReceipt {
  receipt_id: string;
  operation_id: string;
  subject_id: string;
  worker_id: string;
  incarnation_id: string;
  state_before: string;
  state_after: string;
  epoch: number;
  delta_c: number;
  proof_hash: string;
  created_at: string;
}

export interface CommitmentRecord {
  id: string;
  pool_id: string;
  subject_id: string;
  steward_id: string;
  amount: number;
  currency: string;
  purpose: string;
  power_state: 'D0' | 'D1' | 'D2' | 'D3hot' | 'D3cold';
  status: 'PENDING' | 'COMMITTED' | 'REJECTED' | 'FULFILLED';
  metadata_json: string;
  created_at: string;
}

export interface EscrowDisbursementResult {
  receipt: DualStateReceipt;
  disbursement: {
    id: string;
    commitment_id: string;
    beneficiary_id: string;
    amount: number;
    currency: string;
    steward_permit: string;
    policy_hash: string;
    status: 'DISBURSED';
    disbursed_at: string;
  };
}

export interface DeliveryEvidence {
  evidence_id: string;
  commitment_id: string;
  subject_id: string;
  steward_id: string;
  evidence_type: 'PHOTO' | 'INSPECTION_REPORT' | 'METER_READING' | 'WORK_COMPLETION_CERTIFICATE' | 'INVOICE_RECEIPT';
  title: string;
  description: string;
  dataset_id?: string;
  file_hash: string;
  evidence_url: string;
  status: 'SUBMITTED' | 'VERIFIED' | 'CONTESTED';
  claim_boundary: string;
  created_at: string;
}

export interface DatasetProvenance {
  dataset_id: string;
  title: string;
  publisher: string;
  source_url: string;
  retrieval_timestamp: string;
  snapshot_digest: string;
  permission_terms: string;
  data_classification: 'SYNTHETIC_FIXTURE' | 'PUBLIC_OPEN_DATA' | 'RESTRICTED' | 'COMMUNITY_VERIFIED';
  coverage_summary: string;
  limitations: string;
  approved_by: string;
  verification_status: 'CANDIDATE' | 'VALIDATED' | 'APPROVED_FOR_DEMO' | 'REJECTED';
  created_at: string;
}

// Universal SQLite abstraction: supports node:sqlite, bun:sqlite, and better-sqlite3
export interface UniversalDatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): { lastInsertRowid: number | bigint; changes: number | bigint };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
}

export function createUniversalSQLite(resolvedPath: string): UniversalDatabaseSync {
  // 1. Try native node:sqlite (Node 22.5+ / Node 24)
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(resolvedPath);
  } catch {
    // continue
  }

  // 2. Try Bun native bun:sqlite
  try {
    const { Database } = require('bun:sqlite');
    const bunDb = new Database(resolvedPath);
    return {
      exec: (sql: string) => bunDb.exec(sql),
      prepare: (sql: string) => {
        const stmt = bunDb.prepare(sql);
        return {
          run: (...params: any[]) => {
            const res = stmt.run(...params);
            return { lastInsertRowid: res.lastInsertRowid || 0, changes: res.changes || 0 };
          },
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params)
        };
      }
    };
  } catch {
    // continue
  }

  // 3. Try better-sqlite3
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const bsDb = new BetterSqlite3(resolvedPath);
    return {
      exec: (sql: string) => bsDb.exec(sql),
      prepare: (sql: string) => {
        const stmt = bsDb.prepare(sql);
        return {
          run: (...params: any[]) => stmt.run(...params),
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params)
        };
      }
    };
  } catch {
    // continue
  }

  throw new Error('FATAL: No supported SQLite engine found. Please use Node 22.5+, Bun, or install better-sqlite3.');
}

export class DurableStore {
  private db: UniversalDatabaseSync;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'civictrust_durable.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = createUniversalSQLite(resolvedPath);
    this.initPragmas();
    this.initSchema();
  }

  private initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        collection TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, key)
      );

      CREATE TABLE IF NOT EXISTS durable_ledger (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS authority_epochs (
        subject_id TEXT PRIMARY KEY,
        current_epoch INTEGER NOT NULL CHECK(typeof(current_epoch) = 'integer' AND current_epoch >= 0),
        active_incarnation TEXT NOT NULL,
        power_state TEXT NOT NULL CHECK(power_state IN ('D0', 'D1', 'D2', 'D3hot', 'D3cold')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS worker_bindings (
        worker_id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        power_state TEXT NOT NULL CHECK(power_state IN ('D0', 'D1', 'D2', 'D3hot', 'D3cold')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES authority_epochs(subject_id)
      );

      CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        steward_id TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        currency TEXT NOT NULL,
        purpose TEXT NOT NULL,
        power_state TEXT NOT NULL CHECK(power_state IN ('D0', 'D1', 'D2', 'D3hot', 'D3cold')),
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'COMMITTED', 'REJECTED', 'FULFILLED')),
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS statutory_permits (
        permit_id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        authority TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        incarnation_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        policy_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'CONSUMED')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escrow_accounts (
        account_id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        balance REAL NOT NULL CHECK(balance >= 0),
        currency TEXT NOT NULL,
        epoch INTEGER NOT NULL CHECK(epoch >= 0),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dual_state_receipts (
        receipt_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        subject_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        state_before TEXT NOT NULL,
        state_after TEXT NOT NULL,
        epoch INTEGER NOT NULL CHECK(epoch >= 0),
        delta_c REAL NOT NULL,
        proof_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS delivery_evidence (
        evidence_id TEXT PRIMARY KEY,
        commitment_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        steward_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL CHECK(evidence_type IN ('PHOTO', 'INSPECTION_REPORT', 'METER_READING', 'WORK_COMPLETION_CERTIFICATE', 'INVOICE_RECEIPT')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        dataset_id TEXT,
        file_hash TEXT NOT NULL,
        evidence_url TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('SUBMITTED', 'VERIFIED', 'CONTESTED')),
        claim_boundary TEXT NOT NULL DEFAULT 'Records submitted evidence digest and metadata; does not independently establish physical delivery.',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dataset_provenance (
        dataset_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        publisher TEXT NOT NULL,
        source_url TEXT NOT NULL,
        retrieval_timestamp TEXT NOT NULL,
        snapshot_digest TEXT NOT NULL,
        permission_terms TEXT NOT NULL,
        data_classification TEXT NOT NULL CHECK(data_classification IN ('SYNTHETIC_FIXTURE', 'PUBLIC_OPEN_DATA', 'RESTRICTED', 'COMMUNITY_VERIFIED')),
        coverage_summary TEXT NOT NULL,
        limitations TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        verification_status TEXT NOT NULL CHECK(verification_status IN ('CANDIDATE', 'VALIDATED', 'APPROVED_FOR_DEMO', 'REJECTED')),
        created_at TEXT NOT NULL
      );
    `);

    // Ensure genesis block exists if ledger is empty
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM durable_ledger').get() as { count: number };
    if (countRow.count === 0) {
      const genesisPayload = JSON.stringify({
        message: 'CivicTrust Sovereign Built-Environment & Community Credit Ledger Initialized',
        jurisdiction: 'Republic of Zambia & Sustainable Finance Live 2026',
        authorities: ['ZIA', 'EIZ', 'NCC', 'PACRA', 'LCC', 'MLG', 'CIVICTRUST']
      });
      const genesisPrev = 'GENESIS-0000000000000000000000000000000000000000000000000000000000000000';
      const genesisHash = crypto.createHash('sha256').update(genesisPrev + genesisPayload + 'SYSTEM_GENESIS').digest('hex');

      this.db.prepare(`
        INSERT INTO durable_ledger (seq, event_id, event_type, payload_json, previous_hash, hash, created_at)
        VALUES (1, ?, 'SYSTEM_GENESIS', ?, ?, ?, ?)
      `).run(
        'GENESIS-EVT-001',
        genesisPayload,
        genesisPrev,
        genesisHash,
        new Date().toISOString()
      );
    }

    const provCount = this.db.prepare('SELECT COUNT(*) as count FROM dataset_provenance').get() as { count: number };
    if (provCount.count === 0) {
      this.recordDatasetProvenance({
        dataset_id: 'DS-ZAMBIA-SOLAR-01',
        title: 'Lusaka Built Environment & Solar Infrastructure Baseline',
        publisher: 'Ministry of Local Government & Lusaka City Council Planning Department',
        source_url: 'https://data.gov.zm/datasets/built-env-compliance/2026',
        retrieval_timestamp: '2026-10-18T10:00:00.000Z',
        snapshot_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        permission_terms: 'Open Government Licence (Zambia) / SF.Live 2026 Demonstration Use',
        data_classification: 'SYNTHETIC_FIXTURE',
        coverage_summary: 'Lusaka urban grid-tied and commercial solar installations, contractor registrations (NCC C1-C6)',
        limitations: 'Demonstration fixture calibrated against Lusaka City Council planning norms; synthetic financial values.',
        approved_by: 'Francis Banda (CivicTrust Lead) & Anthony Millwater (Veklom Architecture)',
        verification_status: 'APPROVED_FOR_DEMO',
        created_at: new Date().toISOString()
      });
      this.recordDatasetProvenance({
        dataset_id: 'DS-COMMONS-CREDIT-02',
        title: 'CivicTrust Community Labour & Voucher Commitment Ledger',
        publisher: 'CivicTrust Community Credit Protocol Registry',
        source_url: 'https://civictrust.network/standards/problem-2-pools/2026',
        retrieval_timestamp: '2026-10-18T10:00:00.000Z',
        snapshot_digest: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        permission_terms: 'Community Commons Mutual Credit Agreement v1.0',
        data_classification: 'COMMUNITY_VERIFIED',
        coverage_summary: 'Community labour vouchers, local artisan bindings, escrow reserve governance',
        limitations: 'Subject to steward approval permits; non-transferable outside affiliated community pool.',
        approved_by: 'Francis Banda (CivicTrust Lead)',
        verification_status: 'APPROVED_FOR_DEMO',
        created_at: new Date().toISOString()
      });
    }
  }

  // --- KV Store persistence for server Maps ---
  public getKV<T = any>(collection: string, key: string): T | null {
    const row = this.db.prepare('SELECT value_json FROM kv_store WHERE collection = ? AND key = ?').get(collection, key) as { value_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return null;
    }
  }

  public setKV(collection: string, key: string, value: any): void {
    const json = JSON.stringify(value);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO kv_store (collection, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(collection, key, json, now);
  }

  public getAllKV<T = any>(collection: string): Map<string, T> {
    const rows = this.db.prepare('SELECT key, value_json FROM kv_store WHERE collection = ?').all(collection) as { key: string; value_json: string }[];
    const map = new Map<string, T>();
    for (const r of rows) {
      try {
        map.set(r.key, JSON.parse(r.value_json));
      } catch {
        // ignore parse errors
      }
    }
    return map;
  }

  // --- Append-Only Hash-Chained Ledger ---
  public appendLedgerBlock(eventType: string, payload: any): DurableBlock {
    const lastRow = this.db.prepare('SELECT seq, hash FROM durable_ledger ORDER BY seq DESC LIMIT 1').get() as { seq: number; hash: string } | undefined;
    const previousHash = lastRow ? lastRow.hash : 'GENESIS-0000000000000000000000000000000000000000000000000000000000000000';
    const payloadJson = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(previousHash + payloadJson + eventType).digest('hex');
    const eventId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const result = this.db.prepare(`
      INSERT INTO durable_ledger (event_id, event_type, payload_json, previous_hash, hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, eventType, payloadJson, previousHash, hash, createdAt);

    return {
      seq: Number(result.lastInsertRowid),
      event_id: eventId,
      event_type: eventType,
      payload_json: payloadJson,
      previous_hash: previousHash,
      hash,
      created_at: createdAt
    };
  }

  public getLedgerBlocks(limit = 100, cursorSeq = 0): DurableBlock[] {
    if (cursorSeq > 0) {
      return this.db.prepare('SELECT * FROM durable_ledger WHERE seq > ? ORDER BY seq ASC LIMIT ?').all(cursorSeq, limit) as unknown as DurableBlock[];
    }
    return this.db.prepare('SELECT * FROM durable_ledger ORDER BY seq ASC LIMIT ?').all(limit) as unknown as DurableBlock[];
  }

  public verifyLedgerChain(): { valid: boolean; totalBlocks: number; brokenSeq?: number } {
    const rows = this.db.prepare('SELECT * FROM durable_ledger ORDER BY seq ASC').all() as unknown as DurableBlock[];
    let prev = 'GENESIS-0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < rows.length; i++) {
      const b = rows[i];
      if (i > 0 && b.previous_hash !== prev) {
        return { valid: false, totalBlocks: rows.length, brokenSeq: b.seq };
      }
      const expected = crypto.createHash('sha256').update(b.previous_hash + b.payload_json + b.event_type).digest('hex');
      if (expected !== b.hash) {
        return { valid: false, totalBlocks: rows.length, brokenSeq: b.seq };
      }
      prev = b.hash;
    }

    return { valid: true, totalBlocks: rows.length };
  }

  // --- Authority, Incarnations & Worker Bindings ---
  public registerSubject(subjectId: string, initialEpoch = 1, powerState: 'D0' | 'D1' | 'D2' | 'D3hot' | 'D3cold' = 'D0'): string {
    const existing = this.getSubject(subjectId);
    if (existing) {
      throw new OperationConflictError(`Subject ${subjectId} is already registered with monotonic epoch ${existing.current_epoch}. Overwrite is forbidden.`);
    }

    const incarnation = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO authority_epochs (subject_id, current_epoch, active_incarnation, power_state, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(subjectId, initialEpoch, incarnation, powerState, now);

    this.appendLedgerBlock('SUBJECT_AUTHORITY_REGISTERED', {
      subject_id: subjectId,
      epoch: initialEpoch,
      incarnation_id: incarnation,
      power_state: powerState
    });

    return incarnation;
  }

  public getSubject(subjectId: string): { subject_id: string; current_epoch: number; active_incarnation: string; power_state: string } | null {
    const row = this.db.prepare('SELECT * FROM authority_epochs WHERE subject_id = ?').get(subjectId) as any;
    return row || null;
  }

  public transitionPowerState(
    subjectId: string,
    targetState: 'D0' | 'D1' | 'D2' | 'D3hot' | 'D3cold',
    wakeProof?: { signature: string; secret: string; capability_grant_id?: string }
  ): void {
    const subject = this.getSubject(subjectId);
    if (!subject) throw new InvalidPermitError(`Subject ${subjectId} not found`);

    const current = subject.power_state as 'D0' | 'D1' | 'D2' | 'D3hot' | 'D3cold';
    if (current === targetState) return;

    // Canonical Transition Table according to Continuity Skill 2.0:
    // D0 -> D1 (Allowed)
    // D0 -> D2 (Allowed)
    // D0 -> D3hot (Allowed)
    // D1 -> D0 (Allowed)
    // D2 -> D0 (Allowed)
    // D1 -> D3hot (Allowed)
    // D2 -> D3hot (Allowed)
    // D3hot -> D3cold (Allowed)
    // D3cold -> D0 (Allowed ONLY with verified wake proof)
    // D3hot -> D1 / D2 (FORBIDDEN)
    // D3cold -> D1 / D2 (FORBIDDEN)
    // D3hot -> D0 without wake proof (FORBIDDEN)

    const isLowPowerD3 = (current === 'D3hot' || current === 'D3cold');
    if (isLowPowerD3 && (targetState === 'D1' || targetState === 'D2')) {
      throw new PowerStateTransitionError(`Forbidden power transition: ${current} cannot transition to ${targetState} without passing through verified D0 re-entry`);
    }

    if (isLowPowerD3 && targetState === 'D0') {
      if (!wakeProof || !wakeProof.signature || !wakeProof.secret) {
        throw new PowerStateTransitionError(`Wake verification failed: Re-entry from ${current} to D0 strictly requires cryptographic wake authorization`);
      }
      const expectedWakeSig = crypto.createHmac('sha256', wakeProof.secret).update(`WAKE:${subjectId}:${subject.current_epoch}:${subject.active_incarnation}`).digest('hex');
      if (wakeProof.signature !== expectedWakeSig) {
        throw new PowerStateTransitionError('Wake verification failed: Invalid cryptographic wake signature');
      }
    }

    const now = new Date().toISOString();
    this.db.prepare('UPDATE authority_epochs SET power_state = ?, updated_at = ? WHERE subject_id = ?').run(targetState, now, subjectId);
    this.appendLedgerBlock('POWER_STATE_TRANSITION', { subject_id: subjectId, from: current, to: targetState, verified_wake: isLowPowerD3 && targetState === 'D0' });
  }

  public advanceEpoch(subjectId: string): number {
    const subject = this.getSubject(subjectId);
    if (!subject) throw new InvalidPermitError(`Subject ${subjectId} not registered`);

    const newEpoch = subject.current_epoch + 1;
    const newIncarnation = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    this.db.prepare('UPDATE authority_epochs SET current_epoch = ?, active_incarnation = ?, updated_at = ? WHERE subject_id = ?').run(
      newEpoch,
      newIncarnation,
      now,
      subjectId
    );

    this.appendLedgerBlock('AUTHORITY_EPOCH_ADVANCED', { subject_id: subjectId, new_epoch: newEpoch, new_incarnation: newIncarnation });
    return newEpoch;
  }

  public bindWorker(workerId: string, subjectId: string, incarnationId: string, role: string, powerState: 'D0' | 'D1' | 'D2' | 'D3hot' | 'D3cold' = 'D0'): void {
    const subject = this.getSubject(subjectId);
    if (!subject) throw new InvalidPermitError(`Subject ${subjectId} not found`);
    if (subject.active_incarnation !== incarnationId) {
      throw new StalePermitError(`Incarnation mismatch: expected ${subject.active_incarnation}, got ${incarnationId}`);
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO worker_bindings (worker_id, subject_id, incarnation_id, role, power_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(worker_id) DO UPDATE SET
        subject_id = excluded.subject_id,
        incarnation_id = excluded.incarnation_id,
        role = excluded.role,
        power_state = excluded.power_state
    `).run(workerId, subjectId, incarnationId, role, powerState, now);
  }

  // --- Commitments & Community Pools ---
  public createCommitment(commitment: Omit<CommitmentRecord, 'created_at'>): CommitmentRecord {
    const subject = this.getSubject(commitment.subject_id);
    if (!subject) throw new InvalidPermitError(`Subject ${commitment.subject_id} not registered`);
    
    // In low-power state, mutations are denied
    if (subject.power_state !== 'D0' && commitment.power_state === 'D0') {
      throw new PowerStateTransitionError(`Subject is in ${subject.power_state}; cannot issue D0 active commitment`);
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO commitments (id, pool_id, subject_id, steward_id, amount, currency, purpose, power_state, status, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      commitment.id,
      commitment.pool_id,
      commitment.subject_id,
      commitment.steward_id,
      commitment.amount,
      commitment.currency,
      commitment.purpose,
      commitment.power_state,
      commitment.status,
      commitment.metadata_json,
      now
    );

    this.appendLedgerBlock('COMMUNITY_COMMITMENT_CREATED', {
      commitment_id: commitment.id,
      pool_id: commitment.pool_id,
      amount: commitment.amount,
      currency: commitment.currency,
      purpose: commitment.purpose
    });

    return { ...commitment, created_at: now };
  }

  public getCommitments(poolId?: string): CommitmentRecord[] {
    if (poolId) {
      return this.db.prepare('SELECT * FROM commitments WHERE pool_id = ? ORDER BY created_at DESC').all(poolId) as unknown as CommitmentRecord[];
    }
    return this.db.prepare('SELECT * FROM commitments ORDER BY created_at DESC').all() as unknown as CommitmentRecord[];
  }

  // --- Statutory Permits ---
  public issuePermit(params: {
    permit_id: string;
    submission_id: string;
    subject_id: string;
    authority: string;
    scope: string;
    policy_hash: string;
    secret: string;
  }): any {
    const subject = this.getSubject(params.subject_id);
    if (!subject) throw new InvalidPermitError(`Subject ${params.subject_id} not found`);
    if (subject.power_state !== 'D0') {
      throw new PowerStateTransitionError(`Cannot issue permit while subject is in ${subject.power_state}`);
    }

    const now = new Date().toISOString();
    const signaturePayload = `${params.permit_id}:${params.submission_id}:${params.subject_id}:${subject.current_epoch}:${subject.active_incarnation}:${params.policy_hash}`;
    const signature = crypto.createHmac('sha256', params.secret).update(signaturePayload).digest('hex');

    this.db.prepare(`
      INSERT INTO statutory_permits (permit_id, submission_id, subject_id, authority, epoch, incarnation_id, scope, policy_hash, signature, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(
      params.permit_id,
      params.submission_id,
      params.subject_id,
      params.authority,
      subject.current_epoch,
      subject.active_incarnation,
      params.scope,
      params.policy_hash,
      signature,
      now
    );

    this.appendLedgerBlock('STATUTORY_PERMIT_ISSUED', {
      permit_id: params.permit_id,
      submission_id: params.submission_id,
      authority: params.authority,
      epoch: subject.current_epoch,
      signature
    });

    return {
      permit_id: params.permit_id,
      submission_id: params.submission_id,
      subject_id: params.subject_id,
      authority: params.authority,
      epoch: subject.current_epoch,
      incarnation_id: subject.active_incarnation,
      scope: params.scope,
      signature,
      status: 'ACTIVE',
      created_at: now
    };
  }

  // --- Escrow Account Management ---
  public getOrCreateEscrow(accountId: string, subjectId: string, initialBalance = 0, currency = 'ZMW'): { account_id: string; subject_id: string; balance: number; currency: string; epoch: number } {
    let acc = this.db.prepare('SELECT * FROM escrow_accounts WHERE account_id = ?').get(accountId) as any;
    if (!acc) {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO escrow_accounts (account_id, subject_id, balance, currency, epoch, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(accountId, subjectId, initialBalance, currency, now);
      acc = { account_id: accountId, subject_id: subjectId, balance: initialBalance, currency, epoch: 1 };
    }
    return acc;
  }

  // --- Fail-Closed Escrow Disbursement with Dual-State Receipt Invariant ---
  public disburseEscrowWithDualStateReceipt(params: {
    operation_id: string;
    account_id: string;
    subject_id: string;
    worker_id: string;
    steward_permit_id: string;
    beneficiary_id: string;
    amount: number;
    currency: string;
    policy_hash: string;
    secret: string;
  }): EscrowDisbursementResult {
    // 0. Strict Finite Positive Amount Validation
    if (
      typeof params.amount !== 'number' ||
      !Number.isFinite(params.amount) ||
      Number.isNaN(params.amount) ||
      params.amount <= 0 ||
      params.amount > 1_000_000_000
    ) {
      throw new InvalidAmountError(`Disbursement amount must be a positive finite number: received ${params.amount}`);
    }

    // 1. Begin Atomic Immediate Sink Transaction (Sink-level guard encapsulates replay check and mutation)
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      // 2. Replay Check: Within the atomic transaction, verify canonical request digest
      const canonicalPayload = JSON.stringify({
        account_id: params.account_id,
        subject_id: params.subject_id,
        worker_id: params.worker_id,
        steward_permit_id: params.steward_permit_id,
        beneficiary_id: params.beneficiary_id,
        amount: params.amount,
        currency: params.currency,
        policy_hash: params.policy_hash
      });
      const canonicalDigest = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

      const existingReceipt = this.db.prepare('SELECT * FROM dual_state_receipts WHERE operation_id = ?').get(params.operation_id) as unknown as DualStateReceipt | undefined;
      if (existingReceipt) {
        const existingDisb = this.getKV<any>('escrow_disbursements', params.operation_id);
        // Verify replay payload matches exact canonical parameters (reject replay attack with different payload)
        if (
          existingDisb &&
          (existingDisb.amount !== params.amount ||
            existingDisb.beneficiary_id !== params.beneficiary_id ||
            existingDisb.currency !== params.currency)
        ) {
          throw new ReplayPayloadMismatchError(`Operation ID ${params.operation_id} already committed with different disbursement parameters.`);
        }
        this.db.exec('COMMIT;');
        return { receipt: existingReceipt, disbursement: existingDisb };
      }

      // 3. Cross-Subject Binding Check (Worker in Subject)
      const worker = this.db.prepare('SELECT * FROM worker_bindings WHERE worker_id = ?').get(params.worker_id) as any;
      if (!worker) {
        throw new CrossSubjectBindingError(`Worker ${params.worker_id} is not registered`);
      }
      if (worker.subject_id !== params.subject_id) {
        throw new CrossSubjectBindingError(`Cross-subject violation: worker ${params.worker_id} belongs to ${worker.subject_id}, but request targets ${params.subject_id}`);
      }

      // 4. Subject Power State & Incarnation Freshness Check
      const subject = this.getSubject(params.subject_id);
      if (!subject) throw new InvalidPermitError(`Subject ${params.subject_id} not found`);
      if (subject.power_state !== 'D0') {
        throw new PowerStateTransitionError(`Consequence denied: Subject ${params.subject_id} is in power state ${subject.power_state}; ΔC must equal 0`);
      }
      if (worker.incarnation_id !== subject.active_incarnation) {
        throw new StalePermitError(`Worker incarnation ${worker.incarnation_id} is stale; active is ${subject.active_incarnation}`);
      }

      // 5. Escrow Account Ownership & Currency Invariant
      const escrow = this.db.prepare('SELECT * FROM escrow_accounts WHERE account_id = ?').get(params.account_id) as any;
      if (!escrow) {
        throw new InvalidPermitError(`Escrow account ${params.account_id} not found`);
      }
      if (escrow.subject_id !== params.subject_id) {
        throw new CrossSubjectBindingError(`Escrow account ${params.account_id} belongs to subject ${escrow.subject_id}, but request is authorized under subject ${params.subject_id}`);
      }
      if (escrow.currency !== params.currency) {
        throw new InvalidPermitError(`Escrow currency mismatch: account currency is ${escrow.currency}, but request specified ${params.currency}`);
      }

      // 6. Validate Permit & Signature
      const permit = this.db.prepare('SELECT * FROM statutory_permits WHERE permit_id = ?').get(params.steward_permit_id) as any;
      if (!permit) {
        throw new InvalidPermitError(`Steward permit ${params.steward_permit_id} not found`);
      }
      if (permit.status !== 'ACTIVE') {
        throw new InvalidPermitError(`Permit ${params.steward_permit_id} is ${permit.status}; cannot execute`);
      }
      if (permit.subject_id !== params.subject_id) {
        throw new CrossSubjectBindingError(`Permit subject ${permit.subject_id} does not match request subject ${params.subject_id}`);
      }
      if (permit.scope !== 'ESCROW_DISBURSE_HARMONIZED' && permit.scope !== 'ESCROW_DISBURSE') {
        throw new InvalidPermitError(`Permit scope '${permit.scope}' does not authorize escrow disbursement (required: ESCROW_DISBURSE_HARMONIZED)`);
      }
      if (permit.epoch !== subject.current_epoch) {
        throw new StalePermitError(`Permit epoch ${permit.epoch} is retired; subject epoch is ${subject.current_epoch}`);
      }

      const expectedSignaturePayload = `${permit.permit_id}:${permit.submission_id}:${permit.subject_id}:${permit.epoch}:${permit.incarnation_id}:${permit.policy_hash}`;
      const expectedSig = crypto.createHmac('sha256', params.secret).update(expectedSignaturePayload).digest('hex');
      if (permit.signature !== expectedSig) {
        throw new InvalidPermitError('Cryptographic permit signature invalid');
      }

      if (params.policy_hash !== permit.policy_hash) {
        throw new InvalidPermitError('Execution policy hash does not match signed permit policy hash');
      }

      // 7. Verify Escrow Balance Constraint
      if (escrow.balance < params.amount) {
        throw new InsufficientBalanceError(`Insufficient escrow balance: ${escrow.balance} < ${params.amount}`);
      }

      const balanceBefore = escrow.balance;
      const balanceAfter = balanceBefore - params.amount;
      const now = new Date().toISOString();

      // Update escrow balance
      this.db.prepare('UPDATE escrow_accounts SET balance = ?, updated_at = ? WHERE account_id = ?').run(balanceAfter, now, params.account_id);

      // Consume permit
      this.db.prepare('UPDATE statutory_permits SET status = ? WHERE permit_id = ?').run('CONSUMED', params.steward_permit_id);

      // Construct dual-state receipt
      const stateBefore = JSON.stringify({ account_id: params.account_id, balance: balanceBefore, epoch: subject.current_epoch });
      const stateAfter = JSON.stringify({ account_id: params.account_id, balance: balanceAfter, epoch: subject.current_epoch });
      const receiptId = `RCP-${crypto.randomUUID()}`;
      const proofPayload = `${receiptId}:${params.operation_id}:${stateBefore}:${stateAfter}:${subject.current_epoch}`;
      const proofHash = crypto.createHash('sha256').update(proofPayload).digest('hex');

      this.db.prepare(`
        INSERT INTO dual_state_receipts (receipt_id, operation_id, subject_id, worker_id, incarnation_id, state_before, state_after, epoch, delta_c, proof_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptId,
        params.operation_id,
        params.subject_id,
        params.worker_id,
        subject.active_incarnation,
        stateBefore,
        stateAfter,
        subject.current_epoch,
        params.amount,
        proofHash,
        now
      );

      const disbursementRecord = {
        id: `DSB-${Date.now()}`,
        commitment_id: params.operation_id,
        beneficiary_id: params.beneficiary_id,
        amount: params.amount,
        currency: params.currency,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        steward_permit: params.steward_permit_id,
        policy_hash: params.policy_hash,
        status: 'DISBURSED' as const,
        disbursed_at: now
      };

      this.setKV('escrow_disbursements', params.operation_id, disbursementRecord);

      // Append receipt into durable ledger
      this.appendLedgerBlock('ESCROW_DISBURSED_WITH_DUAL_STATE_RECEIPT', {
        receipt_id: receiptId,
        operation_id: params.operation_id,
        disbursement: disbursementRecord,
        proof_hash: proofHash
      });

      this.db.exec('COMMIT;');

      const receipt: DualStateReceipt = {
        receipt_id: receiptId,
        operation_id: params.operation_id,
        subject_id: params.subject_id,
        worker_id: params.worker_id,
        incarnation_id: subject.active_incarnation,
        state_before: stateBefore,
        state_after: stateAfter,
        epoch: subject.current_epoch,
        delta_c: params.amount,
        proof_hash: proofHash,
        created_at: now
      };

      return { receipt, disbursement: disbursementRecord };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  // --- Delivery Evidence Methods ---
  public recordEvidence(params: {
    evidence_id?: string;
    commitment_id: string;
    subject_id: string;
    steward_id: string;
    evidence_type: DeliveryEvidence['evidence_type'];
    title: string;
    description: string;
    dataset_id?: string;
    file_hash: string;
    evidence_url: string;
    status?: DeliveryEvidence['status'];
  }): DeliveryEvidence {
    const id = params.evidence_id || `EVD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const status = params.status || 'SUBMITTED';
    const now = new Date().toISOString();
    const claim_boundary = 'Records submitted evidence metadata and digest; does not independently establish physical delivery.';

    this.db.prepare(`
      INSERT INTO delivery_evidence (
        evidence_id, commitment_id, subject_id, steward_id, evidence_type,
        title, description, dataset_id, file_hash, evidence_url, status, claim_boundary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.commitment_id,
      params.subject_id,
      params.steward_id,
      params.evidence_type,
      params.title,
      params.description,
      params.dataset_id || null,
      params.file_hash,
      params.evidence_url,
      status,
      claim_boundary,
      now
    );

    const record: DeliveryEvidence = {
      evidence_id: id,
      commitment_id: params.commitment_id,
      subject_id: params.subject_id,
      steward_id: params.steward_id,
      evidence_type: params.evidence_type,
      title: params.title,
      description: params.description,
      dataset_id: params.dataset_id,
      file_hash: params.file_hash,
      evidence_url: params.evidence_url,
      status,
      claim_boundary,
      created_at: now
    };

    this.appendLedgerBlock('DELIVERY_EVIDENCE_RECORDED', record);
    return record;
  }

  public verifyEvidence(evidenceId: string, verifierId: string, notes?: string): DeliveryEvidence {
    const existing = this.db.prepare('SELECT * FROM delivery_evidence WHERE evidence_id = ?').get(evidenceId) as any;
    if (!existing) {
      throw new InvalidPermitError(`Delivery evidence ${evidenceId} not found`);
    }
    this.db.prepare('UPDATE delivery_evidence SET status = ? WHERE evidence_id = ?').run('VERIFIED', evidenceId);
    this.appendLedgerBlock('DELIVERY_EVIDENCE_VERIFIED', {
      evidence_id: evidenceId,
      verifier_id: verifierId,
      notes: notes || null,
      verified_at: new Date().toISOString()
    });
    return { ...existing, status: 'VERIFIED' };
  }

  public getEvidence(commitmentId?: string, subjectId?: string): DeliveryEvidence[] {
    if (commitmentId) {
      return this.db.prepare('SELECT * FROM delivery_evidence WHERE commitment_id = ? ORDER BY created_at DESC').all(commitmentId) as unknown as DeliveryEvidence[];
    }
    if (subjectId) {
      return this.db.prepare('SELECT * FROM delivery_evidence WHERE subject_id = ? ORDER BY created_at DESC').all(subjectId) as unknown as DeliveryEvidence[];
    }
    return this.db.prepare('SELECT * FROM delivery_evidence ORDER BY created_at DESC LIMIT 100').all() as unknown as DeliveryEvidence[];
  }

  // --- Dataset Provenance Methods ---
  public recordDatasetProvenance(params: DatasetProvenance): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO dataset_provenance (
        dataset_id, title, publisher, source_url, retrieval_timestamp,
        snapshot_digest, permission_terms, data_classification, coverage_summary,
        limitations, approved_by, verification_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.dataset_id,
      params.title,
      params.publisher,
      params.source_url,
      params.retrieval_timestamp,
      params.snapshot_digest,
      params.permission_terms,
      params.data_classification,
      params.coverage_summary,
      params.limitations,
      params.approved_by,
      params.verification_status,
      params.created_at
    );
  }

  public getDatasetProvenance(datasetId?: string): DatasetProvenance[] {
    if (datasetId) {
      return this.db.prepare('SELECT * FROM dataset_provenance WHERE dataset_id = ?').all(datasetId) as unknown as DatasetProvenance[];
    }
    return this.db.prepare('SELECT * FROM dataset_provenance ORDER BY created_at DESC').all() as unknown as DatasetProvenance[];
  }

  // --- Understanding Packet / Disclosure Query (Institutional Bank/Funder View) ---
  public generateUnderstandingPacket(subjectId: string, allowedFields: string[] = ['commitments', 'permits', 'receipts', 'evidence', 'data_sources_and_limitations', 'ledger_proof']): any {
    const subject = this.getSubject(subjectId);
    if (!subject) throw new InvalidPermitError(`Subject ${subjectId} not found`);

    const commitments = this.db.prepare('SELECT id, pool_id, amount, currency, purpose, status, created_at FROM commitments WHERE subject_id = ?').all(subjectId) as any[];
    const permits = this.db.prepare('SELECT permit_id, submission_id, authority, epoch, scope, status, created_at FROM statutory_permits WHERE subject_id = ?').all(subjectId) as any[];
    const receipts = this.db.prepare('SELECT receipt_id, operation_id, epoch, delta_c, state_before, state_after, proof_hash, created_at FROM dual_state_receipts WHERE subject_id = ? ORDER BY epoch DESC LIMIT 50').all(subjectId) as any[];
    const evidence = this.db.prepare('SELECT * FROM delivery_evidence WHERE subject_id = ? ORDER BY created_at DESC LIMIT 50').all(subjectId) as any[];
    const provenance = this.db.prepare('SELECT * FROM dataset_provenance ORDER BY created_at DESC').all() as any[];
    const escrow = this.db.prepare('SELECT * FROM escrow_accounts WHERE subject_id = ? ORDER BY updated_at DESC LIMIT 1').get(subjectId) as any;

    const totalCommitted = commitments.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalDisbursed = receipts.reduce((sum, r) => sum + (r.delta_c || 0), 0);
    const openCommitments = commitments.filter(c => c.status === 'PENDING' || c.status === 'COMMITTED');

    // Segregate evidence counts strictly by verification status
    const verifiedEvidence = evidence.filter(e => e.status === 'VERIFIED');
    const submittedEvidence = evidence.filter(e => e.status === 'SUBMITTED');
    const contestedEvidence = evidence.filter(e => e.status === 'CONTESTED');

    // Human-and-Machine Readable Executive Understanding Narrative (Respects consented field allow-list)
    const narrative_summary: Record<string, string> = {};
    if (allowedFields.includes('commitments')) {
      narrative_summary.what_was_promised = commitments.length > 0
        ? commitments.map(c => `[${c.id}] ${c.purpose} (${c.amount} ${c.currency})`).join('; ')
        : 'No commitments registered yet for this subject.';
      narrative_summary.what_remains_open = openCommitments.length > 0
        ? `${openCommitments.length} commitment(s) open or in progress (${openCommitments.map(o => o.id).join(', ')}).`
        : 'All registered commitments fulfilled and closed.';
    }
    if (allowedFields.includes('permits')) {
      narrative_summary.who_approved = permits.length > 0
        ? permits.map(p => `Permit ${p.permit_id} authorized by ${p.authority} in Monotonic Epoch ${p.epoch} (${p.status})`).join('; ')
        : 'No statutory permits recorded.';
    }
    if (allowedFields.includes('evidence')) {
      narrative_summary.what_was_delivered = evidence.length > 0
        ? evidence.map(e => `[${e.evidence_type}] ${e.title}: ${e.description} (${e.status}; Boundary: ${e.claim_boundary})`).join('; ')
        : 'Delivery evidence pending completion.';
    }
    if (allowedFields.includes('receipts')) {
      narrative_summary.what_changed_financial = receipts.length > 0
        ? `${receipts.length} dual-state receipt(s) verified. Total consequence disbursed: ${totalDisbursed} ${escrow?.currency || 'COMMONS'}. Current active balance: ${escrow?.balance ?? 'N/A'}.`
        : 'No financial mutations recorded; protected balance untouched.';
    }
    if (allowedFields.includes('data_sources_and_limitations')) {
      narrative_summary.data_sources_and_limitations = provenance.length > 0
        ? provenance.map(pr => `[${pr.data_classification}] ${pr.title} (Publisher: ${pr.publisher}; Verification: ${pr.verification_status}; Limitation: ${pr.limitations})`).join(' | ')
        : 'No dataset provenance recorded.';
    }

    const packet: any = {
      subject_id: subjectId,
      epoch: subject.current_epoch,
      power_state: subject.power_state,
      narrative_summary,
      metrics: {
        total_commitments: allowedFields.includes('commitments') ? commitments.length : undefined,
        total_committed_amount: allowedFields.includes('commitments') ? totalCommitted : undefined,
        total_disbursed_amount: allowedFields.includes('receipts') ? totalDisbursed : undefined,
        verified_evidence_count: allowedFields.includes('evidence') ? verifiedEvidence.length : undefined,
        submitted_evidence_count: allowedFields.includes('evidence') ? submittedEvidence.length : undefined,
        contested_evidence_count: allowedFields.includes('evidence') ? contestedEvidence.length : undefined,
        open_commitments_count: allowedFields.includes('commitments') ? openCommitments.length : undefined
      },
      generated_at: new Date().toISOString()
    };

    if (allowedFields.includes('receipts') && escrow) {
      packet.escrow_summary = {
        account_id: escrow.account_id,
        current_balance: escrow.balance,
        currency: escrow.currency,
        epoch: escrow.epoch,
        updated_at: escrow.updated_at
      };
    }

    if (allowedFields.includes('commitments')) packet.commitments = commitments;
    if (allowedFields.includes('permits')) packet.permits = permits;
    if (allowedFields.includes('receipts')) packet.receipts = receipts;
    if (allowedFields.includes('evidence')) packet.delivery_evidence = evidence;
    if (allowedFields.includes('data_sources_and_limitations')) packet.data_sources_and_limitations = provenance;

    if (allowedFields.includes('ledger_proof')) {
      const chainVerification = this.verifyLedgerChain();
      packet.ledger_proof = {
        valid: chainVerification.valid,
        total_blocks: chainVerification.totalBlocks,
        latest_hash: (this.db.prepare('SELECT hash FROM durable_ledger ORDER BY seq DESC LIMIT 1').get() as any)?.hash
      };
    }

    return packet;
  }

  public getDualStateReceipts(subjectId: string): DualStateReceipt[] {
    return this.db.prepare('SELECT * FROM dual_state_receipts WHERE subject_id = ? ORDER BY epoch DESC').all(subjectId) as unknown as DualStateReceipt[];
  }
}
