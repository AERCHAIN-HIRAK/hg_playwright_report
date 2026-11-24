# NSE on Aerchain — Product Overview

The bot reads this first, every time. Keep it short: it is a map, not the manual.
Deep detail lives in `modules/<module>.md` (written by `/qa-learn`) and in
`source/customer-flow-document.txt` (the full NSE Customer Case Document, Aug 2026).

## What the product is
Aerchain is a procurement platform. NSE (National Stock Exchange of India) runs
multiple entities on it (NSEIL, NSE Foundation = "NSEF", …). Two web portals:

| Portal | Who | URL (UAT) |
|---|---|---|
| CAPP (buyer / customer app) | NSE employees, approvers, purchasers | https://nse-capp-v4-uat.aerchain.io |
| SAPP (supplier portal) | Vendors | https://nse-sapp-v4-uat.aerchain.io (RFX) · https://nse-sapp-uat.aerchain.io (shell) |
| Auth | Both | https://nse-auth-uat.aerchain.io/{capp,sapp}/login |

## The main chain (new architecture — "CXO as foundation")
```
Budget Item (BRF)
  └─ CXO  (budget blocking + approval)
       ├─ Non-PO Invoice ──────────────────────────────┐
       └─ Intake → RFX/Sourcing → Award → PR → PRC → PO → GRN → PO Invoice → Payment
                                                      ├─ Advances
                                                      └─ Credit Notes
```
Supplier side (SAPP): onboarding, RFX quoting, invoices, viewing POs.

## Rules that apply everywhere (test these on any change)
- **CXO is mandatory** at header level for every procurement flow.
- **One budget item** at header level from Intake through Invoice; only the CXO can hold several (at item level).
- **Value ceiling**: a child can only consume within its parent — PR ≤ CXO, PRC ≤ PR, PO ≤ PRC, GRN ≤ PO, Invoice ≤ GRN/PO.
- **Many children per CXO** allowed (several Intakes/POs/Invoices) as long as the ceiling holds.
- **Cancel / reject / short-close releases budget** back up the chain (auto and manual rollback).
- **Reject → Edit → Resubmit** exists on every module and restarts the workflow; reduced qty must flow back to the parent.
- **Workflows**: multi-stage approvals with recall, delegation, bulk reassignment, random approver, locked mandatory approvers.
- **Department access**: users only see transactions for departments they have access to.
- **Status gates**: e.g. Cancel disabled once a record has active downstream transactions; Proceed disabled on a duplicate invoice reference (silent block).

## Modules (one file each under `modules/` once learned)
Budget/BRF · CXO · Intake · RFX & Sourcing · Auction · Award · PR · PRC · PO · GRN ·
PO Invoice · Non-PO Invoice · Payments · Advances · Credit Notes · Supplier/Vendor ·
Workflows & Approvals · Reports · Dashboard · Activity Timeline · Listings

## Where the existing test knowledge is
| What | File |
|---|---|
| Automated tests with steps + expected results | `NSE-Test-Catalogue.html` (DATA array; one entry per test) |
| Scenarios still pending automation | `NSE - Pending Automation Scenarios - Sheet1.csv` |
| Older suite scenarios (P001…) | `NSE - Pre-existing Suite Scenarios.csv` |
| Spec files | `tests/testSuite*.spec.js` |
| Page actions / locators | `pages/*Actions.js`, `pages/*Locators.js` |
| Test data + saved records | `pages/NSEFoundationData.json` |
| Hotfix regressions already automated | `tests/testSuiteNSETracksHotfixes.spec.js` |
