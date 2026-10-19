# Logical Architecture & Business Model Canvas

> **Project:** Built Environment Compliance & Community Commitment Pools  
> **Event:** Sustainable Finance Live 2026 (Problem Statement 2)  
> **Guiding Principle:** *Community understanding before community financing.*

---

## 1. Business Model Canvas (BMC)

| Canvas Section | Description & Strategic Application |
| :--- | :--- |
| **Key Partners** | • **Community Stewards & Cooperatives:** Local project leads, housing co-ops, energy hubs.<br>• **Local Trade Artisans & Suppliers:** Vetted electricians, plumbers, fabricators accepting pool vouchers.<br>• **Municipal Councils & Regulators:** Environmental health, planning boards, social housing authorities.<br>• **Financial Institutions & Social Lenders:** CDFIs, credit unions, regional commercial banks seeking reliable ESG deployment channels.<br>• **Data Protocol Partners:** Grassroots Economics (Sarafu/Cosmo-Local Credit models), OnePlanet (sustainability indicator schemas). |
| **Key Activities** | • Capturing and timestamping community commitments and mutual pledges.<br>• Managing authority epochs and cryptographic steward delegations.<br>• Enforcing fail-closed consequence firewalls at the database sink level.<br>• Anchoring physical delivery evidence (photos, GPS, serial digests).<br>• Assembling and compiling institutionally readable Understanding Packets. |
| **Key Resources** | • Universal SQLite persistence runtime (zero cloud lock-in, zero external DB cost).<br>• Cryptographic SHA-256 hash-chain ledger engine.<br>• Scoped Agentic AI capacity discovery coordinator.<br>• Local artisan and community resource registry. |
| **Value Propositions** | • **For Communities:** Turns informal goodwill, volunteer labor, and pledges into durable, recognized capacity. Enables internal resource coordination without cash scarcity lock-in.<br>• **For Funders & Banks:** Replaces opaque self-reported ESG surveys with immutable, auditable delivery receipts and field inspection digests. Eliminates lending risk blind spots.<br>• **For Municipalities:** Streamlines compliance verification for local infrastructure projects and ensures grant funding only disburses upon verified statutory milestones. |
| **Customer Relationships** | • Self-sovereign community agency with clear correction rights.<br>• Transparent dual-state receipts proving every penny and voucher moved.<br>• Plain-language explanations rather than mathematical or financial obfuscation. |
| **Channels** | • Responsive Web Workflow Hub (desktop and mobile for community stewards and field workers).<br>• Open REST API for municipal and lender data ingestion.<br>• Downloadable, self-contained JSON/PDF Understanding Packets for loan committees. |
| **Customer Segments** | • **Primary:** Underbanked community organizations (sports clubs, housing retrofits, solar co-ops).<br>• **Secondary:** Place-based social lenders, CDFIs, and ethical banks seeking de-risked community loans.<br>• **Tertiary:** Local government councils disbursing climate and infrastructure grant pools. |
| **Cost Structure** | • Minimal infrastructure overhead: runs locally on edge devices or standard lightweight servers.<br>• Zero public blockchain gas fees or custodial wallet overhead.<br>• Open-source codebase with permissive licensing. |
| **Revenue & Sustainability** | • **Tier 1 (Community Free Tier):** Free self-hosted runtime for local mutual coordination.<br>• **Tier 2 (Institutional Funder Licensing):** Compliance and automated verification fees paid by banks, CDFIs, and councils for programmatic Understanding Packet audits.<br>• **Tier 3 (Grant & Anchor Subsidies):** Philanthropic funding for initial setup and steward training. |

---

## 2. Seven-Layer Logical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LAYER 7: AGENTIC AI COORDINATION                    │
│   (Capacity Discovery, Artisan Matching, Plan Proposal Engine)        │
│   *Strict Law: ExecutionContinuity != ConsequenceAuthority (Deny ΔC)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Proposes Plan (No signing power)
┌───────────────────────────────────▼────────────────────────────────────┐
│                   LAYER 2: AUTHORISATION & GOVERNANCE                  │
│   (Scoped Authority Epochs, Steward Bindings, Statutory Permits)       │
│   *Enforces: Expired epochs auto-retire; cross-subject bindings reject │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Authorizes Intent
┌───────────────────────────────────▼────────────────────────────────────┐
│                   LAYER 3: EXECUTION CONTROLS (FIREWALL)               │
│   (Fail-Closed Consequence Gate, Replay Idempotency, Sink Constraints) │
│   *Rule: Invalid permit / epoch / balance => Delta C = 0               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Passes Valid Request
┌───────────────────────────────────▼────────────────────────────────────┐
│                   LAYER 1: COMMITMENT & ESCROW SINK                    │
│   (Atomic SQLite Storage, Monotonic Epochs, Balance Mutations)         │
│   *Guarantees: balance_after = balance_before - disbursement_amount    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴───────────────────────────┐
       ▼                                                        ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│     LAYER 4: EVIDENCE COLLECTION     │  │        LAYER 5: AUDIT RECEIPTS       │
│ (Inspection Photos, GPS, Serial Digs)│  │ (Dual-State Receipts, Hash Chains)   │
│ *Dataset Provenance & Disclosures    │  │ *SHA-256 Merkle Ledger Anchors       │
└──────────────────┬───────────────────┘  └──────────────────┬───────────────────┘
                   │                                         │
                   └────────────────────┬────────────────────┘
                                        │
┌───────────────────────────────────────▼────────────────────────────────────────┐
│                 LAYER 6: THE UNDERSTANDING PACKET (HERO)                       │
│   Executive Disclosure Layer for Banks, Lenders, and Municipal Councils:       │
│   1. What was promised? (Commitment scope, target, steward)                   │
│   2. Who approved it? (Authority epoch, worker, municipal permit)              │
│   3. What was delivered? (Milestone evidence, photo hashes, GPS)              │
│   4. What changed financially? (Before & after balances, dual-state receipt)  │
│   5. What remains open? (Remaining balance, unfulfilled milestones)            │
│   + Data sources, license terms, synthetic disclosures, and known limitations │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dataset Provenance and Evidence Lineage

### Purpose
Every dataset used within the demonstrator has an explicit provenance record identifying source origin, licensing permissions, data classifications, and known limitations. External evidence references are kept separate from financial state hashes to prevent unverified data from masquerading as verified truth.

### Required Provenance Fields
- **Dataset Identity:** Unique ID (e.g., `DS-ZAMBIA-SOLAR-01`), title, publisher, and official URL.
- **Data Classification:** `SYNTHETIC_FIXTURE`, `COMMUNITY_VERIFIED`, `PUBLIC_OPEN_DATA`, or `RESTRICTED`.
- **Permission to Use:** License (e.g., `ODbL-1.0`, `CC-BY-4.0`, or `INTERNAL_SANDBOX_ONLY`).
- **Coverage & Lineage:** Geography, date range, transformation history, and known omissions.
- **Verification Status:** `SYNTHETIC_FIXTURE` vs `PHYSICALLY_VERIFIED`.

### Active Seeded Records in Hardened Store
1. **`DS-ZAMBIA-SOLAR-01` (Synthetic Fixture):**
   - *Classification:* `SYNTHETIC_FIXTURE`
   - *Description:* Synthetic test fixture modeling microgrid component pricing and solar irradiance for Lusaka community hub.
   - *Limitations:* Calibrated for sandbox demonstration only. Not for production underwriting.
2. **`DS-COMMONS-CREDIT-02` (Community Verified):**
   - *Classification:* `COMMUNITY_VERIFIED`
   - *Description:* Verified community artisan capacity registry and voucher pledge agreements.
   - *Limitations:* Covers 3 local trade partners across Q4 2026.

---

## 4. The Non-Implication Law of Governance

$$\text{Identity Continuity} \not\implies \text{Authority Continuity}$$
$$\text{Execution Continuity} \not\implies \text{Consequence Authority}$$

In traditional distributed architectures, an agent or process with execution access is frequently granted direct write authority to databases or wallets. Under the Veklom Continuity Framework:
1. An AI Agent may query data, discover capacity, and synthesize a complete multi-step procurement plan.
2. However, the agent's consequence authority is explicitly stamped `DENIED`.
3. If an agent attempts to call a balance mutation endpoint (`/api/escrow/disburse`), the database sink rejects the operation immediately with `InvalidAuthorityEpochError`, asserting $\Delta C = 0$.
4. Financial mutations can only occur when signed by an active human steward holding a valid, non-expired monotonic authority epoch.
