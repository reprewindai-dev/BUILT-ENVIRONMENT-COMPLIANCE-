import { spawn } from 'child_process';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

const PORT = 3088;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const testHttpDbPath = path.join(process.cwd(), 'data', 'test_http_verification.db');

if (fs.existsSync(testHttpDbPath)) {
  fs.unlinkSync(testHttpDbPath);
}

console.log('=== HTTP ENDPOINT VERIFICATION: ADVERSARIAL LIVE SUITE ===');
console.log(`Starting server on port ${PORT}...`);

const env = {
  ...process.env,
  PORT: String(PORT),
  DB_PATH: testHttpDbPath,
  JWT_SECRET: 'zape-sovereign-secret-2026',
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

    // 1. Attack: Empty Body (Missing Mandatory Fields)
    console.log('\n1. [HTTP] Testing Empty Body Attack on Escrow Disburse...');
    const emptyRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(emptyRes.status, 400);
    const emptyJson = await emptyRes.json();
    assert.strictEqual(emptyJson.error, 'MissingMandatoryFieldsError');
    console.log('   [PASS] HTTP 400: ' + emptyJson.message);

    // 2. Attack: Completely Unregistered Worker (Cold Attack)
    console.log('\n2. [HTTP] Testing Unregistered Worker Cold Attack...');
    const unregRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-UNREG-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'UNREGISTERED-ATTACKER-999',
        steward_permit_id: 'PMT-NONEXISTENT',
        beneficiary_id: 'BEN-EVIL',
        amount: 5000,
        currency: 'COMMONS',
        policy_hash: 'sha256-clean-solar-verified'
      })
    });
    assert.strictEqual(unregRes.status, 403);
    const unregJson = await unregRes.json();
    assert.strictEqual(unregJson.error, 'CrossSubjectBindingError');
    assert.strictEqual(unregJson.delta_c, 0);
    assert.strictEqual(unregJson.consequence_permission, 'DENIED');
    console.log('   [PASS] HTTP 403 Fail-Closed: ' + unregJson.message + ' (ΔC = 0)');

    // 3. Register Subject Authority
    console.log('\n3. [HTTP] Registering Subject Authority...');
    const subRes = await fetch(`${BASE_URL}/api/authority/subject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_id: 'CIVIC-HTTP-01', epoch: 1, power_state: 'D0' })
    });
    assert.strictEqual(subRes.status, 201);
    const subJson = await subRes.json();
    const activeIncarnation = subJson.active_incarnation;
    assert.ok(activeIncarnation);
    console.log('   [PASS] HTTP 201: Subject registered with incarnation: ' + activeIncarnation.substring(0, 12));

    // 3b. Record Community Commitment
    console.log('\n3b. [HTTP] Recording Community Commitment in Energy Pool...');
    const cmtRes = await fetch(`${BASE_URL}/api/commitments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'CMT-HTTP-SOLAR-01',
        pool_id: 'POOL-HTTP-SOLAR-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_id: 'WORKER-HTTP-01',
        amount: 5000,
        currency: 'COMMONS',
        purpose: '25kW Solar Mini-Grid at Chilenje Market (Labour Voucher Allocation)',
        power_state: 'D0'
      })
    });
    assert.strictEqual(cmtRes.status, 201);
    console.log('   [PASS] HTTP 201: Community Commitment CMT-HTTP-SOLAR-01 recorded.');

    // 4. Bind Worker
    console.log('\n4. [HTTP] Binding Steward Worker to Subject...');
    const bindRes = await fetch(`${BASE_URL}/api/authority/bind-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // 5. Initialize Escrow
    console.log('\n5. [HTTP] Initializing Escrow Account Sink...');
    const initEscrowRes = await fetch(`${BASE_URL}/api/escrow/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: 'ESCROW-HTTP-01',
        subject_id: 'CIVIC-HTTP-01',
        initial_balance: 30000,
        currency: 'COMMONS'
      })
    });
    assert.strictEqual(initEscrowRes.status, 201);
    console.log('   [PASS] HTTP 201: Escrow initialized with 30,000 COMMONS.');

    // 6. Attack: Non-Existent Permit
    console.log('\n6. [HTTP] Testing Non-Existent Permit Attack...');
    const fakePermitRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-FAKE-PMT-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-HTTP-01',
        steward_permit_id: 'PMT-GHOST-404',
        beneficiary_id: 'BEN-001',
        amount: 4000,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(fakePermitRes.status, 401);
    const fakePermitJson = await fakePermitRes.json();
    assert.strictEqual(fakePermitJson.error, 'InvalidPermitError');
    assert.strictEqual(fakePermitJson.delta_c, 0);
    console.log('   [PASS] HTTP 401 Fail-Closed: ' + fakePermitJson.message + ' (ΔC = 0)');

    // 7. Issue Valid Permit
    console.log('\n7. [HTTP] Issuing Valid Monotonic Statutory Permit...');
    const pmtRes = await fetch(`${BASE_URL}/api/permits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permit_id: 'PMT-HTTP-001',
        submission_id: 'SUB-HTTP-001',
        subject_id: 'CIVIC-HTTP-01',
        authority: 'CIVICTRUST_GATEWAY',
        scope: 'ESCROW_DISBURSE',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(pmtRes.status, 201);
    console.log('   [PASS] HTTP 201: Permit PMT-HTTP-001 issued with HMAC signature.');

    // 8. Attack: Policy Mismatch (Greenwashing diversion)
    console.log('\n8. [HTTP] Testing Policy Mismatch Attack...');
    const mismatchRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-MISMATCH-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-001',
        amount: 4000,
        currency: 'COMMONS',
        policy_hash: 'sha256-coal-diversion'
      })
    });
    assert.strictEqual(mismatchRes.status, 401);
    const mismatchJson = await mismatchRes.json();
    assert.strictEqual(mismatchJson.error, 'InvalidPermitError');
    assert.strictEqual(mismatchJson.delta_c, 0);
    console.log('   [PASS] HTTP 401 Fail-Closed: ' + mismatchJson.message + ' (ΔC = 0)');

    // 9. Attack: Overdraft
    console.log('\n9. [HTTP] Testing Overdraft Attack (Amount > Balance)...');
    const overdraftRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-OVERDRAFT-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-HTTP-01',
        steward_permit_id: 'PMT-HTTP-001',
        beneficiary_id: 'BEN-001',
        amount: 999999,
        currency: 'COMMONS',
        policy_hash: 'sha256-solar-verified'
      })
    });
    assert.strictEqual(overdraftRes.status, 422);
    const overdraftJson = await overdraftRes.json();
    assert.strictEqual(overdraftJson.error, 'InsufficientBalanceError');
    assert.strictEqual(overdraftJson.delta_c, 0);
    console.log('   [PASS] HTTP 422 Fail-Closed: ' + overdraftJson.message + ' (ΔC = 0)');

    // 10. Valid Governed Execution
    console.log('\n10. [HTTP] Executing Valid Disbursement of 5,000 COMMONS...');
    const validRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-HTTP-01',
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

    // 11. Idempotency Replay
    console.log('\n11. [HTTP] Testing Idempotent Replay of OP-HTTP-VALID-01...');
    const replayRes = await fetch(`${BASE_URL}/api/escrow/ESCROW-HTTP-01/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        worker_id: 'WORKER-HTTP-01',
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

    // 12. Verify Ledger Integrity
    console.log('\n12. [HTTP] Verifying Ledger Hash Chain Integrity...');
    const ledgerVerifRes = await fetch(`${BASE_URL}/api/ledger/verify`);
    assert.strictEqual(ledgerVerifRes.status, 200);
    const ledgerVerifJson = await ledgerVerifRes.json();
    assert.strictEqual(ledgerVerifJson.success, true);
    assert.strictEqual(ledgerVerifJson.verification.valid, true);
    console.log('   [PASS] HTTP 200: Ledger chain verified cryptographically (' + ledgerVerifJson.verification.totalBlocks + ' blocks).');

    // 13. Attach Delivery Evidence
    console.log('\n13. [HTTP] Attaching Physical Delivery Evidence to Completed Commitment...');
    const evdRes = await fetch(`${BASE_URL}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitment_id: 'OP-HTTP-VALID-01',
        subject_id: 'CIVIC-HTTP-01',
        steward_id: 'WORKER-HTTP-01',
        evidence_type: 'INSPECTION_REPORT',
        title: 'Chilenje Market 25kW Solar Array Commissioning Report',
        description: 'Physical inspection completed by Eng. B. Chanda. 64 Tier-1 solar panels, inverter synchronized to local micro-grid.',
        dataset_id: 'DS-ZAMBIA-SOLAR-01',
        file_hash: 'sha256-evidence-chilenje-solar-inspected-pass-2026',
        evidence_url: 'https://civictrust.network/evidence/chilenje-solar-inspection.pdf',
        status: 'VERIFIED'
      })
    });
    assert.strictEqual(evdRes.status, 201);
    const evdJson = await evdRes.json();
    assert.strictEqual(evdJson.success, true);
    assert.strictEqual(evdJson.evidence.status, 'VERIFIED');
    console.log('   [PASS] HTTP 201: Delivery evidence anchored (' + evdJson.evidence.evidence_id + ').');

    // 14. Dataset Provenance Check
    console.log('\n14. [HTTP] Querying Dataset Provenance & Limitations Layer...');
    const provRes = await fetch(`${BASE_URL}/api/provenance`);
    assert.strictEqual(provRes.status, 200);
    const provJson = await provRes.json();
    assert.ok(provJson.count >= 2);
    assert.ok(provJson.provenance[0].dataset_id);
    console.log('   [PASS] HTTP 200: Dataset provenance retrieved (' + provJson.count + ' audited datasets with explicit limitations).');

    // 15. Agentic AI Capacity Discovery & Consequence Firewall Invariant
    console.log('\n15. [HTTP] Invoking Agentic AI Capacity Coordinator & Verifying Consequence Firewall...');
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

    // 16. Institutional Understanding Packet (Bank / Funder View)
    console.log('\n16. [HTTP] Requesting Full Institutional Understanding Packet for Reviewers...');
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
    console.log('   [PASS] HTTP 200: Complete Institutional Understanding Packet successfully generated:');
    console.log('          - What Was Promised: ' + packetJson.packet.narrative_summary.what_was_promised);
    console.log('          - Who Approved:      ' + packetJson.packet.narrative_summary.who_approved);
    console.log('          - What Was Delivered:' + packetJson.packet.narrative_summary.what_was_delivered);
    console.log('          - What Changed (ΔC): ' + packetJson.packet.narrative_summary.what_changed_financial);
    console.log('          - Data Provenance:   ' + packetJson.packet.narrative_summary.data_sources_and_limitations.substring(0, 80) + '...');

    console.log('\n>>> ALL 16 HTTP RUNTIME ENDPOINT INVARIANTS VERIFIED LIVE! <<<');
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
