# Built Environment Compliance & Community Commitment Pools

> **Track:** Sustainable Finance Live 2026 (SF.Live)  
> **Problem Statement 2:** *From Underbanked to Understood — Community Credit and Commitment Pools*  
> **Team Classification:** Established Category (Veklom Continuity Runtime)  
> **Core Objective:** Enable community organisations to record commitments, approvals, actions, and supporting delivery evidence in a durable, auditable form that can be understood and evaluated by funders, councils, banks, and local stakeholders.

---

## Current Project Status

### Focus
Communities (sports clubs, community solar cooperatives, housing retrofit groups, local agricultural hubs) hold immense real-world capacity, relationships, and trust. However, conventional financial institutions often view them as "high risk" or "underbanked" because their records are fragmented across emails, paper notes, and in-memory tools.

This repository provides a **governed community treasury and commitment runtime** that converts local commitments and delivery milestones into institutionally understandable, cryptographic trust signals without requiring expensive blockchain gas fees or opaque AI scoring.

### Implemented & Demonstrated Components (E4 Physical Telemetry)

- ✅ **Durable Record Storage:** Universal SQLite engine (`src/services/durableStore.ts`) providing zero-loss local persistence across Node 22+, Bun, and `better-sqlite3`.
- ✅ **Community Commitment Pools:** Structured lifecycle management (Draft $\to$ Approved $\to$ Active $\to$ Fulfilled).
- ✅ **Scoped Authorisation (Epoch-Bound):** Authority tied to explicit time-bounded epochs; old authorizations expire automatically.
- ✅ **Consequence Firewall (Fail-Closed):** Disallows any disbursement unless authority epoch, municipal permits, and escrow balances are valid ($\Delta C = 0$ on all unauthorized or stale attempts).
- ✅ **Replay & Idempotency Protection:** Enforces unique transaction keys at the database sink level to prevent duplicate payments.
- ✅ **Dual-State Receipts:** Records cryptographic before-and-after proofs (`balance_before`, `balance_after`, `monotonic_epoch`, `proof_hash`) for every financial mutation.
- ✅ **Delivery Evidence Anchoring (Layer 4):** Anchors physical inspection photos, GPS coordinates, and equipment serial numbers to milestones.
- ✅ **Dataset Provenance & Synthetic Disclosures:** Transparently tags datasets (e.g. `SYNTHETIC_FIXTURE` vs `COMMUNITY_VERIFIED`) with source URLs, licenses, and known limitations.
- ✅ **Agentic AI Capacity Coordinator (Layer 7):** Matches community needs to local artisan capacity while strictly enforcing the **Non-Implication Law** ($\text{ExecutionContinuity} \not\implies \text{ConsequenceAuthority}$).
- ✅ **The Understanding Packet (Layer 6 Hero):** Reviewer-facing disclosure generating 5 plain-language answers backed by SHA-256 hash chains for bank credit officers and municipal councils.

### In Progress & Validation Status

| Demonstrated in Sandbox | Explicitly Not Claimed (Out of Scope for Hackathon Prototype) |
| :--- | :--- |
| • Atomic SQLite persistence across process reboots | • Live real-world money movement or fiat settlement |
| • Scoped authority & stale-permit rejection | • Real-world credit rating or automated lending underwriting |
| • $\Delta C = 0$ financial balance invariance on attack | • Live production Sarafu network or OnePlanet production deployment |
| • Delivery photo digest & GPS anchoring | • General community survey data or external unverified datasets |
| • Plain-language 5-question Understanding Packet | • Unconditional AI autonomy or self-executing contracts |

---

## Quickstart & Reproducible Verification

This codebase has zero external service dependencies. All persistence is native SQLite.

### 1. Installation & Environment Check
```bash
# Clone the repository
git clone https://github.com/Sentry7773/BUILT-ENVIRONMENT-COMPLIANCE-.git
cd BUILT-ENVIRONMENT-COMPLIANCE-

# Install dependencies (works with npm or bun)
npm install
```

### 2. Typecheck & Frontend Build Verification
```bash
npm run typecheck    # Executes tsc --noEmit (0 errors)
npm run build        # Executes vite build (0 errors)
```

### 3. Invariant & Adversarial Defense Suite
Executes 18 cold-boot adversarial tests against an empty database sink (zero mocks, cold adversarial attacks first):
```bash
npm run verify:continuity
```

### 4. Live HTTP Consequence Firewall Suite
Boots the live Express server on a test port and fires 16 physical HTTP assertions:
```bash
npm run verify:http
```

### 5. Running the Interactive Sandbox
```bash
# Terminal 1: Start the backend API server
npm run server

# Terminal 2: Start the frontend interface
npm run dev
```
Navigate to `http://localhost:5173` and select **Tab 8: "ZAPE Engine v3.0 & Protocol"** to experience the interactive 6-step community journey.

---

## Plain-Language Translation Guide

| Technical Concept | Plain-Language Meaning for Funders & Communities |
| :--- | :--- |
| **Monotonic Epoch Retirement** | *"Old authorizations automatically expire."* |
| **Cross-Subject Binding Error** | *"A user cannot spend resources belonging to another community."* |
| **Consequence Firewall ($\Delta C = 0$)** | *"Unauthorized or invalid requests leave the protected balance completely untouched."* |
| **Dual-State Receipt** | *"A permanent before-and-after receipt proving exact account movements."* |
| **Non-Implication Law** | *"AI can propose plans and discover helpers, but only human stewards can release funds."* |
| **The Understanding Packet** | *"An easy-to-read audit summary answering what was promised, who approved it, and what was delivered."* |

---

## Repository Structure

```
├── docs/
│   └── architecture_and_business_model.md  # Business Model Canvas & 7-Layer Architecture
├── scripts/
│   ├── verify_continuity.ts               # 18 cold-boot invariant verification checks
│   └── verify_http.ts                     # 16 live HTTP consequence firewall checks
├── src/
│   ├── components/
│   │   ├── MicroservicesWorkflowHub.tsx   # Interactive 6-step community demo UI
│   │   └── AuditLedgerView.tsx            # Live dual-state receipt and proof viewer
│   └── services/
│       ├── durableStore.ts                # Universal SQLite engine & Understanding Packet generator
│       └── cryptoLedger.ts                # SHA-256 hash-chain audit ledger
├── server.ts                              # Hardened Express endpoints with fail-closed middleware
└── continuity_hardening.patch             # Self-contained patch against origin/main
```
