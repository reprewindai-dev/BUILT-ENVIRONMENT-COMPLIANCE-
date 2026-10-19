import {
  DurableStore,
  InvalidPermitError,
  StalePermitError,
  CrossSubjectBindingError,
  PowerStateTransitionError,
  InsufficientBalanceError
} from '../src/services/durableStore.js';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import crypto from 'crypto';

const testDbPath = path.join(process.cwd(), 'data', 'test_verification.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('=== CODEX VERIFIER PROTOCOL: PHYSICAL RUNTIME VERIFICATION ===');
console.log('=== (ZERO PRE-REGISTRATION / UNCOMPROMISING ADVERSARIAL AUDIT) ===\n');

const store = new DurableStore(testDbPath);
const secret = 'zape-sovereign-secret-2026';
const subjectId = 'CIVIC-COMMUNITY-01';
const policyHash = 'sha256-policy-clean-solar-verified';

// -------------------------------------------------------------------------
// PHASE 1: COLD ADVERSARIAL ATTACKS ON EMPTY STORE (NO PRE-REGISTRATION)
// -------------------------------------------------------------------------

console.log('1. [Adversarial] Attack with completely unregistered worker on empty database...');
let unregWorkerRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-ATTACK-01',
    account_id: 'ESCROW-NONEXISTENT',
    subject_id: subjectId,
    worker_id: 'UNREGISTERED-ATTACKER-999',
    steward_permit_id: 'PMT-NONEXISTENT',
    beneficiary_id: 'BEN-EVIL',
    amount: 10000,
    currency: 'COMMONS',
    policy_hash: policyHash,
    secret
  });
} catch (err: any) {
  if (err instanceof CrossSubjectBindingError) {
    unregWorkerRejected = true;
    console.log('   [PASS] Fail-closed: Caught typed CrossSubjectBindingError: ' + err.message);
  }
}
assert.strictEqual(unregWorkerRejected, true, 'Unregistered worker must be rejected fail-closed');

// -------------------------------------------------------------------------
// PHASE 2: INITIALIZE SUBJECT, WORKER & ESCROW
// -------------------------------------------------------------------------

console.log('\n2. Registering legitimate Subject Authority in D0 state...');
const incarnationId = store.registerSubject(subjectId, 1, 'D0');
const sub1 = store.getSubject(subjectId);
assert.strictEqual(sub1?.subject_id, subjectId);
assert.strictEqual(sub1?.current_epoch, 1);
assert.strictEqual(sub1?.power_state, 'D0');
console.log('   [PASS] Subject registered in D0 with incarnation: ' + incarnationId.substring(0, 12) + '...');

console.log('\n3. Binding legitimate Community Steward Worker & Recording Community Commitment...');
const worker1 = 'WORKER-STEWARD-01';
store.bindWorker(worker1, subjectId, incarnationId, 'COMMUNITY_STEWARD', 'D0');
console.log('   [PASS] Worker binding recorded.');

const cmt = store.createCommitment({
  id: 'CMT-SOLAR-01',
  pool_id: 'POOL-LUSAKA-SOLAR-01',
  subject_id: subjectId,
  steward_id: worker1,
  amount: 4000,
  currency: 'COMMONS',
  purpose: '25kW Solar Mini-Grid at Chilenje Market (Labour Voucher Allocation)',
  power_state: 'D0',
  status: 'COMMITTED',
  metadata_json: JSON.stringify({ contractor: 'BUILDRIGHT CONSTRUCTION LIMITED (NCC C1)' })
});
assert.strictEqual(cmt.id, 'CMT-SOLAR-01');
console.log('   [PASS] Community Commitment CMT-SOLAR-01 recorded (4,000 COMMONS in POOL-LUSAKA-SOLAR-01).');

console.log('\n4. Initializing Escrow Account Sink with 20,000 COMMONS...');
const escrow = store.getOrCreateEscrow('ESCROW-001', subjectId, 20000, 'COMMONS');
assert.strictEqual(escrow.balance, 20000);
console.log('   [PASS] Escrow account initialized with 20,000 COMMONS.');

// -------------------------------------------------------------------------
// PHASE 3: ADVERSARIAL ATTACKS AGAINST ACTIVE SINK (VERIFYING ΔC = 0)
// -------------------------------------------------------------------------

console.log('\n5. [Adversarial] Attack with non-existent permit ID...');
let noPermitRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-ATTACK-02',
    account_id: 'ESCROW-001',
    subject_id: subjectId,
    worker_id: worker1,
    steward_permit_id: 'PMT-GHOST-404',
    beneficiary_id: 'BEN-001',
    amount: 5000,
    currency: 'COMMONS',
    policy_hash: policyHash,
    secret
  });
} catch (err: any) {
  if (err instanceof InvalidPermitError) {
    noPermitRejected = true;
    console.log('   [PASS] Caught typed InvalidPermitError: ' + err.message);
  }
}
assert.strictEqual(noPermitRejected, true, 'Non-existent permit must fail closed');
assert.strictEqual(store.getOrCreateEscrow('ESCROW-001', subjectId).balance, 20000, 'Balance untouched: ΔC = 0');
console.log('   [PASS] Sink invariant verified: ΔC = 0 (Balance: 20000).');

console.log('\n6. Issuing genuine Monotonic Epoch Permit PMT-001...');
const validPermit = store.issuePermit({
  permit_id: 'PMT-001',
  submission_id: 'SUB-001',
  subject_id: subjectId,
  authority: 'CIVICTRUST_GATEWAY',
  scope: 'ESCROW_DISBURSE',
  policy_hash: policyHash,
  secret
});
assert.strictEqual(validPermit.status, 'ACTIVE');
assert.strictEqual(validPermit.epoch, 1);
console.log('   [PASS] Permit PMT-001 issued with valid cryptographic HMAC signature.');

console.log('\n7. [Adversarial] Attack with forged cryptographic HMAC signature...');
// Tamper directly in the permit table to simulate forged permit bypass
(store as any).db.prepare('UPDATE statutory_permits SET signature = ? WHERE permit_id = ?').run('000000deadbeefbadsignature000000', 'PMT-001');
let forgedSigRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-ATTACK-FORGED-SIG',
    account_id: 'ESCROW-001',
    subject_id: subjectId,
    worker_id: worker1,
    steward_permit_id: 'PMT-001',
    beneficiary_id: 'BEN-001',
    amount: 5000,
    currency: 'COMMONS',
    policy_hash: policyHash,
    secret
  });
} catch (err: any) {
  if (err instanceof InvalidPermitError) {
    forgedSigRejected = true;
    console.log('   [PASS] Caught typed InvalidPermitError: ' + err.message);
  }
}
assert.strictEqual(forgedSigRejected, true, 'Forged signature must fail closed');
assert.strictEqual(store.getOrCreateEscrow('ESCROW-001', subjectId).balance, 20000, 'Balance untouched: ΔC = 0');
console.log('   [PASS] Cryptographic sink defense verified: ΔC = 0 (Balance: 20000).');

// Restore valid signature
(store as any).db.prepare('UPDATE statutory_permits SET signature = ? WHERE permit_id = ?').run(validPermit.signature, 'PMT-001');

console.log('\n8. [Adversarial] Attack with greenwashing policy hash mismatch...');
let policyMismatchRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-ATTACK-POLICY-MISMATCH',
    account_id: 'ESCROW-001',
    subject_id: subjectId,
    worker_id: worker1,
    steward_permit_id: 'PMT-001',
    beneficiary_id: 'BEN-001',
    amount: 5000,
    currency: 'COMMONS',
    policy_hash: 'sha256-toxic-coal-unverified-greenwash',
    secret
  });
} catch (err: any) {
  if (err instanceof InvalidPermitError) {
    policyMismatchRejected = true;
    console.log('   [PASS] Caught typed InvalidPermitError: ' + err.message);
  }
}
assert.strictEqual(policyMismatchRejected, true, 'Policy hash mismatch must fail closed');
assert.strictEqual(store.getOrCreateEscrow('ESCROW-001', subjectId).balance, 20000, 'Balance untouched: ΔC = 0');
console.log('   [PASS] Green policy boundary verified: ΔC = 0 (Balance: 20000).');

console.log('\n9. [Adversarial] Attack with overdraft exceeding escrow balance...');
let overdraftRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-ATTACK-OVERDRAFT',
    account_id: 'ESCROW-001',
    subject_id: subjectId,
    worker_id: worker1,
    steward_permit_id: 'PMT-001',
    beneficiary_id: 'BEN-001',
    amount: 999999, // Exceeds 20,000 balance
    currency: 'COMMONS',
    policy_hash: policyHash,
    secret
  });
} catch (err: any) {
  if (err instanceof InsufficientBalanceError) {
    overdraftRejected = true;
    console.log('   [PASS] Caught typed InsufficientBalanceError: ' + err.message);
  }
}
assert.strictEqual(overdraftRejected, true, 'Overdraft must be rejected fail-closed');
assert.strictEqual(store.getOrCreateEscrow('ESCROW-001', subjectId).balance, 20000, 'Balance untouched: ΔC = 0');
console.log('   [PASS] Financial sink guard verified: ΔC = 0 (Balance: 20000).');

// -------------------------------------------------------------------------
// PHASE 4: VALID DISBURSEMENT & DUAL-STATE RECEIPT
// -------------------------------------------------------------------------

console.log('\n10. Executing Valid Governed Disbursement of 4,000 COMMONS...');
const opValidId = 'OP-VALID-01';
const result1 = store.disburseEscrowWithDualStateReceipt({
  operation_id: opValidId,
  account_id: 'ESCROW-001',
  subject_id: subjectId,
  worker_id: worker1,
  steward_permit_id: 'PMT-001',
  beneficiary_id: 'BEN-001',
  amount: 4000,
  currency: 'COMMONS',
  policy_hash: policyHash,
  secret
});

assert.strictEqual(result1.receipt.delta_c, 4000);
assert.strictEqual(result1.receipt.epoch, 1);
assert.ok(result1.receipt.proof_hash.length === 64);
const stateBeforeObj = JSON.parse(result1.receipt.state_before);
const stateAfterObj = JSON.parse(result1.receipt.state_after);
assert.strictEqual(stateBeforeObj.balance, 20000);
assert.strictEqual(stateAfterObj.balance, 16000);

const escrowAfterValid = store.getOrCreateEscrow('ESCROW-001', subjectId);
assert.strictEqual(escrowAfterValid.balance, 16000);
console.log('   [PASS] Dual-State Receipt verified: state_before 20000 -> state_after 16000 (ΔC = 4000).');

// -------------------------------------------------------------------------
// PHASE 5: IDEMPOTENCY REPLAY INVARIANT
// -------------------------------------------------------------------------

console.log('\n11. Testing Idempotency Boundary (Replaying OP-VALID-01)...');
const resultReplay = store.disburseEscrowWithDualStateReceipt({
  operation_id: opValidId,
  account_id: 'ESCROW-001',
  subject_id: subjectId,
  worker_id: worker1,
  steward_permit_id: 'PMT-001',
  beneficiary_id: 'BEN-001',
  amount: 4000,
  currency: 'COMMONS',
  policy_hash: policyHash,
  secret
});
assert.strictEqual(resultReplay.receipt.receipt_id, result1.receipt.receipt_id);
const escrowAfterReplay = store.getOrCreateEscrow('ESCROW-001', subjectId);
assert.strictEqual(escrowAfterReplay.balance, 16000, 'Replay must not duplicate deductions');
console.log('   [PASS] Idempotency verified: identical receipt returned, balance remains 16000.');

// -------------------------------------------------------------------------
// PHASE 6: MONOTONIC EPOCH ADVANCEMENT & RETIREMENT OF STALE PERMITS
// -------------------------------------------------------------------------

console.log('\n12. Testing Monotonic Epoch Advancement & Stale Permit Rejection...');
const permitEpoch1 = store.issuePermit({
  permit_id: 'PMT-002',
  submission_id: 'SUB-002',
  subject_id: subjectId,
  authority: 'CIVICTRUST_GATEWAY',
  scope: 'ESCROW_DISBURSE',
  policy_hash: policyHash,
  secret
});

// Advance epoch to 2
const newEpoch = store.advanceEpoch(subjectId);
assert.strictEqual(newEpoch, 2);

// Re-bind worker with new incarnation
const sub2 = store.getSubject(subjectId)!;
store.bindWorker(worker1, subjectId, sub2.active_incarnation, 'COMMUNITY_STEWARD', 'D0');

let staleRejected = false;
try {
  store.disburseEscrowWithDualStateReceipt({
    operation_id: 'OP-STALE-01',
    account_id: 'ESCROW-001',
    subject_id: subjectId,
    worker_id: worker1,
    steward_permit_id: 'PMT-002', // Issued in epoch 1, now stale
    beneficiary_id: 'BEN-001',
    amount: 1000,
    currency: 'COMMONS',
    policy_hash: policyHash,
    secret
  });
} catch (err: any) {
  if (err instanceof StalePermitError) {
    staleRejected = true;
    console.log('   [PASS] Caught typed StalePermitError: ' + err.message);
  }
}
assert.strictEqual(staleRejected, true, 'Stale permit from prior epoch must be rejected');
assert.strictEqual(store.getOrCreateEscrow('ESCROW-001', subjectId).balance, 16000, 'Balance must remain 16000');
console.log('   [PASS] Monotonic epoch boundary enforced (ΔC = 0).');

// -------------------------------------------------------------------------
// PHASE 7: LOW POWER STATE CLAMPING (D3hot/D3cold)
// -------------------------------------------------------------------------

console.log('\n13. Testing Low-Power State Consequence Clamping (D3hot)...');
store.transitionPowerState(subjectId, 'D3hot');
let d3Rejected = false;
try {
  store.createCommitment({
    id: 'CMT-D3-01',
    pool_id: 'POOL-TEST',
    subject_id: subjectId,
    steward_id: worker1,
    amount: 1000,
    currency: 'COMMONS',
    purpose: 'Attempted in D3hot',
    power_state: 'D0',
    status: 'COMMITTED',
    metadata_json: '{}'
  });
} catch (err: any) {
  if (err instanceof PowerStateTransitionError) {
    d3Rejected = true;
    console.log('   [PASS] Caught typed PowerStateTransitionError: ' + err.message);
  }
}
assert.strictEqual(d3Rejected, true, 'D3 state cannot create D0 active consequence');
console.log('   [PASS] Low-power consequence clamping verified.');

// -------------------------------------------------------------------------
// PHASE 8: DELIVERY EVIDENCE & DATASET PROVENANCE
// -------------------------------------------------------------------------

console.log('\n14. Attaching Delivery Evidence (Commissioning Report & Photos)...');
const evidenceRecord = store.recordEvidence({
  commitment_id: opValidId,
  subject_id: subjectId,
  steward_id: worker1,
  evidence_type: 'INSPECTION_REPORT',
  title: 'Chilenje Market 25kW Solar Grid Commissioning Report',
  description: 'Physical inspection completed by Eng. B. Chanda. 64 Tier-1 solar panels verified operational.',
  dataset_id: 'DS-ZAMBIA-SOLAR-01',
  file_hash: 'sha256-evidence-chilenje-solar-inspected-pass-2026',
  evidence_url: 'https://civictrust.network/evidence/chilenje-solar-inspection.pdf',
  status: 'VERIFIED'
});
assert.strictEqual(evidenceRecord.status, 'VERIFIED');
assert.ok(evidenceRecord.evidence_id.startsWith('EVD-'));
console.log('   [PASS] Delivery evidence physically anchored: ' + evidenceRecord.evidence_id);

console.log('\n15. Verifying Dataset Provenance & Limitations Audit...');
const provenanceList = store.getDatasetProvenance();
assert.ok(provenanceList.length >= 2);
assert.strictEqual(provenanceList[0].verification_status, 'APPROVED_FOR_DEMO');
console.log('   [PASS] Dataset provenance verified (' + provenanceList.length + ' registered sources with explicit limitations).');

// -------------------------------------------------------------------------
// PHASE 9: HASH-CHAIN INTEGRITY & INSTITUTIONAL UNDERSTANDING PACKET
// -------------------------------------------------------------------------

console.log('\n16. Verifying Hash-Chained SQLite Ledger Integrity...');
const chainVerification = store.verifyLedgerChain();
assert.strictEqual(chainVerification.valid, true);
assert.ok(chainVerification.totalBlocks >= 6);
console.log(`   [PASS] Ledger chain cryptographically verified: ${chainVerification.totalBlocks} consecutive blocks valid.`);

console.log('\n17. Testing Complete Institutional Understanding Packet Generation...');
const packet = store.generateUnderstandingPacket(subjectId);
assert.strictEqual(packet.subject_id, subjectId);
assert.ok(packet.receipts.length > 0);
assert.strictEqual(packet.ledger_proof.valid, true);
assert.ok(packet.narrative_summary.what_was_promised);
assert.ok(packet.narrative_summary.who_approved);
assert.ok(packet.narrative_summary.what_was_delivered);
assert.ok(packet.narrative_summary.what_changed_financial);
assert.ok(packet.delivery_evidence.length >= 1);
assert.ok(packet.data_sources_and_limitations.length >= 2);
console.log('   [PASS] Bank/Funder Understanding Packet successfully generated:');
console.log('          - What Was Promised: ' + packet.narrative_summary.what_was_promised);
console.log('          - Who Approved:      ' + packet.narrative_summary.who_approved);
console.log('          - What Was Delivered:' + packet.narrative_summary.what_was_delivered);
console.log('          - What Changed (ΔC): ' + packet.narrative_summary.what_changed_financial);
console.log('          - Dual-State Receipts Audited: ' + packet.receipts.length);
console.log('          - Latest Proof Hash: ' + packet.ledger_proof.latest_hash);

// -------------------------------------------------------------------------
// PHASE 10: FULL PROCESS RESTART & COLD-BOOT PERSISTENCE
// -------------------------------------------------------------------------

console.log('\n18. Testing Process Restart & Cold-Boot Durability (New Store Instance)...');
const restartedStore = new DurableStore(testDbPath);
const restartedSubject = restartedStore.getSubject(subjectId);
assert.strictEqual(restartedSubject?.subject_id, subjectId);
assert.strictEqual(restartedSubject?.current_epoch, 2);
const restartedEscrow = restartedStore.getOrCreateEscrow('ESCROW-001', subjectId);
assert.strictEqual(restartedEscrow.balance, 16000, 'Escrow balance must survive process restart');
const restartedChain = restartedStore.verifyLedgerChain();
assert.strictEqual(restartedChain.valid, true);
assert.ok(restartedChain.totalBlocks >= 6);
const restartedReceipts = restartedStore.getDualStateReceipts(subjectId);
assert.strictEqual(restartedReceipts.length, 1);
assert.strictEqual(restartedReceipts[0].operation_id, opValidId);
const restartedEvidence = restartedStore.getEvidence(undefined, subjectId);
assert.strictEqual(restartedEvidence.length, 1);
assert.strictEqual(restartedEvidence[0].title, 'Chilenje Market 25kW Solar Grid Commissioning Report');
console.log('   [PASS] Cold boot recovery verified: subject, epoch, escrow balance (16000), receipts, evidence, and ledger chain intact.');

console.log('\n>>> ALL 18 PHYSICAL RUNTIME INVARIANTS TESTED & VERIFIED WITH ZERO MOCKS! <<<');
