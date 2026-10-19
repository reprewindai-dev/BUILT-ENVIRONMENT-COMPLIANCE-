import { spawn } from 'child_process';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

const PORT = 3088;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const testHttpDbPath = path.join(process.cwd(), 'data', 'test_http_verification.db');
const SYSTEM_SECRET = 'zape-sovereign-secret-2026';

if (fs.existsSync(testHttpDbPath)) {
  fs.unlinkSync(testHttpDbPath);
}

console.log('=== HTTP ENDPOINT VERIFICATION: ADVERSARIAL LIVE SUITE ===');
console.log(`Starting server on port ${PORT}...`);

const env = {
  ...process.env,
  PORT: String(PORT),
  DB_PATH: testHttpDbPath,
  JWT_SECRET: SYSTEM_SECRET,
  NODE_ENV: 'test'
};

const serverProcess = spawn('npx', ['tsx', 'server.ts'], {
  env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverLogs = '';
serverProcess.stdout.on('data', (d) => {
  serverLogs += d.toString();
});
serverProcess.stderr.on('data', (d) => {
  serverLogs += d.toString();
});

async function waitForServer(): Promise<void> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/ledger`);
      if (res.ok) {
        console.log('Server is UP and responding to HTTP requests.');
        return;
      }
    } catch (e) {
      // wait 500ms
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  serverProcess.kill();
  throw new Error('Server failed to start in time. Logs:\n' + serverLogs);
}

async function runTests() {
  try {
    await waitForServer();

    // -------------------------------------------------------------------------
    // 1. Unauthenticated Caller Attacks (Missing & Malformed Bearer Tokens)
    // -------------------------------------------------------------------------
    console.log('\n1. [HTTP] Testing Unauthenticated Rejection (Missing Authorization Header)...');
    const noAuthRes = await fetch(`${BASE_URL}/api/authority/subject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: 'CIVIC-HTTP-01' })
    });
    assert.strictEqual(noAuthRes.status, 401);
    const noAuthJson = await noAuthRes.json();
    assert.strictEqual(noAuthJson.error, 'UnauthorizedCallerError');
    assert.strictEqual(noAuthJson.delta_c, 0);
    console.log('   [PASS] HTTP 401: Missing Bearer token rejected fail-closed.');

    console.log('\n2. [HTTP] Testing Malformed / Forged Bearer Token Attack...');
    const badTokenRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bad.forged.signature.token'
      },
      body: JSON.stringify({
        operation_id: 'OP-FORGED-TOKEN',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-01',
        steward_permit_id: 'PMT-01',
        beneficiary_id: 'BEN-01',
        amount: 1000,
        policy_hash: 'sha256-hash'
      })
    });
    assert.strictEqual(badTokenRes.status, 401);
    const badTokenJson = await badTokenRes.json();
    assert.strictEqual(badTokenJson.error, 'UnauthorizedCallerError');
    assert.strictEqual(badTokenJson.delta_c, 0);
    console.log('   [PASS] HTTP 401: Forged signature token rejected fail-closed.');

    // -------------------------------------------------------------------------
    // 2. Issue Legitimate Cryptographic Authority Tokens
    // -------------------------------------------------------------------------
    console.log('\n3. [HTTP] Minting Authenticated Authority Tokens via System Secret Gate...');
    
    // System Admin Token
    const adminTokenRes = await fetch(`${BASE_URL}/api/auth/authority-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SYSTEM_SECRET,
        caller_id: 'SYSTEM-ADMIN-01',
        role: 'SYSTEM_ADMIN'
      })
    });
    assert.strictEqual(adminTokenRes.status, 201);
    const adminToken = (await adminTokenRes.json()).access_token;
    assert.ok(adminToken);

    // Council Officer Token
    const councilTokenRes = await fetch(`${BASE_URL}/api/auth/authority-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SYSTEM_SECRET,
        caller_id: 'ENG-CHANDA-LCC',
        role: 'COUNCIL_OFFICER'
      })
    });
    assert.strictEqual(councilTokenRes.status, 201);
    const councilToken = (await councilTokenRes.json()).access_token;
    assert.ok(councilToken);

    // Community Steward Token
    const stewardTokenRes = await fetch(`${BASE_URL}/api/auth/authority-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SYSTEM_SECRET,
        caller_id: 'WORKER-HTTP-01',
        role: 'COMMUNITY_STEWARD',
        subject_id: 'CIVIC-HTTP-01'
      })
    });
    assert.strictEqual(stewardTokenRes.status, 201);
    const stewardToken = (await stewardTokenRes.json()).access_token;
    assert.ok(stewardToken);
    console.log('   [PASS] HTTP 201: Issued SYSTEM_ADMIN, COUNCIL_OFFICER, and COMMUNITY_STEWARD tokens.');

    // -------------------------------------------------------------------------
    // 3. Role Privilege Escalation Rejection
    // -------------------------------------------------------------------------
    console.log('\n4. [HTTP] Testing Privilege Escalation Attack (Steward attempting to issue statutory permit)...');
    const escalateRes = await fetch(`${BASE_URL}/api/permits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        permit_id: 'PMT-ILLEGAL-01',
        submission_id: 'SUB-01',
        subject_id: 'CIVIC-HTTP-01',
        authority: 'SELF_ISSUED_FRAUD',
        scope: 'ESCROW_DISBURSE_HARMONIZED',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(escalateRes.status, 403);
    const escalateJson = await escalateRes.json();
    assert.strictEqual(escalateJson.error, 'UnauthorizedCallerError');
    console.log('   [PASS] HTTP 403: Role boundary enforced: ' + escalateJson.message);

    // -------------------------------------------------------------------------
    // 4. Register Subject Authority & Bind Worker
    // -------------------------------------------------------------------------
    console.log('\n5. [HTTP] Registering Subject Authority (as Admin)...');
    const subRes = await fetch(`${BASE_URL}/api/authority/subject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ subject_id: 'CIVIC-HTTP-01', epoch: 1, power_state: 'D0' })
    });
    assert.strictEqual(subRes.status, 201);
    const subJson = await subRes.json();
    const activeIncarnation = subJson.active_incarnation;
    assert.ok(activeIncarnation);
    console.log('   [PASS] HTTP 201: Subject registered with incarnation: ' + activeIncarnation.substring(0, 12));

    console.log('\n5b. [HTTP] Testing Duplicate Subject Monotonic Overwrite Attack...');
    const dupSubRes = await fetch(`${BASE_URL}/api/authority/subject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ subject_id: 'CIVIC-HTTP-01', epoch: 999, power_state: 'D0' })
    });
    assert.strictEqual(dupSubRes.status, 409);
    const dupSubJson = await dupSubRes.json();
    assert.strictEqual(dupSubJson.error, 'OperationConflictError');
    console.log('   [PASS] HTTP 409: Duplicate subject registration rejected fail-closed.');

    console.log('\n6. [HTTP] Recording Community Commitment in Energy Pool...');
    const cmtRes = await fetch(`${BASE_URL}/api/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        id: 'CMT-HTTP-SOLAR-01',
        pool_id: 'POOL-HTTP-SOLAR-01',
        subject_id: 'CIVIC-HTTP-01',
        amount: 5000,
        currency: 'COMMONS',
        purpose: '25kW Solar Mini-Grid at Chilenje Market (Labour Voucher Allocation)',
        power_state: 'D0'
      })
    });
    assert.strictEqual(cmtRes.status, 201);
    console.log('   [PASS] HTTP 201: Community Commitment CMT-HTTP-SOLAR-01 recorded.');

    console.log('\n7. [HTTP] Binding Steward Worker to Subject (as Admin)...');
    const bindRes = await fetch(`${BASE_URL}/api/authority/bind-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        worker_id: 'WORKER-HTTP-01',
        subject_id: 'CIVIC-HTTP-01',
        incarnation_id: activeIncarnation,
        role: 'COMMUNITY_STEWARD',
        power_state: 'D0'
      })
    });
    assert.strictEqual(bindRes.status, 201);
    console.log('   [PASS] HTTP 201: Worker bound to subject.');

    // -------------------------------------------------------------------------
    // 5. Initialize Escrow Sink
    // -------------------------------------------------------------------------
    console.log('\n8. [HTTP] Initializing Escrow Account Sink (as Council Officer)...');
    const initEscrowRes = await fetch(`${BASE_URL}/api/escrow/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${councilToken}`
      },
      body: JSON.stringify({
        account_id: 'ESCROW-HTTP-01',
        subject_id: 'CIVIC-HTTP-01',
        initial_balance: 30000,
        currency: 'COMMONS'
      })
    });
    assert.strictEqual(initEscrowRes.status, 201);
    console.log('   [PASS] HTTP 201: Escrow initialized with 30,000 COMMONS.');

    // -------------------------------------------------------------------------
    // 6. Issue Genuine Statutory Permit PMT-HTTP-001 (as Council Officer)
    // -------------------------------------------------------------------------
    console.log('\n9. [HTTP] Issuing Valid Monotonic Statutory Permit (as Council Officer)...');
    const pmtRes = await fetch(`${BASE_URL}/api/permits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${councilToken}`
      },
      body: JSON.stringify({
        permit_id: 'PMT-HTTP-001',
        submission_id: 'SUB-HTTP-001',
        subject_id: 'CIVIC-HTTP-01',
        authority: 'CIVICTRUST_GATEWAY',
        scope: 'ESCROW_DISBURSE_HARMONIZED',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(pmtRes.status, 201);
    console.log('   [PASS] HTTP 201: Statutory permit issued under council authority.');

    // -------------------------------------------------------------------------
    // 7. Adversarial Attacks on Disbursement Sink
    // -------------------------------------------------------------------------
    console.log('\n10. [HTTP] Testing Worker Identity Spoofing Attack...');
    const spoofRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        operation_id: 'OP-SPOOF-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'IMPERSONATED-STEWARD-999', // Differs from authenticated caller WORKER-HTTP-01
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-001',
        amount: 1000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(spoofRes.status, 403);
    const spoofJson = await spoofRes.json();
    assert.strictEqual(spoofJson.error, 'UnauthorizedCallerError');
    assert.strictEqual(spoofJson.delta_c, 0);
    console.log('   [PASS] HTTP 403: Worker identity spoofing rejected: ' + spoofJson.message);

    console.log('\n11. [HTTP] Testing Negative / Non-Finite Disbursement Amount Attack...');
    const badAmtRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        operation_id: 'OP-BAD-AMT-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-001',
        amount: -5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(badAmtRes.status, 422);
    const badAmtJson = await badAmtRes.json();
    assert.strictEqual(badAmtJson.error, 'InvalidAmountError');
    assert.strictEqual(badAmtJson.delta_c, 0);
    console.log('   [PASS] HTTP 422 Fail-Closed: ' + badAmtJson.message + ' (ΔC = 0)');

    console.log('\n12. [HTTP] Testing Cross-Subject Escrow Debit Attack...');
    // Create Subject B and Steward B
    await fetch(`${BASE_URL}/api/authority/subject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ subject_id: 'CIVIC-HTTP-02', epoch: 1, power_state: 'D0' })
    });
    const subB = await (await fetch(`${BASE_URL}/api/authority/subject/CIVIC-HTTP-02`)).json();
    await fetch(`${BASE_URL}/api/authority/bind-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ worker_id: 'WORKER-HTTP-B', subject_id: 'CIVIC-HTTP-02', incarnation_id: subB.active_incarnation, role: 'COMMUNITY_STEWARD', power_state: 'D0' })
    });
    const stewardBRes = await fetch(`${BASE_URL}/api/auth/authority-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: SYSTEM_SECRET, caller_id: 'WORKER-HTTP-B', role: 'COMMUNITY_STEWARD', subject_id: 'CIVIC-HTTP-02' })
    });
    const stewardBToken = (await stewardBRes.json()).access_token;

    const permitBRes = await fetch(`${BASE_URL}/api/permits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${councilToken}` },
      body: JSON.stringify({
        permit_id: 'PMT-HTTP-B-01',
        submission_id: 'SUB-B',
        subject_id: 'CIVIC-HTTP-02',
        authority: 'CIVICTRUST_GATEWAY',
        scope: 'ESCROW_DISBURSE_HARMONIZED',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(permitBRes.status, 201);

    // Steward B attempts to disburse from ESCROW-HTTP-01 (owned by CIVIC-HTTP-01)
    const crossRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stewardBToken}` },
      body: JSON.stringify({
        operation_id: 'OP-CROSS-ATTACK-01',
        subject_id: 'CIVIC-HTTP-02',
        steward_permit_id: 'PMT-HTTP-B-01',
        beneficiary_id: 'BEN-EVIL',
        amount: 5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(crossRes.status, 403);
    const crossJson = await crossRes.json();
    assert.strictEqual(crossJson.error, 'CrossSubjectBindingError');
    assert.strictEqual(crossJson.delta_c, 0);
    console.log('   [PASS] HTTP 403: Cross-subject escrow access denied: ' + crossJson.message + ' (ΔC = 0)');

    // -------------------------------------------------------------------------
    // 8. Valid Governed Execution & Dual-State Receipt
    // -------------------------------------------------------------------------
    console.log('\n13. [HTTP] Executing Valid Disbursement of 5,000 COMMONS (as Steward)...');
    const validRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-COMMUNITY-01',
        amount: 5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(validRes.status, 200);
    const validJson = await validRes.json();
    assert.strictEqual(validJson.receipt.delta_c, 5000);
    assert.strictEqual(validJson.disbursement.balance_after, 25000);
    console.log('   [PASS] HTTP 200: Dual-State Receipt generated (ΔC = 5000, balance: 25000).');

    // -------------------------------------------------------------------------
    // 9. Idempotency & Tampered Replay Invariants
    // -------------------------------------------------------------------------
    console.log('\n14. [HTTP] Testing Idempotent Replay of OP-HTTP-VALID-01...');
    const replayRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-COMMUNITY-01',
        amount: 5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(replayRes.status, 200);
    const replayJson = await replayRes.json();
    assert.strictEqual(replayJson.receipt.receipt_id, validJson.receipt.receipt_id);
    assert.strictEqual(replayJson.disbursement.balance_after, 25000);
    console.log('   [PASS] HTTP 200 Idempotent Replay: identical receipt returned, balance unchanged at 25000.');

    console.log('\n14b. [HTTP] Testing Tampered Replay Attack (Altered Beneficiary)...');
    const tamperedReplayRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-TAMPERED-ATTACKER', // Altered
        amount: 5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(tamperedReplayRes.status, 409);
    const tamperedReplayJson = await tamperedReplayRes.json();
    assert.strictEqual(tamperedReplayJson.error, 'ReplayPayloadMismatchError');
    assert.strictEqual(tamperedReplayJson.delta_c, 0);
    console.log('   [PASS] HTTP 409: Tampered replay rejected fail-closed (ΔC = 0).');

    // -------------------------------------------------------------------------
    // 10. Delivery Evidence Segregation & Independent Audit Verification
    // -------------------------------------------------------------------------
    console.log('\n15. [HTTP] Submitting Delivery Evidence (Unverified Steward Submission)...');
    const evdRes = await fetch(`${BASE_URL}/api/evidence/attach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stewardToken}`
      },
      body: JSON.stringify({
        commitment_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        evidence_type: 'INSPECTION_REPORT',
        title: 'Chilenje Market 25kW Solar Array Commissioning Report',
        description: 'Physical inspection completed by Eng. B. Chanda. 64 Tier-1 solar panels, inverter synchronized to local micro-grid.',
        dataset_id: 'DS-ZAMBIA-SOLAR-01',
        file_hash: 'sha256-evidence-chilenje-solar-inspected-pass-2026',
        evidence_url: 'https://civictrust.network/evidence/chilenje-solar-inspection.pdf',
        status: 'VERIFIED' // Self-asserted by steward
      })
    });
    assert.strictEqual(evdRes.status, 201);
    const evdJson = await evdRes.json();
    // Since caller is COMMUNITY_STEWARD, status must be downgraded to SUBMITTED
    assert.strictEqual(evdJson.evidence.status, 'SUBMITTED', 'Steward self-asserted VERIFIED must downgrade to SUBMITTED');
    console.log('   [PASS] HTTP 201: Steward evidence anchored with SUBMITTED status: ' + evdJson.evidence.evidence_id);

    console.log('\n15b. [HTTP] Independent Verification of Evidence by Council Officer...');
    const verifyEvdRes = await fetch(`${BASE_URL}/api/evidence/${evdJson.evidence.evidence_id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${councilToken}`
      },
      body: JSON.stringify({
        notes: 'Physical on-site inspection verified and approved under Lusaka City Council planning regulations.'
      })
    });
    assert.strictEqual(verifyEvdRes.status, 200);
    const verifyEvdJson = await verifyEvdRes.json();
    assert.strictEqual(verifyEvdJson.evidence.status, 'VERIFIED');
    console.log('   [PASS] HTTP 200: Independent officer audit transitioned evidence status to VERIFIED.');

    // -------------------------------------------------------------------------
    // 11. Dataset Provenance Layer
    // -------------------------------------------------------------------------
    console.log('\n16. [HTTP] Querying Dataset Provenance & Limitations Layer...');
    const provRes = await fetch(`${BASE_URL}/api/provenance`);
    assert.strictEqual(provRes.status, 200);
    const provJson = await provRes.json();
    assert.ok(provJson.count >= 2);
    assert.ok(provJson.provenance[0].dataset_id);
    console.log('   [PASS] HTTP 200: Dataset provenance retrieved (' + provJson.count + ' audited datasets with explicit limitations).');

    // -------------------------------------------------------------------------
    // 12. Agentic AI Coordination & Consequence Firewall
    // -------------------------------------------------------------------------
    console.log('\n17. [HTTP] Invoking Agentic AI Capacity Coordinator & Verifying Consequence Firewall...');
    const agentRes = await fetch(`${BASE_URL}/api/agent/discover-capacity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        need_description: '25kW Solar Mini-Grid at Chilenje Market',
        subject_id: 'CIVIC-HTTP-01'
      })
    });
    assert.strictEqual(agentRes.status, 200);
    const agentJson = await agentRes.json();
    assert.strictEqual(agentJson.success, true);
    assert.strictEqual(agentJson.proposal.consequence_firewall.ai_permission, 'PLAN_PROPOSAL_ONLY');
    assert.ok(agentJson.proposal.consequence_firewall.consequence_authority.includes('DENIED'));
    console.log('   [PASS] HTTP 200: Agentic AI proposed coordination plan.');
    console.log('   [PASS] Invariant Verified: Execution Continuity != Consequence Authority (AI Consequence DENIED).');

    // -------------------------------------------------------------------------
    // 13. Institutional Understanding Packet & Consented Field Filtering
    // -------------------------------------------------------------------------
    console.log('\n18. [HTTP] Requesting Full Institutional Understanding Packet for Reviewers...');
    const packetRes = await fetch(`${BASE_URL}/api/disclosure/understanding-packet/CIVIC-HTTP-01`);
    assert.strictEqual(packetRes.status, 200);
    const packetJson = await packetRes.json();
    assert.strictEqual(packetJson.packet.subject_id, 'CIVIC-HTTP-01');
    assert.ok(packetJson.packet.narrative_summary.what_was_promised);
    assert.ok(packetJson.packet.narrative_summary.who_approved);
    assert.ok(packetJson.packet.narrative_summary.what_was_delivered);
    assert.ok(packetJson.packet.narrative_summary.what_changed_financial);
    assert.ok(packetJson.packet.narrative_summary.data_sources_and_limitations);
    assert.ok(packetJson.packet.delivery_evidence.length >= 1);
    assert.ok(packetJson.packet.data_sources_and_limitations.length >= 2);
    console.log('   [PASS] HTTP 200: Complete Institutional Understanding Packet successfully generated.');

    console.log('\n18b. [HTTP] Testing Consented Field Filtering (Data-Minimization Query)...');
    const minimalPacketRes = await fetch(`${BASE_URL}/api/disclosure/understanding-packet/CIVIC-HTTP-01?fields=commitments,evidence`);
    assert.strictEqual(minimalPacketRes.status, 200);
    const minimalJson = (await minimalPacketRes.json()).packet;
    assert.ok(minimalJson.commitments);
    assert.ok(minimalJson.delivery_evidence);
    assert.strictEqual(minimalJson.receipts, undefined, 'Unconsented receipts must be masked');
    assert.strictEqual(minimalJson.permits, undefined, 'Unconsented permits must be masked');
    assert.strictEqual(minimalJson.narrative_summary.who_approved, undefined, 'Unconsented who_approved must be masked');
    assert.ok(minimalJson.narrative_summary.what_was_promised);
    console.log('   [PASS] HTTP 200: Consented field filtering verified over HTTP.');

    // -------------------------------------------------------------------------
    // 14. Ledger Integrity Cryptographic Proof
    // -------------------------------------------------------------------------
    console.log('\n19. [HTTP] Verifying Ledger Hash Chain Integrity...');
    const ledgerVerifRes = await fetch(`${BASE_URL}/api/ledger/verify`);
    assert.strictEqual(ledgerVerifRes.status, 200);
    const ledgerVerifJson = await ledgerVerifRes.json();
    assert.strictEqual(ledgerVerifJson.success, true);
    assert.strictEqual(ledgerVerifJson.verification.valid, true);
    console.log('   [PASS] HTTP 200: Ledger chain verified cryptographically (' + ledgerVerifJson.verification.totalBlocks + ' blocks).');

    console.log('\n>>> ALL 20 HTTP RUNTIME ENDPOINT INVARIANTS VERIFIED LIVE! <<<');
  } finally {
    console.log('\nShutting down server process...');
    if (serverProcess.pid) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/t', '/f']);
      } else {
        serverProcess.kill();
      }
    }
  }
}

runTests().then(() => {
  setTimeout(() => process.exit(0), 500);
}).catch((err) => {
  console.error('HTTP Verification Failure:', err);
  if (serverProcess.pid && process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(serverProcess.pid), '/t', '/f']);
  } else {
    serverProcess.kill();
  }
  process.exit(1);
});
