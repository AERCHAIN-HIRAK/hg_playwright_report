// ─────────────────────────────────────────────────────────────────────────────
// SupplierPortal_Locators
// Locators for the NSE Supplier Portal (SAPP).
//
// Domain map (discovered live):
//   • Login   : https://nse-auth-uat.aerchain.io/sapp/login   (single email+password form)
//   • Shell   : https://nse-sapp-uat.aerchain.io              (PO / GRN / Invoice / Payments)
//   • RFX (v4): https://nse-sapp-v4-uat.aerchain.io           (Sourcing / quote requests)
//
// Auth is a shared cookie `x-sapp-nse-uat-token` on `.aerchain.io`, so it covers
// both the shell and the v4 subdomain.
//
// XPaths are stored WITHOUT the leading `xpath=` prefix; CSS selectors are plain.
// Actions prepend `xpath=` where needed (matches the NSEFoundation convention).
// ─────────────────────────────────────────────────────────────────────────────

export const SupplierPortal_Locators = {

    // ── Login (nse-auth-uat/sapp/login) ──────────────────────────────────────
    loginEmailField: '#email',
    loginPasswordField: '#password',
    loginSubmitBtn: `//button[@type='submit'][normalize-space()='Log In']`,

    // ── Shell chrome ─────────────────────────────────────────────────────────
    modulesAppstore: `//img[@alt='appstore']`,
    moduleLink: (name) => `//a[normalize-space()='${name}']`,
    accountName: `//*[normalize-space()='HG Automation SUPP']`,

    // ── RFX / Sourcing listing (v4) ──────────────────────────────────────────
    rfxTab: (name) => `//div[@role='tab'][normalize-space()='${name}']`,
    // The listing search box is NOT inside <main>; treat as best-effort (the
    // freshly-created RFX sorts to the top, so the row link is directly clickable).
    rfxSearchInput: `//input[@type='text' and not(@disabled)]`,
    rfxRowLinkByCode: (code) => `//a[normalize-space()='${code}']`,

    // ── RFX / Sourcing detail (v4) ───────────────────────────────────────────
    rfxStatusBadge: `//nav[@aria-label='breadcrumb']/following-sibling::*//*[self::span or self::div][normalize-space()='Pending' or normalize-space()='Quoted']`,
    rfxAcceptBtn: `//button[normalize-space()='Accept']`,
    rfxRejectBtn: `//button[normalize-space()='Reject']`,
    // Accept opens a Terms & Conditions dialog: tick the agreement checkbox, then
    // click the dialog's own "Accept" button.
    dialogRoot: `//div[@role='dialog']`,
    dialogAcceptBtn: `//div[@role='dialog']//button[normalize-space()='Accept']`,
    // Submit Quote flow — appears after Accept, opens a Technical/Commercial menu.
    rfxSubmitQuoteBtn: `//button[normalize-space()='Submit Quote']`,
    rfxCommercialQuoteOption: `//*[@role='menuitem' or @role='option'][normalize-space()='Commercial']`,
    // Preferred Currency combobox on the quote form (shows "Select currency" until set).
    rfxPreferredCurrencyTrigger: `//*[@role='combobox'][contains(normalize-space(.),'Select currency') or contains(normalize-space(.),'Indian Rupee')]`,
    rfxCurrencySearch: `//input[@placeholder='Search...']`,
    rfxCurrencyOption: (currency) => `//*[@role='option'][contains(normalize-space(.),'${currency}')]`,
    // Unit Rate is a click-to-edit cell in a custom grid — targeted by its column
    // header geometry in _fillUnitRate (no stable per-cell selector exists).
    rfxUnitRateHeader: `Unit Rate`,
    rfxQuoteEditInput: `input[placeholder="Enter a number"]`,
    // Form "Submit Quote" button, then the "Select Submission Type" confirm dialog.
    rfxQuoteSubmitBtn: `//button[normalize-space()='Submit Quote']`,
    rfxQuotedStatusBadge: `//nav[@aria-label='breadcrumb']//*[normalize-space()='Quoted'] | //*[normalize-space()='Update Quote']`,

    // ── PO listing (shell) ───────────────────────────────────────────────────
    poSearchInput: `//main//input[@type='text']`,
    poRowCell: (code) => `//*[normalize-space()='${code}'][contains(@class,'cursor') or @role='cell' or self::td or self::a or @style]`,
    poCodeText: (code) => `//*[normalize-space()='${code}']`,

    // ── PO detail (shell) ────────────────────────────────────────────────────
    // A freshly-created PO (from capp) lands in "Submitted" status in SAPP with an
    // enabled Accept button; once accepted it moves to "In Progress" and Accept
    // disappears, leaving Create → GRN / Invoice.
    poSubmittedStatusBadge: `//button[normalize-space()='Submitted'] | //*[normalize-space()='Submitted']`,
    poAcceptBtn: `//button[normalize-space()='Accept']`,
    poCreateBtn: `//button[contains(@aria-label,'Create') or normalize-space()='Create']`,
    poCreateMenuItem: (name) => `//*[@role='menuitem'][normalize-space()='${name}']`,

    // ── GRN / Inward create + form (shell) ───────────────────────────────────
    grnListingUrl: '/inwards',
    grnSubmitBtn: `//button[normalize-space()='Submit']`,
    grnReceivedQtyCell: `//table//input[contains(@name,'received') or contains(@placeholder,'Received')]`,

    // ── Invoice create + form (shell) ────────────────────────────────────────
    // The SAPP "Create Invoice" page (/invoices/new) is the same Aerchain form as
    // CAPP, so these mirror the NSEFoundation invoice locators. Required fields:
    // Invoice Number, Invoice Date, Period based Invoicing? (No), Extra billing
    // (No), plus a document upload — leaving any blank blocks Submit.
    invoiceListingUrl: '/invoices',
    invoiceSubmitBtn: `//button[normalize-space()='Submit']`,
    invoiceNumberInput: `(//*[contains(normalize-space(text()),'Invoice Number')]/following::input)[1]`,
    invoiceDateInput: `input[placeholder="Enter Invoice Date"]`,
    invoicePeriodBasedField: `(//*[contains(normalize-space(text()),'Period based Invoicing')]/following::input)[1]`,
    invoiceExtraBillingField: `(//*[contains(normalize-space(text()),'Extra billing')]/following::input)[1]`,
    // MUI Autocomplete option list — pick "No".
    autocompleteNoOption: `//li[@role='option'][normalize-space(.)='No']`,
    // The invoice-document uploader (accepts pdf/image, NOT the dwg attachment input).
    invoiceUploadInput: `input[type="file"][accept*="application/pdf"]:not([accept*="dwg"])`,

    // Generic dialog primary button
    dialogPrimaryBtn: `//div[@role='dialog']//button[normalize-space()='Submit' or normalize-space()='Confirm' or normalize-space()='Yes' or normalize-space()='Create' or normalize-space()='Proceed']`,

    // "Confirm Invoice Creation" dialog that appears when PO items were already
    // (partly/fully) invoiced on a prior run — must click Proceed to continue.
    // Also matches the post-submit "Validations" popup's Proceed button.
    dialogProceedBtn: `//div[@role='dialog']//button[normalize-space()='Proceed']`,
    // The post-Proceed "Approvers" workflow popup's Submit button.
    dialogSubmitBtn: `//div[@role='dialog']//button[normalize-space(.)='Submit']`,

    // ── CAPP-side review of a SAPP-created invoice (Pending Review) ───────────
    // A SAPP-created invoice lands in CAPP as "Pending Review". The reviewer must:
    // reassign the workflow approver to a controllable user (unlocks Review), match
    // the invoice line items to the PO's GRN, then Review → Submit into the workflow.
    invMatchLineItemBtn:   `//button[normalize-space(.)='Match Line Item']`,
    invReviewBtn:          `//button[normalize-space(.)='Review']`,
    itemMatchingAddGrnField: `(//*[contains(normalize-space(text()),'Add GRN')]/following::input)[1]`,
    itemMatchingGrnOption: (code) => `//li[@role='option'][contains(normalize-space(.),'${code}')]`,
    itemMatchingHeading:   `(//div[@role='dialog']//*[contains(normalize-space(text()),'Item Matching')])[1]`,
    // "More" dropdown → Reassign Workflow Approver → pick NSEF Support Admin.
    moreBtn:               `//button[contains(normalize-space(.),'More')]`,
    reassignApproverOption: `//*[@role='menuitem'][contains(normalize-space(),'Reassign Workflow Approver')]`,
    reassignApproverField: `//div[@role='dialog']//input[contains(@placeholder,'Select Approver')]`,
    reassignApproverOpen:  `//div[@role='dialog']//*[contains(normalize-space(text()),'New Reassign Approver')]/following::button[normalize-space(@aria-label)='Open' or normalize-space(.)='Open'][1]`,
    reassignAdminOption:   `//li[@role='option'][normalize-space(.)='NSEF Support Admin']`,
    reassignReasonField:   `//div[@role='dialog']//textarea`,
    reassignSubmitBtn:     `//div[@role='dialog']//button[normalize-space(.)='Reassign']`,
};
