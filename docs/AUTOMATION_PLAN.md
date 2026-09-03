# NSE — Pending Automation Scenarios → Suite Mapping

Source: `NSE - Pending Automation Scenarios - Sheet1.csv` (160 scenarios)

Legend: **EXT** = extend existing suite · **NEW** = new suite needed · **MERGE** = folded into one parametrised test

---

## A. CXO → `testSuiteNsefCXOtest.spec.js` (EXT)
| # | Scenario | Note |
|---|---|---|
| 2 | Revert pending budget for partially processed CXO | extends `revertPendingBudget` |
| 3 | Cancel disabled for CXO with active transactions | |
| 4 | CXO panel from listing shows related data | |
| 8 | All CXO transactions in transaction tab | `openCxoTransactionsTab` exists |
| 107 | Clone cancelled CXO without changing reference | |
| 108 | Must change reference cloning Released/Processed/Partially Processed CXO | |
| 154 | Budget released when CXO rejected at approval stage | |

## B. Intake → `testSuiteIntakeNegative.spec.js` (EXT)
| # | Scenario | Note |
|---|---|---|
| 5 | Cancel disabled once Intake processed | |
| 6 | Partial RFXs → Mark Processed → remaining CXO amount reusable | |
| 9 | Intake transactions in transaction tab | |
| 10 | Intake via Bulk Upload | needs sample xlsx |
| 20 | RFX-to-Intake beyond intake qty → error | |
| 21 | Intake→RFX from 2 tabs within 5s → later tab errors | 2 browser contexts |
| 86 | Same line item cannot be processed twice | |
| 87 | Same item ×2 with different delivery address → different RFX/PR | |
| 120 | Process button hidden after full-qty processing | |

## C. RFX / Sourcing → `testSuiteRFXtests.spec.js` (EXT)
| # | Scenario | Note |
|---|---|---|
| 7 | RFX Award cancel → new Award | |
| 11 | RFX via Bulk Upload | needs sample xlsx |
| 23 | Base-currency toggle in Analysis tab | |
| 24 | Award justification long text → hover shows full text | |
| 25 | Deleted line items visible via "Show deleted item" toggle | |
| 26 | Supplier configurations show configured supplier data | |
| 27 | Download all files from Analysis tab | |
| 28+29 | **MERGE** — price sync in Analysis tab (duplicate rows) | |
| 30 | Compare quote versions | |
| 31 | Parent intake accessible from Analysis tab | |
| 32 | Auction accessible from Analysis tab | |
| 33 | Negotiations | |
| 34 | Bulk supplier reminders | |
| 35 | Evaluation | |
| 36 | Extend deadline after foreclose | |
| 37 | Buyer comments for other users | |
| 98 | RFX cancel after foreclose | |

## D. Auction → **NEW** `testSuiteAuction.spec.js`
| # | Scenario |
|---|---|
| 99 | Joined-live / login details shown in live CAPP auction (sealed bid = NO) |
| 100 | Joined-live / login details downloadable after auction ends |

## E. PR / Requisition → **NEW** `testSuiteRequisition.spec.js`
| # | Scenario | Note |
|---|---|---|
| 19+57+58 | **MERGE** — Budget Exceeded on PR edit (from award / price↑ / qty↑) | one describe, 3 tests |
| 51 | Cloned awarded PR → Budget Exceeded | |
| 52–55 | **MERGE** — PR links open Award / Intake / Budget / CXO | one parametrised test |
| 56 | Search line item in line-item section | |
| 59 | Item name click → item details panel | |
| 60 | Back from PR → PR listing | |
| 150 | PR re-processable after cancelled amendment | |

## F. PO → **NEW** `testSuitePurchaseOrder.spec.js`
| # | Scenario | Note |
|---|---|---|
| 12 | Lowered qty on PO reject-edit available in PRC for next PO | |
| 62 | RFX award attachments carried to PR → PRC | |
| 63 | Partial GRN + Invoice + Short Close → budget returned | |
| 64 | Advance Payment vs PO → deducted from Invoice → remainder paid | |
| 65 | Short Close after partial GRN | |
| 66 | Short Close after partial GRN + Invoice | |
| 67 | All configured PO workflow stages display + function | |
| 68 | Clone PO → Budget Exceeded | |
| 69 | PO recall → Draft | |
| 75 | Amend PO qty/price ↑ → Budget Exceeded | |
| 76 | Advance requested from SAPP → paid via CAPP | |
| 122 | Correct PO number during PO→GRN→Invoice creation | |

## G. PRC + Recovery flows → **NEW** `testSuitePrcRecovery.spec.js`
| # | Scenario | Note |
|---|---|---|
| 151 | Cancel PO resets PRC/PR processing state | |
| 152+158+160 | **MERGE** — PR recovery after PRC cancel → new PRC → PO → Invoice, budget consumption correct | heavy overlap; 2 tests |

## H. GRN → **NEW** `testSuiteGRN.spec.js`
| # | Scenario | Note |
|---|---|---|
| 70+127 | **MERGE** — Cancel Invoice → GRN back to Unmatched + qty released | duplicates |
| 71 | Cancel unavailable for fully matched GRN | |
| 72 | Cancel unavailable for partially matched GRN | |
| 130 | GRN cannot be cancelled while matched to active Invoice | |

## I. Invoice — Disputed → `testSuiteInvoiceDisputed.spec.js` (EXT — currently empty stub)
| # | Scenario |
|---|---|
| 13 | Qty mismatch GRN vs Invoice (qty-based PO) → Disputed |
| 73 | Invoice created without matching available GRN → Disputed → match → workflow triggered |
| 74 | Invoice direct against PO with no GRN → Disputed → create+match GRN → processed |

## J. Invoice — Workflow & Approvals → **NEW** `testSuiteInvoiceWorkflow.spec.js`
| # | Scenario | Note |
|---|---|---|
| 61 | SAPP invoice + tax at SAPP review → CAPP workflow; modify tax/qty/price → new workflow, previous rejected | |
| 123 | Blocked when all approvers inactive/disabled | needs admin setup |
| 124 | No auto-approve when only approver = submitter | needs admin setup |
| 125 | Not auto-skipped from Review when reviewer lacks module access | needs admin setup |
| 126 | Blocked when middle stage has no eligible approver | needs admin setup |
| 135+155 | **MERGE** — Reject at approval → status consistent across detail/listing/report/pending approvals | |
| 136 | Reject / send back at Review → status correct everywhere | |
| 137 | Reject at Acknowledge → transaction + parent status correct | |
| 157+159 | **MERGE** — SAPP invoice completes buyer workflow + budget + accounting before integration | |

## K. Invoice — Validation & Matching → **NEW** `testSuiteInvoiceValidation.spec.js`
| # | Scenario | Note |
|---|---|---|
| 85 | Accounted invoice can be cancelled | |
| 115 | Cancelled invoice cannot be acknowledged | |
| 116 | Rejected invoice cannot be acknowledged | |
| 121 | Multiple reject-edits → no duplicate invoice rows in DB | |
| 128 | Partial-qty matching across multiple invoices vs GRN/PO qty | |
| 129 | Cannot be Accounted without valid GRN match when matching mandatory | |
| 131+148+149 | **MERGE** — duplicate invoice reference validation (buyer edit / SAPP edit / cross supplier-buyer) | 3 tests, one describe |
| 132 | Subject > 240 chars blocked on edit+submit | |
| 133 | Cannot exceed remaining PO balance across multiple invoices | |
| 134 | Same reference allowed across different entities | |
| 153 | Cancel approved invoice releases budget | |
| 156 | Cancel invoice restores GRN match + PO balance + availability | |

## L. Invoice — Vendor Type / RPT autopopulate → **NEW** `testSuiteInvoiceVendorRpt.spec.js`
**MERGE 77–84** into one parametrised describe (8 entry points):
CAPP: PO view page · Invoice listing · Credit note · CXO invoice
SAPP: PO view page · Invoice listing · Credit note · CXO invoice

## M. Listing pages → **NEW** `testSuiteModuleListings.spec.js` + new page objects
**MERGE 109–112** — clone the `intakeListingActions` pattern for Requisition / PO / Invoice / GRN.
One shared listing page-object + one parametrised spec covering load, tabs, sort, search, filters, pagination, row navigation.
| # | Module |
|---|---|
| 109 | Requisition |
| 110 | Purchase Order |
| 111 | Invoice |
| 112 | GRN |
| 88 | MSME filter on Invoice listing (folded into Invoice listing block) |

## N. Cross-module (parametrised) → **NEW** `testSuiteCrossModule.spec.js`
| # | Scenario | Note |
|---|---|---|
| 14–18 | **MERGE** — Save → edit → submit during creation (CXO / Intake / RFX / GRN / Invoice) | 5 tests, one describe |
| 41–45 | **MERGE** — Regenerate + download document (Requisition / PRC / PO / GRN / Invoice) | 5 tests |
| 46–50 | **MERGE** — Reassign user (Requisition / PRC / PO / GRN / Invoice) | 5 tests |
| 38–40 | **MERGE** — Download activities + comments from Activity timeline (CXO / Intake / RFX) | 3 tests |
| 95 | Attachments downloadable in all modules | |
| 105 | Line-item UOM populated in all modules | |
| 113 | Multiple clicks on Approve / Submit / Proceed handled safely | |
| 119 | Documents show correct data across all modules | |
| 138+139 | **MERGE** — Cancel removes transaction from all approvers' pending lists | |

## O. Full E2E flows → `testSuiteNSEFhappyPATHS.spec.js` / `testSuiteSupplierPortal.spec.js` (EXT)
| # | Scenario | Target |
|---|---|---|
| 1 | 2 × Intake→Payment full flows for 1 CXO | happyPATHS |
| 90 | Value-based PR→PRC→PO→GRN→Invoice (CAPP) | happyPATHS |
| 91 | Value-based PR→PRC→PO→GRN→Invoice (SAPP) | SupplierPortal |
| 106 | Advance payments listed in Advance transaction tab | PO suite |
| 118 | SEZ-applicable delivery address → tax-based total correct | happyPATHS |

## P. Supplier Onboarding → **NEW** `testSuiteSupplierOnboarding.spec.js`
| # | Scenario | Note |
|---|---|---|
| 101 | Supplier create + onboarding — CAPP flow | |
| 102 | Supplier create + onboarding — CAPP + SAPP flow | |
| 103 | Duplicate GST blocked across suppliers | |
| 104 | Supplier matching percentage beside name on view page | |
| 140 | IFSC mandatory — blank on create blocked | |
| 141 | IFSC mandatory — cleared during edit blocked | |
| 142 | Mandatory validations via Supplier Portal | |
| 143 | Every mandatory field in onboarding template validated | |
| 144 | Supplier Edit access can edit onboarded supplier | |
| 145 | Status → Sync Failed on integration failure | needs failure injection |
| 146 | Status → Registered on successful integration | |
| 147 | Block / unblock supplier across all entities | |

## Q. Dashboard / Reports / Admin → **NEW** `testSuiteDashboardReports.spec.js`
| # | Scenario | Note |
|---|---|---|
| 22 | Aerchain logo → V4 Dashboard | |
| 89 | My Pending Approval view type shows pending transactions | |
| 92 | Pending-approval count matches between Dashboard and listing | |
| 93 | Reports module + Admin reports show correct data | |
| 117 | Transactions shown per department access on listing pages | overlaps Tracks suite |
| 114 | Report emailed from Reports/Admin Reports is logged + downloadable from log | needs mail access |
| 94 | MSME validity email triggered with correct data | needs mail access |

## R. Blocked / needs decision
| # | Scenario | Blocker |
|---|---|---|
| 94 | MSME validity email content | No mailbox automation configured |
| 96 | CXO accessible from email — desktop | No mailbox automation |
| 97 | CXO accessible from email — mobile | No mailbox + no mobile viewport strategy |
| 114 | Emailed report logged + downloadable | Mailbox for the send-verification half |
| 121 | No duplicate invoice rows **in DB** | Needs DB access or an API/report proxy |
| 123–126 | Approver-configuration scenarios | Need admin rights to deactivate approvers / strip module access |
| 145 | Supplier Sync Failed | Needs a way to force integration failure |
