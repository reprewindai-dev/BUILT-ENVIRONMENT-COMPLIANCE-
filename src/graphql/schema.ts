export const typeDefs = `#graphql
  enum PowerState {
    D0
    D1
    D2
    D3hot
    D3cold
  }

  enum AuthorityRole {
    SYSTEM_ADMIN
    COUNCIL_OFFICER
    COMMUNITY_STEWARD
    AUDITOR
  }

  enum EvidenceType {
    PHOTO
    INSPECTION_REPORT
    METER_READING
    WORK_COMPLETION_CERTIFICATE
    INVOICE_RECEIPT
  }

  enum EvidenceStatus {
    SUBMITTED
    VERIFIED
    CONTESTED
  }

  enum ProvenanceClassification {
    SYNTHETIC_FIXTURE
    PUBLIC_OPEN_DATA
    RESTRICTED
    COMMUNITY_VERIFIED
  }

  type Subject {
    subject_id: String!
    current_epoch: Int!
    active_incarnation: String!
    power_state: PowerState!
    updated_at: String!
  }

  type Commitment {
    id: String!
    pool_id: String!
    subject_id: String!
    steward_id: String!
    amount: Float!
    currency: String!
    purpose: String!
    power_state: PowerState!
    status: String!
    metadata_json: String!
    created_at: String!
  }

  type StatutoryPermit {
    permit_id: String!
    submission_id: String!
    subject_id: String!
    authority: String!
    scope: String!
    epoch: Int!
    incarnation_id: String!
    policy_hash: String!
    signature: String!
    status: String!
    created_at: String!
  }

  type EscrowAccount {
    account_id: String!
    subject_id: String!
    balance: Float!
    currency: String!
    epoch: Int!
    updated_at: String!
  }

  type DualStateReceipt {
    receipt_id: String!
    operation_id: String!
    subject_id: String!
    worker_id: String!
    incarnation_id: String!
    state_before: String!
    state_after: String!
    epoch: Int!
    delta_c: Float!
    proof_hash: String!
    created_at: String!
  }

  type DeliveryEvidence {
    evidence_id: String!
    commitment_id: String!
    subject_id: String!
    steward_id: String!
    evidence_type: EvidenceType!
    title: String!
    description: String!
    dataset_id: String
    file_hash: String!
    evidence_url: String!
    status: EvidenceStatus!
    claim_boundary: String!
    created_at: String!
  }

  type DatasetProvenance {
    dataset_id: String!
    title: String!
    publisher: String!
    source_url: String!
    retrieval_timestamp: String!
    snapshot_digest: String!
    permission_terms: String!
    data_classification: ProvenanceClassification!
    coverage_summary: String!
    limitations: String!
    approved_by: String!
    verification_status: String!
    created_at: String!
  }

  type NarrativeSummary {
    what_was_promised: String
    who_approved: String
    what_was_delivered: String
    what_changed_financial: String
    what_remains_open: String
    data_sources_and_limitations: String
  }

  type PacketMetrics {
    total_commitments: Int
    total_committed_amount: Float
    total_disbursed_amount: Float
    verified_evidence_count: Int
    submitted_evidence_count: Int
    contested_evidence_count: Int
    open_commitments_count: Int
  }

  type LedgerProof {
    valid: Boolean!
    total_blocks: Int!
    latest_hash: String!
  }

  type UnderstandingPacket {
    subject_id: String!
    epoch: Int!
    power_state: PowerState!
    escrow_summary: EscrowAccount
    narrative_summary: NarrativeSummary!
    metrics: PacketMetrics!
    commitments: [Commitment]
    permits: [StatutoryPermit]
    receipts: [DualStateReceipt]
    delivery_evidence: [DeliveryEvidence]
    data_sources_and_limitations: [DatasetProvenance]
    ledger_proof: LedgerProof!
    generated_at: String!
  }

  type LedgerChainVerification {
    valid: Boolean!
    totalBlocks: Int!
    errors: [String]!
  }

  type AuthTokenResponse {
    access_token: String!
    token_type: String!
    caller_id: String!
    role: AuthorityRole!
    subject_id: String
  }

  type DisburseResponse {
    success: Boolean!
    message: String!
    receipt: DualStateReceipt!
    balance_after: Float!
    delta_c: Float!
  }

  type CapacityProposal {
    agent: String!
    proposal_mode: String!
    ai_engine: String!
    llm_analysis: String
    requested_need: String!
    target_subject: String!
    power_state: PowerState!
    available_pool: String!
    matched_artisan: String!
    estimated_vouchers_needed: Float!
    currency: String!
    baseline_dataset: String!
    consequence_firewall_status: String!
    claim_boundary: String!
  }

  input PermitInput {
    permit_id: String
    submission_id: String!
    subject_id: String!
    authority: String!
    scope: String
    policy_hash: String!
  }

  input DisburseInput {
    account_id: String!
    operation_id: String!
    subject_id: String!
    worker_id: String
    steward_permit_id: String!
    beneficiary_id: String!
    amount: Float!
    currency: String
    policy_hash: String!
  }

  input EvidenceInput {
    commitment_id: String!
    subject_id: String
    evidence_type: EvidenceType!
    title: String!
    description: String!
    dataset_id: String
    file_hash: String!
    evidence_url: String
  }

  type Query {
    understandingPacket(subjectId: String!, fields: [String]): UnderstandingPacket!
    subject(subjectId: String!): Subject
    commitments(poolId: String): [Commitment!]!
    escrowAccount(accountId: String!): EscrowAccount
    dualStateReceipts(subjectId: String): [DualStateReceipt!]!
    deliveryEvidence(commitmentId: String, subjectId: String): [DeliveryEvidence!]!
    datasetProvenance: [DatasetProvenance!]!
    ledgerChain: LedgerChainVerification!
    sovereignCapacityProposal(needDescription: String, subjectId: String): CapacityProposal!
  }

  type Mutation {
    requestAuthorityToken(secret: String!, callerId: String!, role: AuthorityRole!, subjectId: String): AuthTokenResponse!
    registerSubject(subjectId: String!, initialEpoch: Int, powerState: PowerState): Subject!
    transitionPowerState(subjectId: String!, targetState: PowerState!, wakeSignature: String): Subject!
    issueStatutoryPermit(input: PermitInput!): StatutoryPermit!
    disburseEscrow(input: DisburseInput!): DisburseResponse!
    recordDeliveryEvidence(input: EvidenceInput!): DeliveryEvidence!
    verifyDeliveryEvidence(evidenceId: String!, notes: String): DeliveryEvidence!
  }
`;
