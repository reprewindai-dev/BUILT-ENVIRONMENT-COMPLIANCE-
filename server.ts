import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  DurableStore,
  InvalidPermitError,
  StalePermitError,
  CrossSubjectBindingError,
  OperationConflictError,
  PowerStateTransitionError,
  InsufficientBalanceError
} from './src/services/durableStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// Initialize SQLite durable storage engine
export const durableStore = new DurableStore(process.env.DB_PATH);

// ============================================================================
// 1. CRYPTO & SHA-256 TRUST LAYER (W3C Verifiable Credentials & HMAC Signatures)
// ============================================================================
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new InvalidPermitError('FATAL: JWT_SECRET environment variable is missing or empty. Server fails closed.');
  }
  return secret;
}

export function signPayload(payload: object): string {
  const secret = getSigningSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifySignedPayload(token: string): any | null {
  const secret = getSigningSecret();
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  if (signature !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// ============================================================================
// 2. KAFKA CLOUDEVENTS EVENT BACKBONE
// ============================================================================
export const Topics = {
  ProjectCreated: 'zape.project.created',
  VerificationCreated: 'zape.verification.created',
  ComplianceEvaluated: 'zape.compliance.evaluated',
  PassportIssued: 'zape.passport.issued',
  CouncilSubmitted: 'zape.council.submitted',
  InvoiceGenerated: 'zape.invoice.generated',
  PaymentCompleted: 'zape.payment.completed',
  CouncilDecisionMade: 'zape.council.decision',
  ContractorBound: 'zape.contractor.bound',
  InspectionRecorded: 'zape.inspection.recorded',
  OccupancyIssued: 'zape.occupancy.issued',
  WorkflowStateChanged: 'zape.workflow.state_changed'
} as const;

export interface CloudEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  time: string;
  key: string;
  data: any;
}

const eventListeners: ((event: CloudEvent) => Promise<void> | void)[] = [];
const eventLog: CloudEvent[] = [];

export async function emitCloudEvent(type: string, source: string, key: string, data: any): Promise<CloudEvent> {
  const event: CloudEvent = {
    specversion: '1.0',
    id: crypto.randomUUID(),
    source,
    type,
    time: new Date().toISOString(),
    key,
    data
  };

  eventLog.unshift(event);
  if (eventLog.length > 300) eventLog.pop(); // Keep recent 300 events

  // Dispatch to listeners (Workflow State Machine, FIWARE adapter, Audit logger)
  for (const listener of eventListeners) {
    try {
      await listener(event);
    } catch (err) {
      console.error(`[Kafka Event Dispatch Error] for topic ${type}:`, err);
    }
  }

  return event;
}

// ============================================================================
// 3. PERSISTENT IN-MEMORY & LEDGER DATABASE STORAGE
// ============================================================================
export interface LedgerBlock {
  seq: number;
  event_id: string;
  event_type: string;
  payload: any;
  previous_hash: string;
  hash: string;
  created_at: string;
}

export const DB = {
  projects: new Map<string, any>(),
  submissions: new Map<string, any>(),
  documents: new Map<string, any[]>(),
  verifications: new Map<string, any[]>(),
  compliance_evaluations: new Map<string, any[]>(),
  passports: new Map<string, any>(),
  council_cases: new Map<string, any>(),
  invoices: new Map<string, any>(),
  payments: new Map<string, any>(),
  contractor_bindings: new Map<string, any>(),
  inspections: new Map<string, any[]>(),
  occupancy_certificates: new Map<string, any>(),
  submission_states: new Map<string, any>(),
  consents: new Map<string, any>(),
  users: new Map<string, any>(),
  refresh_tokens: new Map<string, any>(),
  otp_codes: new Map<string, any>(),
  accounts: new Map<string, any>(),
  notaryRecords: [] as any[],
  ledger: [] as LedgerBlock[],
  fiware_entities: new Map<string, any>(),
  debezium_connectors: [
    {
      name: 'pacra-cdc-connector',
      status: 'RUNNING',
      server: 'pacra-legacy-postgres:5432',
      tables: ['public.companies', 'public.business_names', 'public.trademarks', 'public.industrial_designs'],
      topicPrefix: 'zape.pacra',
      lastSync: new Date().toISOString()
    },
    {
      name: 'zra-tax-cdc-connector',
      status: 'RUNNING',
      server: 'zra-customs-db:5432',
      tables: ['public.taxpayer_registry', 'public.tcc_certificates'],
      topicPrefix: 'zape.zra',
      lastSync: new Date().toISOString()
    }
  ]
};

// Seed Initial Users (Migration 002 Auth schema)
const seededUser1 = {
  id: 'USR-00000001-ZIA',
  email: 'mwansa@apexstudio.co.zm',
  phone: '0977108400',
  password_hash: sha256('Zambia@2026'),
  full_name: 'Arc. Mwansa Phiri',
  role: 'ARCHITECT',
  status: 'ACTIVE',
  zia_membership: 'ZIA-1084',
  eiz_membership: null,
  pacra_entity_id: 'PACRA-120000/2021',
  email_verified_at: '2026-01-10 08:00:00',
  phone_verified_at: '2026-01-10 08:00:00',
  failed_login_attempts: 0,
  locked_until: null,
  created_at: '2026-01-10 08:00:00',
  updated_at: '2026-10-06 01:00:00'
};
DB.users.set(seededUser1.id, seededUser1);
DB.users.set(seededUser1.email.toLowerCase(), seededUser1);
DB.users.set(seededUser1.phone, seededUser1);

const seededUser2 = {
  id: 'USR-00000002-LCC',
  email: 'planning@lcc.gov.zm',
  phone: '0977482019',
  password_hash: sha256('Zambia@2026'),
  full_name: 'Eng. B. Chanda',
  role: 'COUNCIL_OFFICER',
  status: 'ACTIVE',
  zia_membership: null,
  eiz_membership: 'EIZ-ENG-4820',
  pacra_entity_id: null,
  email_verified_at: '2026-02-15 09:30:00',
  phone_verified_at: '2026-02-15 09:30:00',
  failed_login_attempts: 0,
  locked_until: null,
  created_at: '2026-02-15 09:30:00',
  updated_at: '2026-10-05 16:20:00'
};
DB.users.set(seededUser2.id, seededUser2);
DB.users.set(seededUser2.email.toLowerCase(), seededUser2);
DB.users.set(seededUser2.phone, seededUser2);

// Seed Initial Accounts
DB.accounts.set('mwansa@apexstudio.co.zm', {
  id: 'ACC-001',
  name: 'Arc. Mwansa Phiri',
  email: 'mwansa@apexstudio.co.zm',
  role: 'architect',
  ziaNumber: 'ZIA-1084',
  nrcNumber: '719042/11/1',
  firmName: 'Apex Studio Architects Ltd',
  passwordHash: 'sha256_mock_hash_secure',
  createdAt: '2026-01-10 08:00:00',
  lastLogin: '2026-10-06 01:00:00'
});

DB.accounts.set('planning@lcc.gov.zm', {
  id: 'ACC-002',
  name: 'Eng. B. Chanda',
  email: 'planning@lcc.gov.zm',
  role: 'council',
  nrcNumber: '482019/10/1',
  firmName: 'Lusaka City Council',
  passwordHash: 'sha256_mock_hash_secure',
  createdAt: '2026-02-15 09:30:00',
  lastLogin: '2026-10-05 16:20:00'
});

// Seed Initial FIWARE Context Entity
DB.fiware_entities.set('ZAPE:Parcel:LUSAKA/100/22', {
  id: 'ZAPE:Parcel:LUSAKA/100/22',
  type: 'Parcel',
  parcelId: { value: 'LUSAKA/100/22', type: 'Text' },
  council: { value: 'LUSAKA CITY COUNCIL', type: 'Text' },
  zoning: { value: 'MEDIUM_DENSITY_RESIDENTIAL', type: 'Text' },
  floodZone: { value: false, type: 'Boolean' },
  heritageZone: { value: false, type: 'Boolean' },
  environmentalSensitiveArea: { value: false, type: 'Boolean' },
  coordinates: { value: { lat: -15.416, lng: 28.282 }, type: 'GeoProperty' }
});

// Cryptographic Ledger Append (Backed by SQLite durableStore)
export async function appendToLedger(eventType: string, payload: any): Promise<LedgerBlock> {
  const durableBlock = durableStore.appendLedgerBlock(eventType, payload);

  const block: LedgerBlock = {
    seq: durableBlock.seq,
    event_id: durableBlock.event_id,
    event_type: durableBlock.event_type,
    payload,
    previous_hash: durableBlock.previous_hash,
    hash: durableBlock.hash,
    created_at: durableBlock.created_at
  };

  DB.ledger.push(block);
  return block;
}

// ============================================================================
// 4. WORKFLOW STATE MACHINE
// ============================================================================
export async function refreshSubmissionState(submissionId: string) {
  const submission = DB.submissions.get(submissionId);
  if (!submission) return null;

  const verifs = DB.verifications.get(submissionId) || [];
  const latestVerif = (kind: string) => {
    return [...verifs].reverse().find(v => v.kind === kind);
  };

  const identity = latestVerif('IDENTITY');
  const entity = latestVerif('ENTITY');
  const professional = latestVerif('PROFESSIONAL');
  const engineering = latestVerif('ENGINEERING');
  const tax = latestVerif('TAX');
  const social = latestVerif('SOCIAL_COMPLIANCE');
  const insurance = latestVerif('INSURANCE');

  const complianceList = DB.compliance_evaluations.get(submissionId) || [];
  const compliance = complianceList[complianceList.length - 1];

  const passport = DB.passports.get(submissionId);
  const councilCase = DB.council_cases.get(submissionId);
  const invoice = DB.invoices.get(submissionId);
  const payment = DB.payments.get(submissionId);
  const contractor = DB.contractor_bindings.get(submissionId);
  const occupancy = DB.occupancy_certificates.get(submissionId);

  let status = 'DRAFT';

  if (occupancy) status = 'OCCUPANCY_ISSUED';
  else if (contractor) status = 'UNDER_CONSTRUCTION';
  else if (councilCase?.decision === 'APPROVED') status = 'PERMIT_APPROVED';
  else if (payment) status = 'PAYMENT_CONFIRMED';
  else if (invoice) status = 'INVOICE_ISSUED';
  else if (councilCase) status = 'SUBMITTED_TO_COUNCIL';
  else if (passport) status = 'PASSPORT_ISSUED';
  else if (compliance?.status === 'APPROVED_FOR_SUBMISSION') status = 'READY_FOR_SUBMISSION';
  else if (compliance?.status === 'BLOCKED') status = 'BLOCKED';
  else if (compliance) status = 'COMPLIANCE_REVIEWED';
  else if (identity?.status === 'VERIFIED' && professional?.status === 'VERIFIED' && tax?.status === 'VERIFIED')
    status = 'VERIFICATIONS_COMPLETE';
  else if (identity || entity || professional)
    status = 'VERIFICATION_IN_PROGRESS';

  const stateRecord = {
    submission_id: submissionId,
    status,
    context: {
      identity: identity?.status,
      entity: entity?.status,
      professional: professional?.status,
      engineering: engineering?.status,
      tax: tax?.status,
      social: social?.status,
      insurance: insurance?.status,
      compliance: compliance?.status,
      passport: passport?.id,
      council_case: councilCase?.council_reference,
      invoice: invoice?.id,
      payment: payment?.id,
      contractor: contractor?.id,
      occupancy: occupancy?.id
    },
    updated_at: new Date().toISOString()
  };

  DB.submission_states.set(submissionId, stateRecord);
  submission.status = status;
  submission.updated_at = new Date().toISOString();

  await emitCloudEvent(
    Topics.WorkflowStateChanged,
    'zape/workflow-service',
    submissionId,
    { submission_id: submissionId, status, context: stateRecord.context }
  );

  return stateRecord;
}

// Register Kafka Event Listener for Workflow State Machine
eventListeners.push(async (event: CloudEvent) => {
  if (event.type === Topics.WorkflowStateChanged) return; // avoid cycle
  const submissionId = event.key;
  if (submissionId && DB.submissions.has(submissionId)) {
    await refreshSubmissionState(submissionId);
  }
});

// ============================================================================
// 5. REST MICROSERVICES ENDPOINTS
// ============================================================================

// --- Health & Infrastructure Status ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    version: 'ZAPE-3.0-MVP',
    architecture: 'Event-driven Kafka + Microservices + PostGIS + FIWARE + GraphQL',
    kafkaBrokers: 'In-Process CloudEvents Bus (Active)',
    ledgerBlocks: DB.ledger.length,
    eventsStreamed: eventLog.length,
    timestamp: new Date().toISOString()
  });
});

// --- Service 1: Project Service ---
app.post('/api/projects', async (req, res) => {
  const {
    name,
    parcel_id,
    council = 'LUSAKA CITY COUNCIL',
    project_type = 'RESIDENTIAL',
    risk_level = 'MEDIUM',
    estimated_value = 8500000,
    entity_type = 'ARCHITECTURAL_FIRM',
    foreign_origin = false,
    uses_template = false,
    developer_led = false,
    requires_engineering = true,
    metadata = {}
  } = req.body;

  if (!name || !parcel_id) {
    return res.status(400).json({ error: 'Project name and parcel_id are required.' });
  }

  const projectId = `PRJ-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const submissionId = `SUB-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  const project = {
    id: projectId,
    name,
    parcel_id,
    council,
    project_type,
    risk_level,
    estimated_value: Number(estimated_value),
    entity_type,
    foreign_origin: Boolean(foreign_origin),
    uses_template: Boolean(uses_template),
    developer_led: Boolean(developer_led),
    requires_engineering: Boolean(requires_engineering),
    metadata,
    created_at: new Date().toISOString()
  };

  const submission = {
    id: submissionId,
    project_id: projectId,
    status: 'DRAFT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  DB.projects.set(projectId, project);
  DB.submissions.set(submissionId, submission);

  // Initialize empty attachments & verifications
  DB.documents.set(submissionId, [
    {
      id: `DOC-${Date.now()}-1`,
      submission_id: submissionId,
      document_type: 'ARCHITECTURAL_DRAWINGS',
      file_name: 'ARCH-A101- LusakaEcoHousing_Master.pdf',
      storage_url: `s3://zape-documents/${submissionId}/ARCH-A101.pdf`,
      sha256_hash: sha256(`ARCH-${name}-${submissionId}`),
      created_at: new Date().toISOString()
    },
    {
      id: `DOC-${Date.now()}-2`,
      submission_id: submissionId,
      document_type: 'STRUCTURAL_DRAWINGS',
      file_name: 'STRUC-S201-FoundationReinforcement.pdf',
      storage_url: `s3://zape-documents/${submissionId}/STRUC-S201.pdf`,
      sha256_hash: sha256(`STRUC-${name}-${submissionId}`),
      created_at: new Date().toISOString()
    },
    {
      id: `DOC-${Date.now()}-3`,
      submission_id: submissionId,
      document_type: 'SITE_PLAN',
      file_name: 'SITE-SP01-CadastralBeaconDiagram.pdf',
      storage_url: `s3://zape-documents/${submissionId}/SITE-SP01.pdf`,
      sha256_hash: sha256(`SITE-${parcel_id}-${submissionId}`),
      created_at: new Date().toISOString()
    }
  ]);

  await appendToLedger('PROJECT_AND_SUBMISSION_CREATED', {
    project_id: projectId,
    submission_id: submissionId,
    name,
    parcel_id
  });

  await emitCloudEvent(
    Topics.ProjectCreated,
    'zape/project-service',
    submissionId,
    { project, submission }
  );

  res.status(201).json({ project, submission });
});

app.get('/api/projects/:id', (req, res) => {
  const project = DB.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const submissions = Array.from(DB.submissions.values()).filter(s => s.project_id === project.id);
  res.json({ project, submissions });
});

app.get('/api/projects', (req, res) => {
  const list = Array.from(DB.projects.values()).map(p => {
    const sub = Array.from(DB.submissions.values()).find(s => s.project_id === p.id);
    return { ...p, current_submission: sub };
  });
  res.json({ count: list.length, projects: list });
});

app.post('/api/projects/:id/documents', (req, res) => {
  const { submission_id, document_type, file_name, storage_url, sha256_hash } = req.body;
  const docs = DB.documents.get(submission_id) || [];
  const newDoc = {
    id: `DOC-${Date.now()}`,
    submission_id,
    document_type,
    file_name,
    storage_url: storage_url || `s3://zape-documents/${submission_id}/${file_name}`,
    sha256_hash: sha256_hash || sha256(file_name + Date.now()),
    created_at: new Date().toISOString()
  };
  docs.push(newDoc);
  DB.documents.set(submission_id, docs);
  res.status(201).json(newDoc);
});

// --- Service 2: Verification Service ---
async function recordVerification(submissionId: string, kind: string, status: string, payload: any, externalReference?: string) {
  const verifs = DB.verifications.get(submissionId) || [];
  const record = {
    id: `VRF-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    kind,
    status,
    external_reference: externalReference || null,
    payload,
    created_at: new Date().toISOString()
  };
  verifs.push(record);
  DB.verifications.set(submissionId, verifs);

  await appendToLedger(`VERIFICATION_${kind}_${status}`, {
    submission_id: submissionId,
    kind,
    status,
    external_reference: externalReference
  });

  await emitCloudEvent(
    Topics.VerificationCreated,
    'zape/verification-service',
    submissionId,
    record
  );

  return record;
}

app.post('/api/verifications/identity', async (req, res) => {
  const { submission_id, nrc_number = '123456/78/9', full_name = 'MARY BANDA', consent_reference } = req.body;
  const result = {
    status: 'VERIFIED',
    full_name,
    nrc_number,
    biometric_match: true,
    timestamp: new Date().toISOString()
  };
  const v = await recordVerification(submission_id, 'IDENTITY', 'VERIFIED', result, consent_reference);
  res.status(201).json(v);
});

app.post('/api/verifications/entity', async (req, res) => {
  const { submission_id, pacra_registration_number = '120000/2021', entity_name = 'PHIRI AND ASSOCIATES' } = req.body;
  const result = {
    entity_name,
    pacra_registration_number,
    status: 'ACTIVE',
    business_name_conflict: false,
    timestamp: new Date().toISOString()
  };
  const v = await recordVerification(submission_id, 'ENTITY', 'VERIFIED', result, pacra_registration_number);
  res.status(201).json(v);
});

app.post('/api/verifications/professional', async (req, res) => {
  const { submission_id, zia_membership_number = 'ZIA-ARCH-00991', architect_name = 'JOHN PHIRI' } = req.body;
  const result = {
    membership_number: zia_membership_number,
    name: architect_name,
    registration_status: 'ACTIVE',
    cpd_status: 'COMPLIANT',
    disciplinary_status: 'NONE',
    expiry_date: '2027-03-31'
  };
  const v = await recordVerification(submission_id, 'PROFESSIONAL', 'VERIFIED', result, zia_membership_number);
  res.status(201).json(v);
});

app.post('/api/verifications/engineer', async (req, res) => {
  const { submission_id, eiz_membership_number = 'EIZ-ENG-4471', engineer_name = 'GRACE MWILA', discipline = 'STRUCTURAL_ENGINEERING' } = req.body;
  const result = {
    membership_number: eiz_membership_number,
    name: engineer_name,
    status: 'ACTIVE',
    discipline,
    cpd_status: 'COMPLIANT',
    disciplinary_status: 'NONE'
  };
  const v = await recordVerification(submission_id, 'ENGINEERING', 'VERIFIED', result, eiz_membership_number);
  res.status(201).json(v);
});

app.post('/api/verifications/tax', async (req, res) => {
  const { submission_id, tpin = '1002003004' } = req.body;
  const result = {
    tpin,
    tax_clearance_status: 'ACTIVE',
    certificate_expiry: '2026-12-31'
  };
  const v = await recordVerification(submission_id, 'TAX', 'VERIFIED', result, tpin);
  res.status(201).json(v);
});

app.post('/api/verifications/social', async (req, res) => {
  const { submission_id, napsa_number = 'NAPSA-998877', workers_comp_number = 'WC-554433' } = req.body;
  const result = {
    napsa_status: 'COMPLIANT',
    workers_comp_status: 'ACTIVE',
    napsa_number,
    workers_comp_number
  };
  const v = await recordVerification(submission_id, 'SOCIAL_COMPLIANCE', 'VERIFIED', result, `${napsa_number}/${workers_comp_number}`);
  res.status(201).json(v);
});

app.post('/api/verifications/insurance', async (req, res) => {
  const { submission_id, policy_number = 'PII-2026-8891' } = req.body;
  const result = {
    policy_number,
    status: 'ACTIVE',
    cover_amount: 'ZMW 5,000,000',
    expiry_date: '2026-12-31'
  };
  const v = await recordVerification(submission_id, 'INSURANCE', 'VERIFIED', result, policy_number);
  res.status(201).json(v);
});

app.post('/api/verifications/template', async (req, res) => {
  const { submission_id, template_id = 'TPL-AFFORDABLE-2026', licensee_id = 'LIC-991', site_adaptation_certificate = true } = req.body;
  const result = {
    template_id,
    licensee_id,
    type_approval_status: 'APPROVED',
    license_status: 'VALID',
    site_adaptation_certificate
  };
  const v = await recordVerification(submission_id, 'TEMPLATE', site_adaptation_certificate ? 'VERIFIED' : 'FAILED', result, template_id);
  res.status(201).json(v);
});

app.post('/api/verifications/foreign', async (req, res) => {
  const { submission_id, foreign_firm_id = 'FOR-DUBAI-01', local_adopting_architect_id = 'ARC-001', localization_report = true, material_equivalency_certificate = true } = req.body;
  const isOk = local_adopting_architect_id && localization_report && material_equivalency_certificate;
  const result = {
    foreign_firm_id,
    local_adopting_architect_id,
    localization_report,
    material_equivalency_certificate,
    foreign_permit_status: 'ACTIVE'
  };
  const v = await recordVerification(submission_id, 'FOREIGN_DESIGN', isOk ? 'VERIFIED' : 'FAILED', result, foreign_firm_id);
  res.status(201).json(v);
});

app.post('/api/verifications/developer', async (req, res) => {
  const { submission_id, developer_pacra_id = 'DEV-99120', registered_architectural_firm_link = 'FIRM-001', professional_independence_declaration = true, conflict_of_interest_score = 0.12 } = req.body;
  const isOk = registered_architectural_firm_link && professional_independence_declaration && conflict_of_interest_score <= 0.7;
  const result = {
    developer_pacra_id,
    registered_architectural_firm_link,
    professional_independence_declaration,
    conflict_of_interest_score
  };
  const v = await recordVerification(submission_id, 'DEVELOPER_GOVERNANCE', isOk ? 'VERIFIED' : 'FAILED', result, developer_pacra_id);
  res.status(201).json(v);
});

// --- Service 3: Compliance Engine ---
app.post('/api/compliance/evaluate/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const submission = DB.submissions.get(submissionId);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const project = DB.projects.get(submission.project_id);
  const verifs = DB.verifications.get(submissionId) || [];
  const latestVerif = (kind: string) => [...verifs].reverse().find(v => v.kind === kind);

  const hardBlocks: string[] = [];
  const warnings: string[] = [];
  const tasks: string[] = [];

  const identity = latestVerif('IDENTITY');
  const entity = latestVerif('ENTITY');
  const professional = latestVerif('PROFESSIONAL');
  const engineering = latestVerif('ENGINEERING');
  const tax = latestVerif('TAX');
  const social = latestVerif('SOCIAL_COMPLIANCE');
  const insurance = latestVerif('INSURANCE');
  const template = latestVerif('TEMPLATE');
  const foreign = latestVerif('FOREIGN_DESIGN');
  const developer = latestVerif('DEVELOPER_GOVERNANCE');

  if (!identity || identity.status !== 'VERIFIED') hardBlocks.push('Client identity verification missing or failed.');
  if (project?.entity_type && ['REAL_ESTATE_DEVELOPER', 'ARCHITECTURAL_FIRM', 'MULTIDISCIPLINARY_FIRM'].includes(project.entity_type)) {
    if (!entity || entity.status !== 'VERIFIED') hardBlocks.push('PACRA entity verification missing or failed.');
  }
  if (!professional || professional.status !== 'VERIFIED') hardBlocks.push('Lead architect ZIA verification missing or failed.');
  if (project?.requires_engineering && (!engineering || engineering.status !== 'VERIFIED')) hardBlocks.push('Engineering EIZ verification missing or failed.');
  if (!tax || tax.status !== 'VERIFIED') hardBlocks.push('ZRA Tax clearance verification missing or failed.');
  if (!social || social.status !== 'VERIFIED') hardBlocks.push('NAPSA / Workers Compensation verification missing or failed.');
  if (!insurance || insurance.status !== 'VERIFIED') hardBlocks.push('Professional indemnity insurance verification missing or failed.');

  if (project?.uses_template && (!template || template.status !== 'VERIFIED')) hardBlocks.push('Template license or site adaptation verification failed.');
  if (project?.foreign_origin && (!foreign || foreign.status !== 'VERIFIED')) hardBlocks.push('Foreign design localization verification failed.');
  if (project?.developer_led && (!developer || developer.status !== 'VERIFIED')) hardBlocks.push('Developer corporate governance verification failed.');

  const score = hardBlocks.length === 0 ? 100 : Math.max(0, 100 - hardBlocks.length * 15);
  const status = hardBlocks.length > 0 ? 'BLOCKED' : tasks.length > 0 ? 'REMEDIATE' : 'APPROVED_FOR_SUBMISSION';

  const evaluation = {
    id: `EVAL-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    status,
    score,
    hard_blocks: hardBlocks,
    warnings,
    tasks,
    created_at: new Date().toISOString()
  };

  const evalList = DB.compliance_evaluations.get(submissionId) || [];
  evalList.push(evaluation);
  DB.compliance_evaluations.set(submissionId, evalList);

  await appendToLedger(`COMPLIANCE_EVALUATION_${status}`, {
    submission_id: submissionId,
    status,
    score,
    hard_blocks_count: hardBlocks.length
  });

  await emitCloudEvent(
    Topics.ComplianceEvaluated,
    'zape/compliance-service',
    submissionId,
    evaluation
  );

  res.json(evaluation);
});

// --- Service 4: Submission Passport Service ---
app.post('/api/passports/issue/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const submission = DB.submissions.get(submissionId);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const evalList = DB.compliance_evaluations.get(submissionId) || [];
  const latestCompliance = evalList[evalList.length - 1];

  if (!latestCompliance || latestCompliance.status !== 'APPROVED_FOR_SUBMISSION') {
    return res.status(400).json({ error: 'Compliance evaluation not approved for submission.' });
  }

  const project = DB.projects.get(submission.project_id);
  const docs = DB.documents.get(submissionId) || [];
  const verifs = DB.verifications.get(submissionId) || [];

  const passportId = `ZAPE-2026-LCC-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;
  const qrUrl = `/verify/${submissionId}`;

  const passportPayload = {
    passport_id: passportId,
    passport_version: 'ZAPE-3.0',
    submission_id: submissionId,
    project,
    documents: docs.map(d => ({ id: d.id, type: d.document_type, sha256_hash: d.sha256_hash })),
    verifications: verifs,
    compliance: latestCompliance,
    issued_at: new Date().toISOString()
  };

  const hash = sha256(JSON.stringify(passportPayload));
  const signature = signPayload({ hash, submissionId, passportId });

  const passportRecord = {
    id: passportId,
    submission_id: submissionId,
    project_id: project.id,
    passport_json: passportPayload,
    sha256_hash: hash,
    signature,
    qr_url: qrUrl,
    created_at: new Date().toISOString()
  };

  DB.passports.set(submissionId, passportRecord);

  await appendToLedger('SUBMISSION_PASSPORT_ISSUED', {
    passport_id: passportId,
    submission_id: submissionId,
    hash,
    signature
  });

  await emitCloudEvent(
    Topics.PassportIssued,
    'zape/passport-service',
    submissionId,
    passportRecord
  );

  res.status(201).json({ passport: passportRecord, signature, qrUrl });
});

app.get('/api/public/passports/:submissionId', (req, res) => {
  const passport = DB.passports.get(req.params.submissionId);
  if (!passport) return res.status(404).json({ error: 'Passport not found' });
  res.json({
    passport_id: passport.id,
    submission_id: passport.submission_id,
    project_id: passport.project_id,
    sha256_hash: passport.sha256_hash,
    signature: passport.signature,
    qr_url: passport.qr_url,
    issued_at: passport.created_at,
    summary: passport.passport_json
  });
});

// --- Service 5: Council Gateway Service ---
app.post('/api/council/submit/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const passport = DB.passports.get(submissionId);
  if (!passport) return res.status(400).json({ error: 'No passport found for submission.' });

  const councilReference = `LCC-BP-${Date.now()}`;
  const councilCase = {
    id: `CASE-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    passport_id: passport.id,
    council_reference: councilReference,
    status: 'RECEIVED',
    created_at: new Date().toISOString()
  };

  DB.council_cases.set(submissionId, councilCase);

  await appendToLedger('COUNCIL_CASE_SUBMITTED', {
    submission_id: submissionId,
    council_reference: councilReference,
    passport_id: passport.id
  });

  await emitCloudEvent(
    Topics.CouncilSubmitted,
    'zape/council-service',
    submissionId,
    councilCase
  );

  res.status(201).json(councilCase);
});

app.post('/api/council/decision', async (req, res) => {
  const { submission_id, decision = 'APPROVED', conditions = [] } = req.body;
  const councilCase = DB.council_cases.get(submission_id);
  if (!councilCase) return res.status(404).json({ error: 'Council case not found' });

  councilCase.decision = decision;
  councilCase.conditions = conditions;
  councilCase.status = 'DECIDED';
  councilCase.decided_at = new Date().toISOString();

  await appendToLedger('COUNCIL_DECISION_ISSUED', {
    submission_id,
    decision,
    conditions_count: conditions.length
  });

  await emitCloudEvent(
    Topics.CouncilDecisionMade,
    'zape/council-service',
    submission_id,
    councilCase
  );

  res.json(councilCase);
});

// --- Service 6: Payment Service ---
app.post('/api/payments/invoice/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const councilCase = DB.council_cases.get(submissionId);
  if (!councilCase) return res.status(400).json({ error: 'No council case found.' });

  const lineItems = [
    { item: 'BUILDING_PERMIT_FEE', amount: 21000, beneficiary: 'LUSAKA CITY COUNCIL' },
    { item: 'NCC_CONSTRUCTION_LEVY', amount: 4500, beneficiary: 'NATIONAL COUNCIL FOR CONSTRUCTION' },
    { item: 'ZIA_STATUTORY_LEVY', amount: 1500, beneficiary: 'ZAMBIA INSTITUTE OF ARCHITECTS' },
    { item: 'EIZ_STATUTORY_LEVY', amount: 1500, beneficiary: 'ENGINEERING INSTITUTION OF ZAMBIA' }
  ];

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const invoice = {
    id: `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
    submission_id: submissionId,
    council_case_id: councilCase.id,
    currency: 'ZMW',
    total_amount: total,
    status: 'ISSUED',
    line_items: lineItems,
    created_at: new Date().toISOString()
  };

  DB.invoices.set(submissionId, invoice);

  await appendToLedger('STATUTORY_INVOICE_GENERATED', {
    invoice_id: invoice.id,
    submission_id: submissionId,
    total_amount: total,
    currency: 'ZMW'
  });

  await emitCloudEvent(
    Topics.InvoiceGenerated,
    'zape/payment-service',
    submissionId,
    invoice
  );

  res.status(201).json(invoice);
});

app.post('/api/payments/simulate', async (req, res) => {
  try {
    const { invoice_id, method = 'MOBILE_MONEY', idempotency_key } = req.body;
    if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required' });

    const invoice = Array.from(DB.invoices.values()).find(i => i.id === invoice_id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Enforce idempotency: if already paid, fail closed or return cached receipt without double settlement
    if (invoice.status === 'PAID') {
      const existingPayment = DB.payments.get(invoice.submission_id);
      return res.status(200).json({
        message: 'Invoice already settled. Idempotency preserved (ΔC = 0).',
        payment: existingPayment
      });
    }

    const payment = {
      id: `PAY-${Date.now()}`,
      invoice_id: invoice.id,
      submission_id: invoice.submission_id,
      payment_reference: idempotency_key || `ZAPE-TXN-${Date.now()}`,
      amount: invoice.total_amount,
      currency: 'ZMW',
      method,
      status: 'COMPLETED',
      created_at: new Date().toISOString()
    };

    DB.payments.set(invoice.submission_id, payment);
    invoice.status = 'PAID';

    await appendToLedger('STATUTORY_PAYMENT_SETTLED', {
      payment_id: payment.id,
      invoice_id: invoice.id,
      amount: payment.amount,
      method,
      idempotency_key
    });

    await emitCloudEvent(
      Topics.PaymentCompleted,
      'zape/payment-service',
      invoice.submission_id,
      payment
    );

    res.status(201).json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// DURABLE SERVER ENDPOINTS (COMMUNITY COMMITMENTS, PERMITS, ESCROW & DISCLOSURE)
// Governed by Veklom Continuity Framework & Fail-Closed Invariants
// ============================================================================

// Register or query Subject Authority & Power State (D0-D3)
app.post('/api/authority/subject', (req, res) => {
  try {
    const { subject_id = 'CIVIC-COMMUNITY-01', initial_epoch = 1, power_state = 'D0' } = req.body;
    const activeIncarnation = durableStore.registerSubject(subject_id, initial_epoch, power_state);
    res.status(201).json({
      subject_id,
      epoch: initial_epoch,
      power_state,
      active_incarnation: activeIncarnation,
      registered_at: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

app.get('/api/authority/subject/:subjectId', (req, res) => {
  const subject = durableStore.getSubject(req.params.subjectId);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });
  res.json(subject);
});

// Power State Governance Transition (D0 <-> D1/D2 <-> D3)
app.post('/api/authority/power-state', (req, res) => {
  try {
    const { subject_id, target_state } = req.body;
    if (!subject_id || !target_state) {
      return res.status(400).json({ error: 'subject_id and target_state are required' });
    }
    durableStore.transitionPowerState(subject_id, target_state);
    res.json({
      success: true,
      subject_id,
      target_state,
      transitioned_at: new Date().toISOString()
    });
  } catch (err: any) {
    const statusCode = err.name === 'PowerStateTransitionError' ? 409 : 400;
    res.status(statusCode).json({ error: err.name, message: err.message });
  }
});

// Monotonic Epoch Advancement (Permit Retirement & Invalidation)
app.post('/api/authority/advance-epoch', (req, res) => {
  try {
    const { subject_id } = req.body;
    if (!subject_id) return res.status(400).json({ error: 'subject_id is required' });
    const newEpoch = durableStore.advanceEpoch(subject_id);
    res.json({
      success: true,
      subject_id,
      new_epoch: newEpoch,
      message: 'All previous epoch permits retired. Consequence boundary updated.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

// Worker Binding Endpoint (Worker In Subject)
app.post('/api/authority/bind-worker', (req, res) => {
  try {
    const { worker_id, subject_id, incarnation_id, role = 'COMMUNITY_STEWARD', power_state = 'D0' } = req.body;
    if (!worker_id || !subject_id || !incarnation_id) {
      return res.status(400).json({ error: 'worker_id, subject_id, and incarnation_id are required' });
    }
    durableStore.bindWorker(worker_id, subject_id, incarnation_id, role, power_state);
    res.status(201).json({
      success: true,
      worker_id,
      subject_id,
      incarnation_id,
      role,
      power_state
    });
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

// Commitments: Create & Read Durable Community Commitment Pools
app.post('/api/commitments', (req, res) => {
  try {
    const {
      pool_id = 'POOL-SFLIVE-001',
      subject_id = 'CIVIC-COMMUNITY-01',
      steward_id = 'STEWARD-001',
      amount = 5000,
      currency = 'COMMONS',
      purpose = 'Community Solar Microgrid Installation',
      power_state = 'D0',
      status = 'COMMITTED',
      metadata = {}
    } = req.body;

    const commitment = durableStore.createCommitment({
      id: `CMT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      pool_id,
      subject_id,
      steward_id,
      amount: Number(amount),
      currency,
      purpose,
      power_state,
      status,
      metadata_json: JSON.stringify(metadata)
    });

    res.status(201).json(commitment);
  } catch (err: any) {
    const status = err.name === 'PowerStateTransitionError' ? 403 : 400;
    res.status(status).json({ error: err.name, message: err.message });
  }
});

app.get('/api/commitments', (req, res) => {
  const poolId = req.query.pool_id as string | undefined;
  const list = durableStore.getCommitments(poolId);
  res.json({ count: list.length, commitments: list });
});

// Statutory Permits: Issue Cryptographically Signed Monotonic Epoch Permit
app.post('/api/permits', (req, res) => {
  try {
    const {
      submission_id = 'SUB-COMMUNITY-01',
      subject_id = 'CIVIC-COMMUNITY-01',
      authority = 'CIVICTRUST_COUNCIL_GATEWAY',
      scope = 'ESCROW_DISBURSE_HARMONIZED',
      policy_hash = sha256('POLICY-CIVICTRUST-ZAPE-PASS')
    } = req.body;

    const permitId = req.body.permit_id || `PMT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const secret = getSigningSecret();

    const permit = durableStore.issuePermit({
      permit_id: permitId,
      submission_id,
      subject_id,
      authority,
      scope,
      policy_hash,
      secret
    });

    res.status(201).json(permit);
  } catch (err: any) {
    const status = err.name === 'PowerStateTransitionError' ? 403 : 400;
    res.status(status).json({ error: err.name, message: err.message });
  }
});

// Escrow Setup
app.post('/api/escrow/init', (req, res) => {
  try {
    const { account_id = 'ESCROW-CIVIC-01', subject_id = 'CIVIC-COMMUNITY-01', initial_balance = 50000, currency = 'COMMONS' } = req.body;
    const account = durableStore.getOrCreateEscrow(account_id, subject_id, Number(initial_balance), currency);
    res.status(201).json(account);
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

// FAIL-CLOSED ESCROW DISBURSEMENT (ΔC = 0 Gate with Dual-State Cryptographic Receipt)
app.post('/api/escrow/:id/disburse', (req, res) => {
  try {
    const accountId = req.params.id;
    const {
      operation_id,
      subject_id,
      worker_id,
      steward_permit_id,
      beneficiary_id,
      amount,
      currency = 'COMMONS',
      policy_hash
    } = req.body;

    if (!operation_id || !subject_id || !worker_id || !steward_permit_id || !beneficiary_id || !amount || !policy_hash) {
      return res.status(400).json({
        error: 'MissingMandatoryFieldsError',
        message: 'Disbursement rejected: operation_id, subject_id, worker_id, steward_permit_id, beneficiary_id, amount, and policy_hash are strictly mandatory. ΔC = 0.'
      });
    }

    const secret = getSigningSecret();

    const result = durableStore.disburseEscrowWithDualStateReceipt({
      operation_id,
      account_id: accountId,
      subject_id,
      worker_id,
      steward_permit_id,
      beneficiary_id,
      amount: Number(amount),
      currency,
      policy_hash,
      secret
    });

    res.status(200).json({
      success: true,
      message: 'Escrow disbursed through verified consequence sink with dual-state receipt.',
      receipt: result.receipt,
      disbursement: result.disbursement
    });
  } catch (err: any) {
    let statusCode = 400;
    if (err.name === 'CrossSubjectBindingError') statusCode = 403;
    else if (err.name === 'PowerStateTransitionError') statusCode = 403;
    else if (err.name === 'StalePermitError') statusCode = 409;
    else if (err.name === 'InsufficientBalanceError') statusCode = 422;
    else if (err.name === 'InvalidPermitError') statusCode = 401;

    res.status(statusCode).json({
      error: err.name,
      message: err.message,
      delta_c: 0,
      consequence_permission: 'DENIED'
    });
  }
});

// Institutional Disclosure Query ("Understanding Packet" for Banks & Regulators)
app.get('/api/disclosure/understanding-packet/:subjectId', (req, res) => {
  try {
    const subjectId = req.params.subjectId;
    const fields = req.query.fields
      ? (req.query.fields as string).split(',')
      : ['commitments', 'permits', 'receipts', 'evidence', 'data_sources_and_limitations', 'ledger_proof'];
    const packet = durableStore.generateUnderstandingPacket(subjectId, fields);
    res.json({
      success: true,
      packet
    });
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

// --- Delivery Evidence Layer (Layer 4) ---
app.post('/api/evidence/attach', (req, res) => {
  try {
    const {
      commitment_id,
      subject_id = 'CIVIC-COMMUNITY-01',
      steward_id = 'WORKER-STEWARD-01',
      evidence_type = 'INSPECTION_REPORT',
      title,
      description,
      dataset_id,
      file_hash,
      evidence_url = 'https://civictrust.network/evidence/default.pdf',
      status = 'VERIFIED'
    } = req.body;

    if (!commitment_id || !title || !description || !file_hash) {
      return res.status(400).json({
        error: 'MissingMandatoryEvidenceFields',
        message: 'commitment_id, title, description, and file_hash are required.'
      });
    }

    const record = durableStore.recordEvidence({
      commitment_id,
      subject_id,
      steward_id,
      evidence_type,
      title,
      description,
      dataset_id,
      file_hash,
      evidence_url,
      status
    });

    res.status(201).json({
      success: true,
      message: 'Delivery evidence anchored into durable ledger.',
      evidence: record
    });
  } catch (err: any) {
    res.status(400).json({ error: err.name, message: err.message });
  }
});

app.get('/api/evidence', (req, res) => {
  const commitmentId = req.query.commitment_id as string | undefined;
  const subjectId = req.query.subject_id as string | undefined;
  const list = durableStore.getEvidence(commitmentId, subjectId);
  res.json({ count: list.length, evidence: list });
});

// --- Dataset Provenance Layer ---
app.get('/api/provenance', (req, res) => {
  const list = durableStore.getDatasetProvenance();
  res.json({ count: list.length, provenance: list });
});

// --- Agentic AI Capacity Discovery & Coordination Service ---
// Applies Skill 2.0 Invariant 2: ExecutionContinuity != ConsequenceAuthority
app.post('/api/agent/discover-capacity', (req, res) => {
  const { need_description = 'Community Solar Installation', subject_id = 'CIVIC-COMMUNITY-01' } = req.body;

  const subject = durableStore.getSubject(subject_id);
  const commitments = durableStore.getCommitments('POOL-LUSAKA-SOLAR-01');
  const provenance = durableStore.getDatasetProvenance();

  const proposal = {
    agent: 'Veklom-CivicTrust Agentic Capacity Coordinator v1.0',
    requested_need: need_description,
    target_subject: subject_id,
    power_state: subject?.power_state || 'D0',
    discovered_resources: {
      available_pool: 'POOL-LUSAKA-SOLAR-01 (Chilenje Market Clean Energy Commons)',
      matched_artisan: 'BUILDRIGHT CONSTRUCTION LIMITED (NCC Grade C1, Registered)',
      estimated_vouchers_needed: 4000,
      currency: 'COMMONS',
      baseline_dataset: provenance[0]?.title || 'Lusaka Built Environment Baseline',
      required_policy_hash: 'sha256-policy-clean-solar-verified'
    },
    consequence_firewall: {
      invariant: 'Identity Continuity != Authority Continuity; Execution Continuity != Consequence Authority',
      ai_permission: 'PLAN_PROPOSAL_ONLY',
      consequence_authority: 'DENIED (AI Agent cannot disburse treasury funds)',
      required_next_step: 'Human Community Steward must inspect plan and issue cryptographically signed statutory permit'
    },
    recommended_plan: [
      { step: 1, action: 'Register Community Commitment in POOL-LUSAKA-SOLAR-01', amount: 4000 },
      { step: 2, action: 'Council Steward signs Statutory Permit under active Monotonic Epoch' },
      { step: 3, action: 'Execute Escrow Disbursement with Dual-State Receipt' },
      { step: 4, action: 'Attach Completion Inspection Report & Geotagged Photos to Delivery Evidence' },
      { step: 5, action: 'Generate Bank/Funder Understanding Packet' }
    ]
  };

  res.json({
    success: true,
    proposal
  });
});


// --- Service 7: Contractor & NCC Service ---
app.post('/api/contractors/bind/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const { ncc_registration = 'NCC-CON-7761', contractor_name = 'BUILDRIGHT CONSTRUCTION LIMITED', grade = 'C1' } = req.body;

  const nccCheck = {
    ncc_registration,
    contractor_name,
    grade,
    status: 'ACTIVE',
    compliance_status: 'COMPLIANT'
  };

  const binding = {
    id: `BND-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    ncc_registration,
    contractor_name,
    grade,
    status: 'ACTIVE',
    notice_to_proceed_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  DB.contractor_bindings.set(submissionId, binding);

  await appendToLedger('CONTRACTOR_BOUND_WITH_NTP', {
    submission_id: submissionId,
    ncc_registration,
    contractor_name,
    grade
  });

  await emitCloudEvent(
    Topics.ContractorBound,
    'zape/contractor-service',
    submissionId,
    { binding, ncc_check: nccCheck, notice_to_proceed: true }
  );

  res.status(201).json(binding);
});

// --- Service 8: Inspection & Occupancy Service ---
app.post('/api/inspections/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const {
    inspector_agency = 'NCC',
    inspection_type = 'FOUNDATION',
    status = 'PASSED',
    gps = '-15.416,28.282',
    photos = ['sha256:aa11', 'sha256:bb22'],
    notes = 'Foundation reinforcement matches approved structural drawings.'
  } = req.body;

  const inspection = {
    id: `INSP-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    inspector_agency,
    inspection_type,
    status,
    gps,
    photos,
    notes,
    created_at: new Date().toISOString()
  };

  const list = DB.inspections.get(submissionId) || [];
  list.push(inspection);
  DB.inspections.set(submissionId, list);

  await appendToLedger('SITE_INSPECTION_RECORDED', inspection);

  await emitCloudEvent(
    Topics.InspectionRecorded,
    'zape/inspection-service',
    submissionId,
    inspection
  );

  res.status(201).json(inspection);
});

app.post('/api/occupancy/:submissionId', async (req, res) => {
  const submissionId = req.params.submissionId;
  const certNumber = `OC-${Date.now()}`;
  const certificate = {
    id: `OCC-${crypto.randomUUID().substring(0, 8)}`,
    submission_id: submissionId,
    certificate_number: certNumber,
    status: 'ISSUED',
    created_at: new Date().toISOString()
  };

  DB.occupancy_certificates.set(submissionId, certificate);

  await appendToLedger('OCCUPANCY_CERTIFICATE_ISSUED', certificate);

  await emitCloudEvent(
    Topics.OccupancyIssued,
    'zape/inspection-service',
    submissionId,
    certificate
  );

  res.status(201).json(certificate);
});

// --- Service 9: AI Plan Review Service (FastAPI / Gemini Equivalent) ---
app.post('/api/plan-review', (req, res) => {
  const {
    submission_id = 'SUB-SAMPLE',
    project_type = 'RESIDENTIAL',
    risk_level = 'MEDIUM',
    documents = []
  } = req.body;

  const flags: any[] = [];
  const docTypes = new Set(documents.map((d: any) => d.document_type || d.type));

  const required = ['ARCHITECTURAL_DRAWINGS', 'STRUCTURAL_DRAWINGS', 'SITE_PLAN'];
  const missing = required.filter(r => !docTypes.has(r));

  if (missing.length > 0) {
    flags.push({
      type: 'MISSING_DOCUMENTS',
      severity: 'HIGH',
      details: missing
    });
  }

  if (project_type.toUpperCase() === 'SCHOOL') {
    flags.push({
      type: 'FIRE_SAFETY_REVIEW_REQUIRED',
      severity: 'HIGH',
      details: 'Schools require fire safety and egress corridor review.'
    });
  }

  if (project_type.toUpperCase() === 'HOSPITAL') {
    flags.push({
      type: 'HEALTH_AUTHORITY_CLEARANCE_REQUIRED',
      severity: 'HIGH',
      details: 'Hospitals require specialized Health Professions Council clearance.'
    });
  }

  if (risk_level.toUpperCase() === 'CRITICAL') {
    flags.push({
      type: 'PEER_REVIEW_REQUIRED',
      severity: 'HIGH',
      details: 'Critical risk projects require multi-disciplinary peer review under ZIA & EIZ regulations.'
    });
  }

  const reviewResult = {
    submission_id,
    ai_status: 'REVIEW_COMPLETE',
    flags,
    human_review_required: flags.length > 0,
    timestamp: new Date().toISOString()
  };

  res.json(reviewResult);
});

// --- Service 10: Workflow State Query & End-to-End Orchestrator ---
app.get('/api/workflow/state/:submissionId', (req, res) => {
  const state = DB.submission_states.get(req.params.submissionId);
  if (!state) return res.status(404).json({ error: 'Submission state not found' });
  res.json(state);
});

app.post('/api/workflow/refresh/:submissionId', async (req, res) => {
  const state = await refreshSubmissionState(req.params.submissionId);
  if (!state) return res.status(404).json({ error: 'Submission not found' });
  res.json(state);
});

// Run complete automated 18-step End-to-End Workflow with a single call!
app.post('/api/workflow/run-e2e', async (req, res) => {
  try {
    const projectName = req.body.projectName || `Lusaka Green Tower Phase ${Math.floor(Math.random() * 900 + 100)}`;
    const parcelId = req.body.parcelId || `LUSAKA/${Math.floor(Math.random() * 900 + 100)}/26`;

    // 1. Create Project
    const projectId = `PRJ-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const submissionId = `SUB-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    const project = {
      id: projectId,
      name: projectName,
      parcel_id: parcelId,
      council: 'LUSAKA CITY COUNCIL',
      project_type: 'RESIDENTIAL',
      risk_level: 'MEDIUM',
      estimated_value: 8500000,
      entity_type: 'ARCHITECTURAL_FIRM',
      foreign_origin: false,
      uses_template: false,
      developer_led: false,
      requires_engineering: true,
      created_at: new Date().toISOString()
    };

    const submission = {
      id: submissionId,
      project_id: projectId,
      status: 'DRAFT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    DB.projects.set(projectId, project);
    DB.submissions.set(submissionId, submission);

    // Initial documents
    DB.documents.set(submissionId, [
      { id: `DOC-${Date.now()}-1`, submission_id: submissionId, document_type: 'ARCHITECTURAL_DRAWINGS', file_name: 'ARCH-A101.pdf', sha256_hash: sha256(`ARCH-${projectName}`), storage_url: 's3://zape/arch.pdf', created_at: new Date().toISOString() },
      { id: `DOC-${Date.now()}-2`, submission_id: submissionId, document_type: 'STRUCTURAL_DRAWINGS', file_name: 'STRUC-S201.pdf', sha256_hash: sha256(`STRUC-${projectName}`), storage_url: 's3://zape/struc.pdf', created_at: new Date().toISOString() },
      { id: `DOC-${Date.now()}-3`, submission_id: submissionId, document_type: 'SITE_PLAN', file_name: 'SITE-SP01.pdf', sha256_hash: sha256(`SITE-${parcelId}`), storage_url: 's3://zape/site.pdf', created_at: new Date().toISOString() }
    ]);

    await appendToLedger('PROJECT_AND_SUBMISSION_CREATED', { project_id: projectId, submission_id: submissionId });
    await emitCloudEvent(Topics.ProjectCreated, 'zape/e2e-orchestrator', submissionId, { project, submission });

    // 2-8: Verifications
    await recordVerification(submissionId, 'IDENTITY', 'VERIFIED', { name: 'Mary Banda', nrc: '123456/78/9' });
    await recordVerification(submissionId, 'ENTITY', 'VERIFIED', { entity: 'Phiri and Associates', pacra: '120000/2021' });
    await recordVerification(submissionId, 'PROFESSIONAL', 'VERIFIED', { name: 'John Phiri', zia: 'ZIA-ARCH-00991' });
    await recordVerification(submissionId, 'ENGINEERING', 'VERIFIED', { name: 'Grace Mwila', eiz: 'EIZ-ENG-4471' });
    await recordVerification(submissionId, 'TAX', 'VERIFIED', { tpin: '1002003004' });
    await recordVerification(submissionId, 'SOCIAL_COMPLIANCE', 'VERIFIED', { napsa: 'NAPSA-998877', workers_comp: 'WC-554433' });
    await recordVerification(submissionId, 'INSURANCE', 'VERIFIED', { policy: 'PII-2026-8891' });

    // 9. Compliance Evaluation
    const evalResult = {
      id: `EVAL-${crypto.randomUUID().substring(0, 8)}`,
      submission_id: submissionId,
      status: 'APPROVED_FOR_SUBMISSION',
      score: 100,
      hard_blocks: [],
      warnings: [],
      tasks: [],
      created_at: new Date().toISOString()
    };
    DB.compliance_evaluations.set(submissionId, [evalResult]);
    await appendToLedger('COMPLIANCE_EVALUATION_APPROVED', { submission_id: submissionId, score: 100 });
    await emitCloudEvent(Topics.ComplianceEvaluated, 'zape/compliance-service', submissionId, evalResult);

    // 10. Passport Issuance
    const passportId = `ZAPE-2026-LCC-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;
    const hash = sha256(`PASSPORT-${submissionId}-${Date.now()}`);
    const signature = signPayload({ hash, submissionId, passportId });
    const passportRecord = {
      id: passportId,
      submission_id: submissionId,
      project_id: projectId,
      passport_json: { passportId, submissionId, project, score: 100 },
      sha256_hash: hash,
      signature,
      qr_url: `/verify/${submissionId}`,
      created_at: new Date().toISOString()
    };
    DB.passports.set(submissionId, passportRecord);
    await appendToLedger('SUBMISSION_PASSPORT_ISSUED', { passport_id: passportId, submission_id: submissionId, hash });
    await emitCloudEvent(Topics.PassportIssued, 'zape/passport-service', submissionId, passportRecord);

    // 11. Council Submission
    const councilCase: any = {
      id: `CASE-${Date.now()}`,
      submission_id: submissionId,
      passport_id: passportId,
      council_reference: `LCC-BP-${Date.now()}`,
      status: 'RECEIVED',
      created_at: new Date().toISOString()
    };
    DB.council_cases.set(submissionId, councilCase);
    await emitCloudEvent(Topics.CouncilSubmitted, 'zape/council-service', submissionId, councilCase);

    // 12. Invoicing
    const invoice = {
      id: `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      submission_id: submissionId,
      council_case_id: councilCase.id,
      currency: 'ZMW',
      total_amount: 28500,
      status: 'PAID',
      line_items: [
        { item: 'BUILDING_PERMIT_FEE', amount: 21000 },
        { item: 'NCC_CONSTRUCTION_LEVY', amount: 4500 },
        { item: 'ZIA_STATUTORY_LEVY', amount: 1500 },
        { item: 'EIZ_STATUTORY_LEVY', amount: 1500 }
      ],
      created_at: new Date().toISOString()
    };
    DB.invoices.set(submissionId, invoice);
    await emitCloudEvent(Topics.InvoiceGenerated, 'zape/payment-service', submissionId, invoice);

    // 13. Payment
    const payment = {
      id: `PAY-${Date.now()}`,
      invoice_id: invoice.id,
      submission_id: submissionId,
      payment_reference: `ZAPE-TXN-${Date.now()}`,
      amount: 28500,
      method: 'MOBILE_MONEY',
      status: 'COMPLETED',
      created_at: new Date().toISOString()
    };
    DB.payments.set(submissionId, payment);
    await emitCloudEvent(Topics.PaymentCompleted, 'zape/payment-service', submissionId, payment);

    // 14. Council Approval
    councilCase.decision = 'APPROVED';
    councilCase.status = 'DECIDED';
    councilCase.conditions = ['Stormwater management required', 'NCC registered contractor required before ground works'];
    councilCase.decided_at = new Date().toISOString();
    await emitCloudEvent(Topics.CouncilDecisionMade, 'zape/council-service', submissionId, councilCase);

    // 15. Contractor Binding
    const binding = {
      id: `BND-${Date.now()}`,
      submission_id: submissionId,
      ncc_registration: 'NCC-CON-7761',
      contractor_name: 'BUILDRIGHT CONSTRUCTION LIMITED',
      grade: 'C1',
      status: 'ACTIVE',
      notice_to_proceed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    DB.contractor_bindings.set(submissionId, binding);
    await emitCloudEvent(Topics.ContractorBound, 'zape/contractor-service', submissionId, { binding, notice_to_proceed: true });

    // 16. Site Inspection
    const inspection = {
      id: `INSP-${Date.now()}`,
      submission_id: submissionId,
      inspector_agency: 'NCC',
      inspection_type: 'FOUNDATION',
      status: 'PASSED',
      gps: '-15.416,28.282',
      photos: ['sha256:aa11', 'sha256:bb22'],
      notes: 'Foundation reinforcement inspected and passed against engineering spec.',
      created_at: new Date().toISOString()
    };
    DB.inspections.set(submissionId, [inspection]);
    await appendToLedger('SITE_INSPECTION_RECORDED', inspection);
    await emitCloudEvent(Topics.InspectionRecorded, 'zape/inspection-service', submissionId, inspection);

    // 17. Occupancy Certificate
    const certNumber = `OC-${Date.now()}`;
    const certificate = {
      id: `OCC-${Date.now()}`,
      submission_id: submissionId,
      certificate_number: certNumber,
      status: 'ISSUED',
      created_at: new Date().toISOString()
    };
    DB.occupancy_certificates.set(submissionId, certificate);
    await appendToLedger('OCCUPANCY_CERTIFICATE_ISSUED', certificate);
    await emitCloudEvent(Topics.OccupancyIssued, 'zape/inspection-service', submissionId, certificate);

    // 18. Final State Refresh
    const finalState = await refreshSubmissionState(submissionId);

    res.json({
      success: true,
      message: '18-Step End-to-End Workflow executed and verified across all microservices!',
      project,
      submission,
      passport: passportRecord,
      councilCase,
      invoice,
      payment,
      contractor: binding,
      inspection,
      occupancy: certificate,
      finalState
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Service 11: GraphQL Gateway ---
app.post('/api/graphql', async (req, res) => {
  const { query: gqlQuery, variables = {} } = req.body;
  if (!gqlQuery) return res.status(400).json({ error: 'GraphQL query is required.' });

  const cleaned = gqlQuery.trim();

  // Simple GraphQL Dispatcher for standard queries & mutations
  if (cleaned.includes('submissionState')) {
    const subId = variables.submissionId || (cleaned.match(/submissionId:\s*"([^"]+)"/) || [])[1];
    const state = DB.submission_states.get(subId);
    return res.json({ data: { submissionState: state || null } });
  }

  if (cleaned.includes('publicPassport')) {
    const subId = variables.submissionId || (cleaned.match(/submissionId:\s*"([^"]+)"/) || [])[1];
    const pass = DB.passports.get(subId);
    return res.json({ data: { publicPassport: pass || null } });
  }

  if (cleaned.includes('project(')) {
    const projId = variables.id || (cleaned.match(/id:\s*"([^"]+)"/) || [])[1];
    const proj = DB.projects.get(projId);
    return res.json({ data: { project: proj || null } });
  }

  if (cleaned.includes('createProject')) {
    const input = variables.input || {};
    const projectId = `PRJ-${Date.now()}`;
    const submissionId = `SUB-${Date.now()}`;
    const project = { id: projectId, ...input, created_at: new Date().toISOString() };
    DB.projects.set(projectId, project);
    DB.submissions.set(submissionId, { id: submissionId, project_id: projectId, status: 'DRAFT' });
    return res.json({ data: { createProject: project } });
  }

  if (cleaned.includes('ledgerEvents') || cleaned.includes('ledger')) {
    return res.json({ data: { ledger: DB.ledger } });
  }

  if (cleaned.includes('understandingPacket')) {
    const subId = variables.subjectId || (cleaned.match(/subjectId:\s*"([^"]+)"/) || [])[1] || 'CIVIC-COMMUNITY-01';
    const packet = durableStore.generateUnderstandingPacket(subId);
    return res.json({ data: { understandingPacket: packet } });
  }

  if (cleaned.includes('capabilities') || cleaned.includes('whatCanIDoRightNow')) {
    const subId = variables.subjectId || (cleaned.match(/subjectId:\s*"([^"]+)"/) || [])[1] || 'CIVIC-COMMUNITY-01';
    const subject = durableStore.getSubject(subId);
    return res.json({
      data: {
        capabilities: {
          subject_id: subId,
          power_state: subject?.power_state || 'D0',
          current_epoch: subject?.current_epoch || 1,
          authority_granted: subject?.power_state === 'D0',
          can_propose: true,
          can_mutate: subject?.power_state === 'D0',
          governance_model: 'Veklom Continuity Framework (Fail-Closed ΔC=0)'
        }
      }
    });
  }

  if (cleaned.includes('cloudEvents') || cleaned.includes('events')) {
    return res.json({ data: { events: eventLog.slice(0, 50) } });
  }

  // Fallback response with system summary
  res.json({
    data: {
      systemStatus: 'ZAPE GraphQL Gateway Online (Hardened Durable Architecture)',
      projectsCount: DB.projects.size,
      ledgerBlocks: durableStore.getLedgerBlocks(100).length,
      kafkaEvents: eventLog.length
    }
  });
});

// --- Service 12: Events Stream, Ledger, FIWARE & Debezium ---
app.get('/api/events', (req, res) => {
  res.json({ count: eventLog.length, events: eventLog });
});

app.get('/api/ledger', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : 0;
  const blocks = durableStore.getLedgerBlocks(Math.min(limit, 100), cursor);
  const verification = durableStore.verifyLedgerChain();
  
  res.json({
    count: blocks.length,
    verification,
    cursor: blocks.length > 0 ? blocks[blocks.length - 1].seq : null,
    ledger: blocks
  });
});

app.get('/api/ledger/verify', (req, res) => {
  const verification = durableStore.verifyLedgerChain();
  res.json({
    success: true,
    verification,
    verified_at: new Date().toISOString()
  });
});

app.get('/api/fiware/entities', (req, res) => {
  const list = Array.from(DB.fiware_entities.values());
  res.json({ count: list.length, entities: list });
});

app.post('/api/fiware/entities', (req, res) => {
  const entity = req.body;
  if (!entity.id) return res.status(400).json({ error: 'Entity must contain id.' });
  DB.fiware_entities.set(entity.id, entity);
  res.status(201).json(entity);
});

app.get('/api/debezium/status', (req, res) => {
  res.json({ connectors: DB.debezium_connectors });
});

// ============================================================================
// 6. SHARED AUTH MIDDLEWARE & UTILITIES (Tokens, Passwords, Sessions, OTPs)
// ============================================================================
const REFRESH_COOKIE = 'zape_refresh';
const REFRESH_TTL_DAYS = 30;

export function hashPassword(plain: string): string {
  const salt = 'zape_salt_2026_zm';
  return crypto.pbkdf2Sync(plain, salt, 10000, 32, 'sha256').toString('hex');
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  if (storedHash === sha256(plain)) return true; // backward compat with sha256 stubs
  return hashPassword(plain) === storedHash;
}

export function signAccessToken(user: any): string {
  const payload = {
    sub: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    name: user.full_name || user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 mins
    iat: Math.floor(Date.now() / 1000)
  };
  return signPayload(payload);
}

export function verifyAccessToken(token: string): any | null {
  const verified = verifySignedPayload(token);
  if (!verified) return null;
  if (verified.exp && verified.exp < Math.floor(Date.now() / 1000)) {
    return null; // Expired
  }
  return verified;
}

export function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing access token in Authorization header.' });
  }
  const user = verifyAccessToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Insufficient role. Required: ${roles.join(', ')}` });
    }
    next();
  };
}

export async function createOtp(identifier: string, purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET') {
  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const otpRecord = {
    id: `OTP-${crypto.randomUUID().substring(0, 8)}`,
    identifier: identifier.toLowerCase(),
    purpose,
    code_hash: codeHash,
    code_plain: code, // Saved for development preview & testing
    expires_at: expiresAt,
    consumed_at: null,
    attempts: 0,
    created_at: new Date().toISOString()
  };

  DB.otp_codes.set(otpRecord.id, otpRecord);
  console.log(`[ZAPE OTP Delivery Simulation] ${purpose} code for ${identifier}: ${code}`);
  return { code, expiresAt };
}

export async function consumeOtp(identifier: string, purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET', code: string): Promise<boolean> {
  const list = Array.from(DB.otp_codes.values()).filter(
    o => o.identifier === identifier.toLowerCase() && o.purpose === purpose && !o.consumed_at
  );
  if (list.length === 0) return false;
  const otp = list[list.length - 1];

  if (new Date(otp.expires_at) < new Date()) return false;
  if (otp.attempts >= 5) return false;

  if (otp.code_hash !== sha256(code) && otp.code_plain !== code) {
    otp.attempts++;
    return false;
  }

  otp.consumed_at = new Date().toISOString();
  return true;
}

export async function issueSession(user: any, res: any, meta: { userAgent?: string; ip?: string }) {
  const accessToken = signAccessToken(user);
  const refreshTokenRaw = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = sha256(refreshTokenRaw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const sessionRecord = {
    id: `SES-${crypto.randomUUID().substring(0, 8)}`,
    user_id: user.id,
    token_hash: refreshTokenHash,
    token_raw: refreshTokenRaw,
    expires_at: expiresAt,
    revoked_at: null,
    user_agent: meta.userAgent ?? null,
    ip_address: meta.ip ?? null,
    created_at: new Date().toISOString()
  };

  DB.refresh_tokens.set(refreshTokenHash, sessionRecord);

  // Set cookie if res is provided
  if (res && res.cookie) {
    res.cookie(REFRESH_COOKIE, refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
    });
  }

  return { accessToken, refreshToken: refreshTokenRaw };
}

export async function rotateSession(refreshTokenRaw: string, res: any, meta: any) {
  const hash = sha256(refreshTokenRaw);
  const tokenRecord = DB.refresh_tokens.get(hash);

  if (!tokenRecord || tokenRecord.revoked_at || new Date(tokenRecord.expires_at) < new Date()) {
    return null;
  }

  // Revoke old token
  tokenRecord.revoked_at = new Date().toISOString();

  const user = DB.users.get(tokenRecord.user_id);
  if (!user || user.status !== 'ACTIVE') return null;

  return issueSession(user, res, meta);
}

export async function revokeSession(refreshTokenRaw: string) {
  const hash = sha256(refreshTokenRaw);
  const tokenRecord = DB.refresh_tokens.get(hash);
  if (tokenRecord) {
    tokenRecord.revoked_at = new Date().toISOString();
  }
}

// ============================================================================
// 7. AUTH SERVICE ENDPOINTS (:4009 /api/auth)
// ============================================================================

// REGISTER — creates REAL user in DB with PENDING_VERIFICATION and issues OTP
app.post('/api/auth/register', async (req, res) => {
  const {
    full_name,
    name,
    email,
    phone,
    password,
    role = 'CLIENT',
    zia_membership,
    ziaNumber,
    eiz_membership,
    pacra_entity_id,
    nrcNumber,
    firmName
  } = req.body;

  const resolvedName = full_name || name;
  const resolvedZia = zia_membership || ziaNumber;
  const identifier = email || phone;

  if (!resolvedName) {
    return res.status(400).json({ error: 'Full legal name is required.' });
  }

  if (!email && !phone) {
    return res.status(400).json({ error: 'Either email or phone is required.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // Check existing
  if (email && DB.users.has(email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }
  if (phone && DB.users.has(phone)) {
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  }

  const userId = `USR-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const passwordHash = hashPassword(password);

  const newUser = {
    id: userId,
    email: email ? email.toLowerCase() : null,
    phone: phone || null,
    password_hash: passwordHash,
    full_name: resolvedName,
    name: resolvedName,
    role: (role || 'CLIENT').toUpperCase(),
    status: 'PENDING_VERIFICATION',
    zia_membership: resolvedZia || null,
    ziaNumber: resolvedZia || null,
    eiz_membership: eiz_membership || null,
    pacra_entity_id: pacra_entity_id || null,
    nrcNumber: nrcNumber || null,
    firmName: firmName || null,
    email_verified_at: null,
    phone_verified_at: null,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  DB.users.set(userId, newUser);
  if (email) DB.users.set(email.toLowerCase(), newUser);
  if (phone) DB.users.set(phone, newUser);

  // Sync with legacy accounts Map
  DB.accounts.set((email || phone).toLowerCase(), {
    id: userId,
    name: resolvedName,
    email: email || phone,
    role: role.toLowerCase(),
    ziaNumber: resolvedZia,
    nrcNumber: nrcNumber || 'PENDING',
    firmName: firmName || 'Independent',
    createdAt: newUser.created_at,
    lastLogin: newUser.created_at
  });

  const otp = await createOtp(identifier as string, 'REGISTRATION');

  await appendToLedger('USER_REGISTERED_PENDING_OTP', {
    user_id: userId,
    identifier,
    role: newUser.role
  });

  await emitCloudEvent('zape.auth.registered', 'zape/auth-service', userId, {
    user_id: userId,
    role: newUser.role,
    identifier
  });

  res.status(201).json({
    message: 'Account created. Verify OTP to activate.',
    user_id: userId,
    identifier,
    dev_otp_code: otp.code // Provided for instant development/preview testing!
  });
});

// VERIFY OTP — activates user and starts authenticated session
app.post('/api/auth/verify-otp', async (req, res) => {
  const { identifier, code } = req.body;

  if (!identifier || !code) {
    return res.status(400).json({ error: 'Identifier and OTP code are required.' });
  }

  const ok = await consumeOtp(identifier, 'REGISTRATION', code);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid or expired OTP code (max 5 attempts).' });
  }

  const user = DB.users.get(identifier.toLowerCase()) || DB.users.get(identifier);
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  user.status = 'ACTIVE';
  user.updated_at = new Date().toISOString();
  if (user.email === identifier.toLowerCase()) user.email_verified_at = new Date().toISOString();
  if (user.phone === identifier) user.phone_verified_at = new Date().toISOString();

  const session = await issueSession(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  await appendToLedger('USER_OTP_VERIFIED_ACTIVATED', {
    user_id: user.id,
    identifier
  });

  res.json({
    message: 'Account activated successfully.',
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      status: user.status
    }
  });
});

// LOGIN — checks lockout (5 attempts -> 15 min lock), verifies password, issues session
app.post('/api/auth/login', async (req, res) => {
  const { identifier, email, phone, password } = req.body;
  const targetId = (identifier || email || phone || '').toLowerCase();

  const user = DB.users.get(targetId) || DB.users.get(identifier || email || phone);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials or account does not exist.' });
  }

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingMins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    return res.status(423).json({
      error: `Account temporarily locked due to 5 failed attempts. Try again in ${remainingMins} minutes.`
    });
  }

  const valid = verifyPassword(password, user.password_hash);
  if (!valid) {
    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    if (user.failed_login_attempts >= 5) {
      user.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await appendToLedger('ACCOUNT_BRUTE_FORCE_LOCKED', { user_id: user.id, attempts: user.failed_login_attempts });
      return res.status(423).json({ error: 'Account locked for 15 minutes due to multiple failed login attempts.' });
    }
    user.updated_at = new Date().toISOString();
    return res.status(401).json({ error: `Invalid credentials. (${5 - user.failed_login_attempts} attempts remaining before temporary lockout)` });
  }

  if (user.status === 'PENDING_VERIFICATION') {
    return res.status(403).json({
      error: 'Account not active. Please complete OTP verification.',
      status: 'PENDING_VERIFICATION',
      identifier: user.email || user.phone
    });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: `Account is currently ${user.status}. Contact ZIA Registrar.` });
  }

  // Reset failed login attempts on success
  user.failed_login_attempts = 0;
  user.locked_until = null;
  user.updated_at = new Date().toISOString();

  const session = await issueSession(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  await emitCloudEvent('zape.auth.login', 'zape/auth-service', user.id, {
    user_id: user.id,
    role: user.role
  });

  res.json({
    message: 'Authentication successful.',
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      status: user.status
    }
  });
});

// REFRESH — session token rotation
app.post('/api/auth/refresh', async (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  let rawToken = req.body?.refreshToken;

  if (!rawToken && cookieHeader.includes(REFRESH_COOKIE)) {
    const match = cookieHeader.match(new RegExp(`${REFRESH_COOKIE}=([^;]+)`));
    if (match) rawToken = match[1];
  }

  if (!rawToken) {
    return res.status(401).json({ error: 'No refresh token provided.' });
  }

  const session = await rotateSession(rawToken, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  if (!session) {
    return res.status(401).json({ error: 'Session expired or token revoked.' });
  }

  res.json({ accessToken: session.accessToken, refreshToken: session.refreshToken });
});

// LOGOUT — session revocation
app.post('/api/auth/logout', async (req, res) => {
  const rawToken = req.body?.refreshToken;
  if (rawToken) await revokeSession(rawToken);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ message: 'Logged out successfully.' });
});

// ME — protected profile
app.get('/api/auth/me', requireAuth, (req: any, res) => {
  const user = DB.users.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    zia_membership: user.zia_membership,
    eiz_membership: user.eiz_membership,
    pacra_entity_id: user.pacra_entity_id,
    email_verified_at: user.email_verified_at,
    phone_verified_at: user.phone_verified_at,
    created_at: user.created_at
  });
});

// PASSWORD RESET — request OTP
app.post('/api/auth/password/reset-request', async (req, res) => {
  const { identifier } = req.body;
  const user = DB.users.get(identifier?.toLowerCase()) || DB.users.get(identifier);
  if (!user) return res.status(404).json({ error: 'Account not found with provided identifier.' });

  const otp = await createOtp(identifier, 'PASSWORD_RESET');
  res.json({ message: 'Password reset OTP generated.', dev_otp_code: otp.code });
});

// PASSWORD RESET — verify OTP and apply new password
app.post('/api/auth/password/reset', async (req, res) => {
  const { identifier, code, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const ok = await consumeOtp(identifier, 'PASSWORD_RESET', code);
  if (!ok) return res.status(400).json({ error: 'Invalid or expired reset OTP code.' });

  const user = DB.users.get(identifier?.toLowerCase()) || DB.users.get(identifier);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.password_hash = hashPassword(new_password);
  user.failed_login_attempts = 0;
  user.locked_until = null;
  user.updated_at = new Date().toISOString();

  await appendToLedger('PASSWORD_RESET_SUCCESSFUL', { user_id: user.id, identifier });
  res.json({ message: 'Password updated successfully. You can now log in.' });
});

// Developer convenience: Get recent OTPs
app.get('/api/auth/otps', (req, res) => {
  const list = Array.from(DB.otp_codes.values()).reverse().slice(0, 20);
  res.json({ count: list.length, otps: list });
});

// Developer convenience: Get all real registered users
app.get('/api/auth/users', (req, res) => {
  const uniqueUsers = Array.from(new Set(Array.from(DB.users.values())));
  res.json({
    count: uniqueUsers.length,
    users: uniqueUsers.map(u => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      zia_membership: u.zia_membership,
      email_verified_at: u.email_verified_at,
      created_at: u.created_at
    }))
  });
});

// Legacy backward compatibility endpoint
app.get('/api/accounts', (req, res) => {
  const accountList = Array.from(DB.accounts.values());
  res.json({ count: accountList.length, accounts: accountList });
});

app.post('/api/notary', (req, res) => {
  const { documentName, fileHash, architectName, ziaNumber, nrcNumber, legalAttestation } = req.body;
  const notaryRecord = {
    id: `NOTARY-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    documentName,
    fileHash,
    witness: { architectName, ziaNumber, nrcNumber },
    legalAttestation,
    ledgerAnchorBlock: DB.ledger.length + 1,
    status: 'NOTARIZED_LEGAL_WITNESS'
  };
  DB.notaryRecords.push(notaryRecord);
  appendToLedger('DIGITAL_NOTARY_ATTESTATION', notaryRecord);
  res.status(201).json({ success: true, record: notaryRecord });
});

// ============================================================================
// 6. SERVER INITIALIZATION & VITE SPA INTEGRATION
// ============================================================================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ZAPE 3.0 Full-Stack Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Kafka Event Backbone] Initialized in-process CloudEvents broker.`);
    console.log(`[Trust Layer] SHA-256 Ledger chain active with ${DB.ledger.length} blocks.`);
  });
}

startServer();
