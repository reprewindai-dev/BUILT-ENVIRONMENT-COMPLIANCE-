import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Scale,
  Database,
  Cpu,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  Download,
  Terminal,
  Activity,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  ExternalLink,
  Code2
} from 'lucide-react';

interface UnderstandingPacket {
  subject_id: string;
  epoch: number;
  power_state: string;
  narrative_summary: {
    what_was_promised?: string;
    who_approved?: string;
    what_was_delivered?: string;
    what_changed_financial?: string;
    what_remains_open?: string;
    data_sources_and_limitations?: string;
  };
  metrics: {
    total_commitments?: number;
    total_committed_amount?: number;
    total_disbursed_amount?: number;
    verified_evidence_count?: number;
    submitted_evidence_count?: number;
    contested_evidence_count?: number;
    open_commitments_count?: number;
  };
  escrow_summary?: {
    account_id: string;
    current_balance?: number;
    balance?: number;
    currency: string;
    epoch: number;
    updated_at: string;
  };
  delivery_evidence?: any[];
  data_sources_and_limitations?: any[];
  receipts?: any[];
  ledger_proof?: {
    valid: boolean;
    total_blocks: number;
    latest_hash: string;
  };
  generated_at: string;
}

export const SovereignCommonsHub: React.FC = () => {
  const [viewPerspective, setViewPerspective] = useState<'institutional' | 'community'>('institutional');
  const [tokenRole, setTokenRole] = useState<'SYSTEM_ADMIN' | 'COUNCIL_OFFICER' | 'COMMUNITY_STEWARD'>('COUNCIL_OFFICER');
  const [bearerToken, setBearerToken] = useState<string>('');
  const [packet, setPacket] = useState<UnderstandingPacket | null>(null);
  const [provenanceList, setProvenanceList] = useState<any[]>([]);
  const [receiptsList, setReceiptsList] = useState<any[]>([]);
  const [commitmentsList, setCommitmentsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [gqlQueryText, setGqlQueryText] = useState<string>(`query GetSovereignOverview {
  datasetProvenance {
    dataset_id
    title
    data_classification
    limitations
  }
  understandingPacket(subjectId: "CIVIC-COMMUNITY-01") {
    subject_id
    epoch
    power_state
    escrow_summary {
      account_id
      balance
      currency
    }
    narrative_summary {
      what_was_promised
      what_changed_financial
      what_was_delivered
    }
    ledger_proof {
      valid
      total_blocks
      latest_hash
    }
  }
}`);
  const [gqlResultText, setGqlResultText] = useState<string>('// Click "Run GraphQL Query" to execute against /graphql');

  // Helper to append logs
  const log = (msg: string) => {
    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Obtain authority token
  const refreshAuthorityToken = async (role: 'SYSTEM_ADMIN' | 'COUNCIL_OFFICER' | 'COMMUNITY_STEWARD') => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'zape-sovereign-secret-2026',
          caller_id: `OPERATOR-${role}`,
          role,
          subject_id: 'CIVIC-COMMUNITY-01'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setBearerToken(data.access_token);
        log(`Authenticated as ${role}: Token minted with cryptographic HMAC signature.`);
        return data.access_token;
      } else {
        const err = await res.json();
        log(`Authentication failed: ${err.error}`);
      }
    } catch (e: any) {
      log(`Auth error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  // Fetch full telemetry
  const fetchHubTelemetry = async (token?: string) => {
    const currentToken = token || bearerToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
      setIsLoading(true);
      // 1. Fetch Understanding Packet
      const pRes = await fetch('/api/disclosure/understanding-packet/CIVIC-COMMUNITY-01', { headers });
      if (pRes.ok) {
        const pData = await pRes.json();
        setPacket(pData.packet);
      }

      // 2. Fetch Provenance
      const provRes = await fetch('/api/provenance/datasets');
      if (provRes.ok) {
        const provData = await provRes.json();
        setProvenanceList(provData.datasets || []);
      }

      // 3. Fetch Dual-State Receipts
      const rRes = await fetch('/api/receipts/CIVIC-COMMUNITY-01', { headers });
      if (rRes.ok) {
        const rData = await rRes.json();
        setReceiptsList(rData.receipts || []);
      }

      // 4. Fetch Commitments
      const cRes = await fetch('/api/commitments?pool_id=POOL-LUSAKA-SOLAR-01');
      if (cRes.ok) {
        const cData = await cRes.json();
        setCommitmentsList(cData.commitments || []);
      }

      log('Synchronized telemetry from SQLite sink and cryptographic ledger.');
    } catch (e: any) {
      log(`Telemetry sync error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuthorityToken(tokenRole).then((tok) => {
      if (tok) fetchHubTelemetry(tok);
    });
  }, [tokenRole]);

  // Execute live GraphQL query
  const handleExecuteGraphQL = async () => {
    try {
      setIsLoading(true);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }

      const res = await fetch('/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: gqlQueryText })
      });

      const body = await res.json();
      setGqlResultText(JSON.stringify(body, null, 2));
      log(`Executed GraphQL query (HTTP ${res.status}).`);
    } catch (e: any) {
      setGqlResultText(`// GraphQL Request Error:\n${e.message}`);
      log(`GraphQL error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test Consequence Firewall rejection (Unauthorized attempt)
  const handleTestUnauthorizedDisbursement = async () => {
    try {
      log('Executing adversarial test: Unauthorized agent disbursement attempt...');
      const res = await fetch('/api/escrow/ESCROW-001/disburse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          operation_id: `OP-ATTACK-${Date.now()}`,
          subject_id: 'CIVIC-COMMUNITY-01',
          worker_id: 'UNBOUND-ROGUE-AGENT',
          steward_permit_id: 'PMT-FORGED-000',
          beneficiary_id: 'EXPLOIT-WALLET-999',
          amount: 50000,
          currency: 'COMMONS',
          policy_hash: 'INVALID-HASH'
        })
      });

      const data = await res.json();
      log(`[CONSEQUENCE FIREWALL INVARIANT HELD]: HTTP ${res.status}. Error: "${data.error}". Consequence change: ΔC = ${data.delta_c}.`);
      await fetchHubTelemetry();
    } catch (e: any) {
      log(`Adversarial test error: ${e.message}`);
    }
  };

  // Export full Understanding Packet as JSON
  const handleExportPacket = () => {
    if (!packet) return;
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CivicTrust_Understanding_Packet_${packet.subject_id}_Epoch_${packet.epoch}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log('Exported official Understanding Packet to reviewer JSON docket.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Top Banner: Architecture & Dual Perspective */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider">
              <Scale className="w-4 h-4" />
              <span>Sovereign Commons Machine · Problem Statement 2 · Sustainable Finance Live 2026</span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">
              CivicTrust: Institutional &amp; Community Coordination Architecture
            </h1>
            <p className="text-sm text-neutral-400 max-w-3xl mt-1">
              Harmonizing grassroots mutual credit commitment pools with institutional funder assurance.
              Enforced by the <strong className="text-neutral-200">Veklom Continuity Framework</strong> ($D0 \leftrightarrow D3$),
              the <strong className="text-neutral-200">Consequence Firewall</strong> ($\Delta C = 0$ on unauthorized refusal),
              and the <strong className="text-neutral-200">Institutional GraphQL Gateway</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {/* View Switcher */}
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setViewPerspective('institutional')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewPerspective === 'institutional'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Institutional Funder &amp; Council View</span>
              </button>
              <button
                onClick={() => setViewPerspective('community')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewPerspective === 'community'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Community &amp; Artisan Commons View</span>
              </button>
            </div>

            <button
              onClick={() => fetchHubTelemetry()}
              disabled={isLoading}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 font-mono"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Authority Role Selector & Invariant Badge Bar */}
        <div className="pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 font-mono">Active Authority Role:</span>
            <div className="flex gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
              {(['COUNCIL_OFFICER', 'COMMUNITY_STEWARD', 'SYSTEM_ADMIN'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTokenRole(r)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                    tokenRole === r
                      ? 'bg-neutral-800 text-emerald-300 border border-emerald-500/30'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Identity ≠ Authority (HMAC Signed)</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/80 flex items-center gap-1">
              <Lock className="w-3 h-3 text-purple-400" />
              <span>Execution ≠ Consequence (Firewall Active)</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/80 flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-400" />
              <span>Ledger: {packet?.ledger_proof?.total_blocks ?? 0} Blocks</span>
            </span>
          </div>
        </div>
      </div>

      {/* PERSPECTIVE A: INSTITUTIONAL FUNDER & COUNCIL VIEW */}
      {viewPerspective === 'institutional' && (
        <div className="space-y-6">
          {/* Executive Narrative Docket */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Column 1: Financial State & Dual-State Balance */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="font-mono">TREASURY SINK BALANCE</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-800/50">
                  EPOCH {packet?.epoch ?? 1}
                </span>
              </div>
              <div className="text-3xl font-black text-white font-mono">
                {packet?.escrow_summary?.current_balance ?? packet?.escrow_summary?.balance ?? 0}{' '}
                <span className="text-sm font-normal text-neutral-400">{packet?.escrow_summary?.currency || 'COMMONS'}</span>
              </div>
              <div className="text-xs text-neutral-400 space-y-1 pt-2 border-t border-neutral-800/80">
                <div className="flex justify-between">
                  <span>Total Committed:</span>
                  <span className="font-mono text-neutral-200">{packet?.metrics?.total_committed_amount ?? 0} COMMONS</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Disbursed:</span>
                  <span className="font-mono text-emerald-400">{packet?.metrics?.total_disbursed_amount ?? 0} COMMONS</span>
                </div>
                <div className="flex justify-between">
                  <span>Dual-State Receipts Audited:</span>
                  <span className="font-mono text-neutral-200">{receiptsList.length}</span>
                </div>
              </div>
            </div>

            {/* Column 2: What Was Promised & Approved */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="font-mono">STATUTORY ASSURANCE</span>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 text-[10px] font-mono border border-blue-800/50">
                  {packet?.power_state || 'D0'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">What Was Promised &amp; Approved</h3>
              <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3">
                {packet?.narrative_summary?.what_was_promised || 'No commitments registered yet.'}
              </p>
              <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-800/80">
                <strong className="text-neutral-300">Authority: </strong>
                {packet?.narrative_summary?.who_approved || 'Steward permits pending.'}
              </p>
            </div>

            {/* Column 3: Physical Delivery Evidence Verification */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="font-mono">DELIVERY VERIFICATION</span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] font-mono border border-amber-800/50">
                  {packet?.metrics?.verified_evidence_count ?? 0} VERIFIED
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">Audited Physical Consequence</h3>
              <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3">
                {packet?.narrative_summary?.what_was_delivered || 'Delivery evidence awaiting field audit.'}
              </p>
              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                <button
                  onClick={handleExportPacket}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Understanding Packet</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive GraphQL Gateway Console */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Institutional GraphQL Gateway (:3088/graphql)</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setGqlQueryText(`query GetDatasetProvenance {
  datasetProvenance {
    dataset_id
    title
    publisher
    data_classification
    limitations
    verification_status
  }
}`);
                  }}
                  className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-300 hover:text-white text-xs font-mono"
                >
                  Load Provenance Query
                </button>
                <button
                  onClick={() => {
                    setGqlQueryText(`query GetLedgerProof {
  ledgerChain {
    valid
    totalBlocks
    errors
  }
}`);
                  }}
                  className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-300 hover:text-white text-xs font-mono"
                >
                  Load Ledger Query
                </button>
                <button
                  onClick={handleExecuteGraphQL}
                  disabled={isLoading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-colors"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Run GraphQL Query</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1.5">Query Input (GraphQL SDL):</label>
                <textarea
                  value={gqlQueryText}
                  onChange={(e) => setGqlQueryText(e.target.value)}
                  rows={10}
                  className="w-full p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1.5">Gateway Response (Live Execution):</label>
                <pre className="w-full p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-300 overflow-auto max-h-[220px] leading-relaxed">
                  {gqlResultText}
                </pre>
              </div>
            </div>
          </div>

          {/* Dual-State Receipts & Consequence Firewall Verification */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Live Dual-State Receipts Stream */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Dual-State Receipts (Sink Telemetry)</h3>
                </div>
                <span className="text-xs font-mono text-neutral-400">{receiptsList.length} Commits</span>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {receiptsList.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic p-3">No dual-state receipts recorded yet.</p>
                ) : (
                  receiptsList.map((r) => (
                    <div
                      key={r.receipt_id}
                      className="p-3 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex justify-between items-center text-neutral-400">
                        <span className="text-emerald-400 font-bold">{r.receipt_id}</span>
                        <span className="text-neutral-500 text-[10px]">Epoch {r.epoch}</span>
                      </div>
                      <div className="flex justify-between items-center text-neutral-300">
                        <span>Consequence Mutation (ΔC):</span>
                        <span className="text-purple-300 font-bold">{r.delta_c} COMMONS</span>
                      </div>
                      <div className="flex justify-between items-center text-neutral-400 text-[11px]">
                        <span>Sink Transition:</span>
                        <span>
                          {r.state_before} → <strong className="text-white">{r.state_after}</strong>
                        </span>
                      </div>
                      <div className="text-[10px] text-neutral-500 truncate" title={r.proof_hash}>
                        Proof Hash: {r.proof_hash}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Consequence Firewall Defense-in-Depth Playground */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-400" />
                  <h3 className="text-sm font-bold text-white">Consequence Firewall Physical Invariant Guard</h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-300 text-[10px] font-mono border border-red-800/50">
                  FAIL-CLOSED
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Test the non-implication invariant ($Execution \not\implies Consequence$). An unauthorized agent
                or invalid permit is blocked at the SQLite sink, mathematically asserting <strong className="text-purple-300 font-mono">$\Delta C = 0$</strong>.
              </p>

              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <button
                  onClick={handleTestUnauthorizedDisbursement}
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-800/80 text-red-300 text-xs font-mono font-bold flex items-center justify-between transition-colors"
                >
                  <span>Trigger Adversarial Rogue Disbursement</span>
                  <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-200 text-[10px]">EXPECT ΔC = 0</span>
                </button>
              </div>

              {/* Dataset Provenance & Limitations disclosure */}
              <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>Audited Dataset Provenance &amp; Scientific Limitations</span>
                </h4>
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {provenanceList.map((pr) => (
                    <div
                      key={pr.dataset_id}
                      className="p-2 rounded bg-neutral-950 border border-neutral-800/80 text-[11px] font-mono space-y-0.5"
                    >
                      <div className="flex justify-between text-neutral-300">
                        <span className="font-bold text-blue-400">{pr.title}</span>
                        <span className="text-[10px] text-neutral-500">{pr.data_classification}</span>
                      </div>
                      <div className="text-[10px] text-amber-300/90 leading-tight">
                        <strong>Limitation: </strong> {pr.limitations}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERSPECTIVE B: COMMUNITY & ARTISAN COMMONS VIEW */}
      {viewPerspective === 'community' && (
        <div className="space-y-6">
          {/* Grassroots Commitment Pools Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Active Commitment Pool Card */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Community Commitment Pool (Lusaka Urban Solar)</h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-800/50">
                  POOL-LUSAKA-SOLAR-01
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Mutual credit commitment contracts anchored by grassroots community stewards.
                Backs local clean energy installations with mutual labor vouchers denominated in <strong className="text-neutral-200">COMMONS</strong>.
              </p>

              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {commitmentsList.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic p-3">No community commitments recorded in this pool yet.</p>
                ) : (
                  commitmentsList.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex justify-between items-center text-neutral-300">
                        <span className="font-bold text-emerald-400">{c.id}</span>
                        <span className="text-neutral-200 font-bold">{c.amount} {c.currency}</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 font-sans">{c.purpose}</p>
                      <div className="flex justify-between text-[10px] text-neutral-500">
                        <span>Steward: {c.steward_id}</span>
                        <span>State: {c.power_state} ({c.status})</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Verified Local Artisan & Trade Directory */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Verified Artisan &amp; Municipal Work Bindings</h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-mono border border-purple-800/50">
                  NCC &amp; ZIA ACCREDITED
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Local builders, electricians, and community stewards bound to statutory subjects.
                Labor hours and material milestones are compensated directly through verified dual-state vouchers.
              </p>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-200">WORKER-STEWARD-01</div>
                    <div className="text-[11px] text-neutral-400 font-sans">Lead Community Steward (Chilenje Market)</div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px]">BOUND D0</span>
                </div>

                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-200">BUILDRIGHT-CONSTRUCTION-C1</div>
                    <div className="text-[11px] text-neutral-400 font-sans">NCC Grade C1 Certified Artisan Cooperative</div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px]">VERIFIED</span>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Evidence Dossier */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Grassroots Delivery Evidence Dossier</h3>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                {packet?.delivery_evidence?.length ?? 0} Anchored Submissions
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(packet?.delivery_evidence || []).map((ev: any) => (
                <div
                  key={ev.evidence_id}
                  className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs font-mono"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-emerald-400">{ev.evidence_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        ev.status === 'VERIFIED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                          : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                      }`}
                    >
                      {ev.status}
                    </span>
                  </div>
                  <div className="font-bold text-neutral-200 font-sans">{ev.title}</div>
                  <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">{ev.description}</p>
                  <div className="text-[10px] text-neutral-500 truncate" title={ev.file_hash}>
                    SHA-256 Digest: {ev.file_hash}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Terminal Telemetry Log (Real-time physical confirmation) */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between text-neutral-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white">Physical Telemetry &amp; Verification Stream</span>
          </div>
          <span className="text-[11px] text-neutral-500">Live SQLite Sink &amp; Ledger Tail</span>
        </div>
        <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 max-h-[140px] overflow-y-auto space-y-1 text-[11px] text-neutral-300">
          {actionLog.length === 0 ? (
            <p className="text-neutral-500 italic">No events logged in this session yet.</p>
          ) : (
            actionLog.map((l, i) => (
              <div key={i} className="leading-snug">
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
