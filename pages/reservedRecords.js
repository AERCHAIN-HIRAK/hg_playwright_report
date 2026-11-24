// Records pinned by a specific test. Listing pickers must SKIP these, because
// any other test acting on one (invoicing, short-closing, amending, cancelling
// it) silently breaks the test that owns it.
//
//   PO-NSEFN-26-410  S126 (testSuiteInvoiceRefValidation) - needs its GRN and
//                    its 50 open qty; its duplicate submit is always refused,
//                    so S126 itself never consumes it.
//   PO-NSEFN-26-588  Tracks @Advance @PO (testSuiteNSETracksHotfixes) - two
//                    Paid advances + an Inwarded GRN, kept un-invoiced for the
//                    PO-invoice advance auto-mapping step (on hold, app bug).
//   (Supplier 30480 for S136 needs no entry: no listing picker can reach it -
//    the block/unblock test uses a named Registered supplier.)
export const RESERVED_CODES = ['PO-NSEFN-26-410', 'PO-NSEFN-26-588'];
