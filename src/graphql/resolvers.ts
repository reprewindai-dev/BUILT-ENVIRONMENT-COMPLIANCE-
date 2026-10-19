import { GraphQLError } from 'graphql';
import {
  durableStore,
  getSigningSecret,
  createAuthToken,
  verifySignedPayload,
  AuthenticatedCaller
} from '../../server.js';

function assertCaller(context: any, allowedRoles?: ('SYSTEM_ADMIN' | 'COUNCIL_OFFICER' | 'COMMUNITY_STEWARD' | 'AUDITOR')[]): AuthenticatedCaller {
  const caller = context.caller as AuthenticatedCaller | undefined;
  if (!caller) {
    throw new GraphQLError('Authentication required: missing or invalid Bearer token', {
      extensions: { code: 'UNAUTHENTICATED', delta_c: 0 }
    });
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(caller.role)) {
    throw new GraphQLError(`Forbidden: caller role ${caller.role} lacks required permission (${allowedRoles.join(', ')})`, {
      extensions: { code: 'FORBIDDEN', delta_c: 0 }
    });
  }

  return caller;
}

export const resolvers = {
  Query: {
    understandingPacket: (_: any, args: { subjectId: string; fields?: string[] }) => {
      const allowed = args.fields && args.fields.length > 0
        ? args.fields
        : ['commitments', 'permits', 'receipts', 'evidence', 'data_sources_and_limitations', 'ledger_proof'];
      return durableStore.generateUnderstandingPacket(args.subjectId, allowed);
    },

    subject: (_: any, args: { subjectId: string }) => {
      return durableStore.getSubject(args.subjectId);
    },

    commitments: (_: any, args: { poolId?: string }) => {
      return durableStore.getCommitments(args.poolId);
    },

    escrowAccount: (_: any, args: { accountId: string }) => {
      return durableStore.getEscrow(args.accountId);
    },

    dualStateReceipts: (_: any, args: { subjectId?: string }) => {
      return durableStore.getDualStateReceipts(args.subjectId || undefined);
    },

    deliveryEvidence: (_: any, args: { commitmentId?: string; subjectId?: string }) => {
      return durableStore.getEvidence(args.commitmentId || undefined, args.subjectId || undefined);
    },

    datasetProvenance: () => {
      return durableStore.getDatasetProvenance();
    },

    ledgerChain: () => {
      return durableStore.verifyLedgerChain();
    },

    sovereignCapacityProposal: async (_: any, args: { needDescription?: string; subjectId?: string }) => {
      const need = args.needDescription || 'Community Solar Mini-Grid at Chilenje Market';
      const subjectId = args.subjectId || 'CIVIC-COMMUNITY-01';
      const subject = durableStore.getSubject(subjectId);
      const provenance = durableStore.getDatasetProvenance();

      let aiEngine = 'deterministic-capacity-heuristic';
      let llmAnalysis: string | null = null;

      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are the CivicTrust Agentic Capacity Coordinator for a community commitment pool. Analyze this local need: "${need}". Synthesize: 1) Verified local artisan trade needed, 2) Estimated mutual voucher allocation in COMMONS currency, 3) Physical milestone inspection required.`
          });
          llmAnalysis = response.text || null;
          aiEngine = 'google-genai/gemini-2.5-flash (live model)';
        } catch (err: any) {
          aiEngine = `fallback-heuristic (Gemini error: ${err.message})`;
        }
      }

      return {
        agent: 'Veklom-CivicTrust Agentic Capacity Coordinator v1.0',
        proposal_mode: 'fixture-based-proposal-with-model-synthesis',
        ai_engine: aiEngine,
        llm_analysis: llmAnalysis,
        requested_need: need,
        target_subject: subjectId,
        power_state: subject?.power_state || 'D0',
        available_pool: 'POOL-LUSAKA-SOLAR-01 (Chilenje Market Clean Energy Commons)',
        matched_artisan: 'BUILDRIGHT CONSTRUCTION LIMITED (NCC Grade C1, Registered)',
        estimated_vouchers_needed: 4000,
        currency: 'COMMONS',
        baseline_dataset: provenance[0]?.title || 'Lusaka Built Environment Baseline',
        consequence_firewall_status: 'DENIED (AI Agent cannot disburse treasury funds; requires human steward permit)',
        claim_boundary: 'Demonstration proposal based on calibrated synthetic fixtures; model provides real-time synthesis of need while matched resources are derived from calibrated demonstration fixtures.'
      };
    }
  },

  Mutation: {
    requestAuthorityToken: (_: any, args: { secret: string; callerId: string; role: any; subjectId?: string }) => {
      const systemSecret = getSigningSecret();
      if (!args.secret || args.secret !== systemSecret) {
        throw new GraphQLError('Authority token issuance denied: invalid system secret key', {
          extensions: { code: 'UNAUTHORIZED', delta_c: 0 }
        });
      }

      const token = createAuthToken({
        caller_id: args.callerId,
        role: args.role,
        subject_id: args.subjectId,
        issued_at: new Date().toISOString()
      });

      return {
        access_token: token,
        token_type: 'Bearer',
        caller_id: args.callerId,
        role: args.role,
        subject_id: args.subjectId
      };
    },

    registerSubject: (_: any, args: { subjectId: string; initialEpoch?: number; powerState?: any }, context: any) => {
      assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER']);
      durableStore.registerSubject(
        args.subjectId,
        args.initialEpoch || 1,
        args.powerState || 'D0'
      );
      return durableStore.getSubject(args.subjectId)!;
    },

    transitionPowerState: (_: any, args: { subjectId: string; targetState: any; wakeSignature?: string }, context: any) => {
      assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER']);
      const secret = getSigningSecret();
      const wakeAuth = args.wakeSignature ? { secret, signature: args.wakeSignature } : undefined;
      durableStore.transitionPowerState(args.subjectId, args.targetState, wakeAuth);
      return durableStore.getSubject(args.subjectId)!;
    },

    issueStatutoryPermit: (_: any, args: { input: any }, context: any) => {
      assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER']);
      const secret = getSigningSecret();
      const permitId = args.input.permit_id || `PMT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      return durableStore.issuePermit({
        permit_id: permitId,
        submission_id: args.input.submission_id,
        subject_id: args.input.subject_id,
        authority: args.input.authority,
        scope: args.input.scope || 'ESCROW_DISBURSE_HARMONIZED',
        policy_hash: args.input.policy_hash,
        secret
      });
    },

    disburseEscrow: (_: any, args: { input: any }, context: any) => {
      const caller = assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER', 'COMMUNITY_STEWARD']);
      const workerId = caller.role === 'SYSTEM_ADMIN' ? (args.input.worker_id || caller.caller_id) : caller.caller_id;

      if (args.input.worker_id && args.input.worker_id !== workerId && caller.role !== 'SYSTEM_ADMIN') {
        throw new GraphQLError(`Disbursement forbidden: caller (${caller.caller_id}) cannot execute on behalf of worker (${args.input.worker_id})`, {
          extensions: { code: 'FORBIDDEN', delta_c: 0 }
        });
      }

      const secret = getSigningSecret();
      const result = durableStore.disburseEscrowWithDualStateReceipt({
        operation_id: args.input.operation_id,
        account_id: args.input.account_id,
        subject_id: args.input.subject_id,
        worker_id: workerId,
        steward_permit_id: args.input.steward_permit_id,
        beneficiary_id: args.input.beneficiary_id,
        amount: Number(args.input.amount),
        currency: args.input.currency || 'COMMONS',
        policy_hash: args.input.policy_hash,
        secret
      });

      return {
        success: true,
        message: 'Disbursement executed with verified dual-state receipt',
        receipt: result.receipt,
        balance_after: result.disbursement.balance_after,
        delta_c: result.receipt.delta_c
      };
    },

    recordDeliveryEvidence: (_: any, args: { input: any }, context: any) => {
      const caller = assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER', 'COMMUNITY_STEWARD', 'AUDITOR']);
      const stewardId = caller.role === 'SYSTEM_ADMIN' ? (args.input.steward_id || caller.caller_id) : caller.caller_id;

      // Stewardship submissions default to SUBMITTED
      const status = (caller.role === 'COUNCIL_OFFICER' || caller.role === 'SYSTEM_ADMIN')
        ? (args.input.status || 'SUBMITTED')
        : 'SUBMITTED';

      return durableStore.recordEvidence({
        commitment_id: args.input.commitment_id,
        subject_id: args.input.subject_id || caller.subject_id || 'CIVIC-COMMUNITY-01',
        steward_id: stewardId,
        evidence_type: args.input.evidence_type,
        title: args.input.title,
        description: args.input.description,
        dataset_id: args.input.dataset_id,
        file_hash: args.input.file_hash,
        evidence_url: args.input.evidence_url || 'https://civictrust.network/evidence/default.pdf',
        status
      });
    },

    verifyDeliveryEvidence: (_: any, args: { evidenceId: string; notes?: string }, context: any) => {
      const caller = assertCaller(context, ['SYSTEM_ADMIN', 'COUNCIL_OFFICER', 'AUDITOR']);
      return durableStore.verifyEvidence(args.evidenceId, caller.caller_id, args.notes);
    }
  }
};
