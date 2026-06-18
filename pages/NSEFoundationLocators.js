// NSE Foundation — CXO → Direct PO → GRN → Invoice Workflow Locators

export const NSEFoundation_Locators = {

    // ── Login ─────────────────────────────────────────────────────────────────
    loginEmailField:    '[placeholder="Enter your email"]',
    loginContinueBtn:   'button:has-text("Continue")',
    loginPasswordField: 'input[type="password"]',
    loginSubmitBtn:     'button:has-text("Log In")',

    // ── Navigation ────────────────────────────────────────────────────────────
    cxoTab:        '//button[@data-slot="tabs-trigger"][contains(normalize-space(.),"CXO")]',  // CXO tab by text
    createCxoBtn:  'button:has-text("Create CXO")',

    // ── CXO Create – Title / Summary ─────────────────────────────────────────
    cxoTitle:   '[placeholder="Title of the document goes here"]',
    cxoSummary: '[placeholder="Summary of the document"]',

    // ── Expand ALL sections at once ───────────────────────────────────────────
    // The ^ toggle is the first button in the same container as the title field.
    // Anchor off the title placeholder so it's stable regardless of Ask Aiera bar.
    cxoExpandAllSections: '//*[@placeholder="Title of the document goes here"]/ancestor::div[3]//button[1]',

    // ── Header Details dropdowns (label-following XPath) ─────────────────────
    // Pattern reused from allLocators.js: find label text → next combobox in DOM
    cxoCompany:            "(//*[contains(normalize-space(text()),'Company')]/following::button[@role='combobox'])[1]",
    cxoDepartment:         "(//*[contains(normalize-space(text()),'Department')]/following::button[@role='combobox'])[1]",
    cxoFunction:           "(//*[contains(normalize-space(text()),'Function')]/following::button[@role='combobox'])[1]",
    cxoCurrency:           "(//*[contains(normalize-space(text()),'Currency')]/following::button[@role='combobox'])[1]",
    cxoType:               "(//*[contains(normalize-space(text()),'CXO Type')]/following::button[@role='combobox'])[1]",
    cxoTransactionFlow:    "(//*[contains(normalize-space(text()),'Transaction Flow Type')]/following::button[@role='combobox'])[1]",
    cxoExpenseNature:      "(//*[contains(normalize-space(text()),'Expense Nature')]/following::button[@role='combobox'])[1]",

    // Dropdown option list (generic — use getByRole('option') in actions)
    dropdownOption: (text) => `//div[@role='option'][normalize-space()='${text}']`,
    dropdownFirstOption: "(//div[@role='option'])[1]",
    dropdownSearchBox: '[placeholder="Search..."]',

    // ── Basic Information ─────────────────────────────────────────────────────
    cxoStartDate:         "(//*[contains(normalize-space(text()),'Start Date')]/following::input[@placeholder='Select date'] | //*[contains(normalize-space(text()),'Start Date')]/following::div[contains(@class,'date')])[1]",
    cxoStartDatePicker:   "(//*[contains(normalize-space(text()),'Start Date')]/following::button[contains(@class,'calendar') or @aria-label='calendar'])[1]",
    cxoEndDate:           "(//*[contains(normalize-space(text()),'End Date')]/following::input[@placeholder='Select date'] | //*[contains(normalize-space(text()),'End Date')]/following::div[contains(@class,'date')])[1]",

    // Date field trigger buttons (the "Select date" clickable area)
    cxoStartDateTrigger:  "(//*[contains(normalize-space(text()),'Start Date')]/following::div[contains(text(),'Select date') or @placeholder='Select date'])[1]",
    cxoEndDateTrigger:    "(//*[contains(normalize-space(text()),'End Date')]/following::div[contains(text(),'Select date') or @placeholder='Select date'])[1]",

    // Calendar navigation
    calendarPrevBtn:  "button[aria-label='Go to previous month'], button.rdp-nav_button_previous, button:has(svg)[aria-label*='prev']",
    calendarNextBtn:  "button[aria-label='Go to next month'], button.rdp-nav_button_next, button:has(svg)[aria-label*='next']",
    calendarDayBtn:   (day) => `//button[@name='day'][normalize-space()='${day}'] | //td[normalize-space()='${day}']//button`,

    cxoTypeOfProcurement: "(//*[contains(normalize-space(text()),'Type of Procurement')]/following::div[contains(@class,'select') or @role='combobox'])[1]",
    cxoFinancialYear:     "(//*[contains(normalize-space(text()),'Financial Year')]/following::div[contains(@class,'select') or @role='combobox'])[1]",

    // ── Particulars of Procurement ────────────────────────────────────────────
    cxoExistingApps:       "(//*[contains(normalize-space(text()),'existing applications')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoBusinessCompliance: "(//*[contains(normalize-space(text()),'business requirement or compliance')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoMinCommitPeriod:    "(//*[contains(normalize-space(text()),'Minimum Commitment period')]/following::input)[1]",
    cxoCloudExposure:      "(//*[contains(normalize-space(text()),'cloud exposure')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoMeitY:              "(//*[contains(normalize-space(text()),'MeitY')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoDetailsOtherAgency: "(//*[contains(normalize-space(text()),'Details of any other agency')]/following::input)[1]",
    cxoSebiOutsourcing:    "(//*[contains(normalize-space(text()),'SEBI')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoNseDataTransfer:    "(//*[contains(normalize-space(text()),'transfer or sharing of NSE data')]/following::div[@role='combobox' or contains(@class,'select')])[1]",
    cxoNatureDataShared:   "(//*[contains(normalize-space(text()),'nature of data being shared')]/following::input)[1]",
    cxoRpwd:               "(//*[contains(normalize-space(text()),'RPwD')]/following::div[@role='combobox' or contains(@class,'select')])[1]",

    // ── Item Details – Line Item Table ────────────────────────────────────────
    // Table uses div-based rows with data-index attribute.
    // Row: [data-index="0"]  |  3 children: sticky-left | mid-scrollable | sticky-right
    // Mid-scrollable children (nth-child, 1-based):
    //   1=Name  2=Desc  3=Qty  4=SuggestedPrice  5=Amount  6=BRF
    //   7=ProjectName  8=Vertical  9=GLAccount  10=ProfitCenter  11=CostCenter
    //   12=SEBICategorization  13=SubSegment  14=ProjectCategory  15=NatureOfExpense

    // Item Details section title textarea value (used in JS to find the right "Add row")
    itemDetailsSectionTitle: 'Item Details',

    // Helper: mid-section cell by 1-based index
    // Usage: page.locator(L.itemMidCell(3))  →  Qty cell
    itemMidCell: (n) => `[data-index="0"] > div:nth-child(2) > div:nth-child(${n})`,

    // Individual cell shortcuts
    itemNameCell:               '[data-index="0"] > div:nth-child(2) > div:nth-child(1)',
    itemDescCell:               '[data-index="0"] > div:nth-child(2) > div:nth-child(2)',
    itemQtyCell:                '[data-index="0"] > div:nth-child(2) > div:nth-child(3)',
    itemSuggestedPriceCell:     '[data-index="0"] > div:nth-child(2) > div:nth-child(4)',
    itemBrfCell:                '[data-index="0"] > div:nth-child(2) > div:nth-child(6)',
    itemProjectNameCell:        '[data-index="0"] > div:nth-child(2) > div:nth-child(7)',
    itemVerticalCell:           '[data-index="0"] > div:nth-child(2) > div:nth-child(8)',
    itemGlAccountCell:          '[data-index="0"] > div:nth-child(2) > div:nth-child(9)',
    itemProfitCenterCell:       '[data-index="0"] > div:nth-child(2) > div:nth-child(10)',
    itemCostCenterCell:         '[data-index="0"] > div:nth-child(2) > div:nth-child(11)',
    itemSebiCategorizationCell: '[data-index="0"] > div:nth-child(2) > div:nth-child(12)',
    itemSubSegmentCell:         '[data-index="0"] > div:nth-child(2) > div:nth-child(13)',
    itemProjectCategoryCell:    '[data-index="0"] > div:nth-child(2) > div:nth-child(14)',
    itemNatureOfExpenseCell:    '[data-index="0"] > div:nth-child(2) > div:nth-child(15)',

    // Active input inside a clicked cell
    itemActiveTextInput:   'input:not([disabled]):not([type="file"])',
    itemActiveNumberInput: 'input[placeholder="Enter a number"]:not([disabled])',

    // ── Intake Listing → Process → Send for Sourcing ──────────────────────────
    // Search input on the intake listing is hidden (width:0) until its img icon is clicked
    intakeListingSearchIcon:  '//a[@href="/intakes/create"]/parent::*//img[preceding-sibling::input or following-sibling::input]',
    intakeListingSearchInput: '//a[@href="/intakes/create"]/parent::*//input',
    // Row whose Code column (td[1]) matches — used as a function for dynamic code
    intakeRowByCode: (code) => `//tbody/tr[contains(normalize-space(td[1]),"${code}")]`,

    intakeProcessBtn: '//button[normalize-space(.)="Process"]',
    // Process opens a dropdown menu: Create PR | Send For Sourcing | Send For Negotiation
    // (actual casing is "Send For Sourcing" — XPath text match is case-sensitive)
    intakeSendForSourcingOption: '//*[@role="menuitem"][contains(normalize-space(.),"Send For Sourcing") or contains(normalize-space(.),"Send for Sourcing")]',

    // ── New Sourcing Event page (after Send For Sourcing) ─────────────────────
    sourcingExpandAllBtn: `(//button[@data-state='closed'])[4]`,
    sourcingSubmitBtn:    '//button[normalize-space(.)="Submit"]',

    // Event Information — unfilled mandatory fields
    sourcingPaymentTerms:         `(//*[contains(normalize-space(text()),'Payment Terms')]/following::button[@role='combobox'])[1]`,
    sourcingExpectedDeliveryDate: `(//*[contains(normalize-space(text()),'Expected Delivery Date')]/following::*[contains(text(),'Select date') or @placeholder='Select date'])[1]`,
    sourcingCommercialBidDueDate: `(//*[contains(normalize-space(text()),'Commercial Bid Due Date')]/following::*[contains(text(),'Select date') or @placeholder='Select date'])[1]`,
    sourcingTechnicalBidDueDate:  `(//*[contains(normalize-space(text()),'Technical Bid Due Date')]/following::*[contains(text(),'Select date') or @placeholder='Select date'])[1]`,

    // ── Quote Request (RFX) navigation ────────────────────────────────────────
    sourcingNavTab:        `//*[@role="tab" or @data-slot="tabs-trigger"][contains(normalize-space(.),"Sourcing")]`,
    quoteRequestMenuItem:  `//a[@href="/quote-requests"] | //*[@role="menuitem"][contains(normalize-space(.),"Quote Request")] | //*[normalize-space(text())="Quote Request"]`,
    quoteRequestSearchInput: `//input[@data-slot="input" or contains(@placeholder,"Search")]`,
    quoteRequestRowByCode: (code) => `//tbody/tr[contains(normalize-space(.),"${code}")]`,

    // RFX view page — supplier quote
    rfxSubmitQuoteBtn:        `//*[self::button or self::a][contains(normalize-space(.),'Submit Quote')]`,
    rfxCommercialQuoteOption: `//*[@role='menuitem'][contains(normalize-space(.),'Commercial Quote')] | //button[contains(normalize-space(.),'Commercial Quote')]`,

    // RFX view — More → Foreclose
    rfxMoreBtn:             `//button[contains(normalize-space(.),'More')]`,
    rfxForecloseOption:     `//*[@role='menuitem'][contains(normalize-space(.),'Foreclose')] | //button[contains(normalize-space(.),'Foreclose')]`,
    rfxForecloseReasonField: `//div[@role='dialog']//textarea | //div[@role='dialog']//input[not(@type='file') and not(@type='hidden')]`,
    rfxForecloseSubmitBtn:  `//div[@role='dialog']//button[contains(normalize-space(.),'Submit') or normalize-space(.)='Confirm' or normalize-space(.)='Foreclose']`,

    // RFX — Award flow
    rfxAnalysisTab:          `//*[@role='tab' or @data-slot='tabs-trigger'][contains(normalize-space(.),'Analysis')]`,
    rfxAwardBtn:             `//button[normalize-space(.)='Award']`,
    // Award allocation table cells (stable id suffixes; prefix varies per quote)
    awardPendingQtyCell:     `td[id$="pendingAwardedQuantity"]`,
    awardAllocatedQtyCell:   `td[id$="allocatedQuantity"]:not([id$="pendingAwardedQuantity"])`,
    workflowSummarySubmitBtn: `//div[@role='dialog']//button[contains(normalize-space(.),'Submit')]`,
    workflowStagesBtn:       `//button[contains(normalize-space(.),'Workflow Stages')] | //*[normalize-space(text())='Workflow Stages']`,
    workflowCompletedStatus: `//*[normalize-space(text())='Completed']`,
    // Overall workflow badge beside the "Workflow N" header in the stages popup
    // (shows "Active" while running, "Completed" when done — per-stage badges
    // also say "Completed", so the check must read this one specifically)
    workflowOverallStatusBadge: `//span[contains(@class,'font-bold')][starts-with(normalize-space(),'Workflow')]/following-sibling::div[1]//span | //span[starts-with(normalize-space(text()),'Workflow ')]/following-sibling::div[1]`,
    workflowStagesCloseBtn:  `//button[.//span[normalize-space(text())='Close']] | //button[@aria-label='Close'] | //button[contains(@class,'absolute')][.//*[name()='svg' and contains(@class,'lucide-x')]]`,
    // Back button beside the award code (user-confirmed locator)
    awardBackArrow:          `//h1[contains(text(),'AWD-FNSE')]/preceding-sibling::button[1]`,

    // ── Shared approval controls (CXO + award workflows) ──────────────────────
    approveBtn:            `//button[normalize-space(text())='Approve']`,
    approveBtnConfirm:     `(//button[normalize-space(text())='Approve'])[2]`,
    approveCommentsField:  `[placeholder="Enter your comments..."]`,
    // CXO "released" terminal state (badge text, not in a table/nav)
    cxoReleasedStatus:     `//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]`,

    // More → Reassign Workflow Approver dialog (pattern from intake workflow suite)
    reassignApproverOption:  `//*[@role='menuitem'][contains(normalize-space(),'Reassign Workflow Approver')] | //button[contains(normalize-space(),'Reassign Workflow Approver')] | //li[contains(normalize-space(),'Reassign Workflow Approver')]`,
    reassignUserDropdown:    `(//*[@role='dialog']//button[@aria-haspopup='dialog'])[1]`,
    reassignAdminOption:     `[data-value="NSEF Support Admin"]`,
    reassignReasonField:     `//*[@role='dialog']//textarea`,
    reassignSubmitBtn:       `//*[@role='dialog']//button[normalize-space(text())='Reassign'] | //*[@role='dialog']//button[normalize-space(text())='Submit']`,
    rfxAwardsTab:            `//*[@role='tab' or @data-slot='tabs-trigger'][contains(normalize-space(.),'Awards')]`,
    awardedStatusBadge:      `//*[normalize-space(text())='Awarded']`,
    requisitionProcessing:   `//*[contains(normalize-space(text()),'Processing')]`,
    // Requisition value is a clickable <p>, not an <a>, beside the "Requisition" label
    requisitionCodeLink:     `//label[contains(normalize-space(.),'Requisition')]/following-sibling::p[1] | (//*[contains(normalize-space(text()),'Requisition')]/following::p[contains(@class,'cursor-pointer')])[1]`,

    // Requisition (PR) — edit → submit (old capp domain, not v4; MUI v4 + react-datepicker)
    prEditBtn: `(//button[@progresssize='14'])[4]`,
    prEffectiveFromInput:  `input[placeholder^="Enter Effective from date"]`,
    prEffectiveToInput:    `input[placeholder^="Enter Effective to date"]`,
    prPurchaseTypeInput:   `input[id="Purchase Type"]`,
    prAutocompleteOption:  `[role="option"], .MuiAutocomplete-option`,
    prInwardRequiredYes:   `div[id="Inward Required"] input[type="radio"][value="1"]`,
    prInwardMatchQuantity: `div[id="Inward Matching Criterion"] input[type="radio"][value="quantity"]`,
    prSubmitBtn:           `//button[normalize-space(.)='Submit']`,
    prSubmittedStatus:     `//*[normalize-space(text())='Submitted']`,
    // PR status badge sits beside the PR code in the header
    prStatusBadge: (status) => `//*[normalize-space(text())='${status}']`,

    // Quote page
    quotePreferredCurrency: `(//*[contains(normalize-space(text()),'Preferred Currency')]/following::button[@role='combobox'])[1]`,
    // Editable Unit Rate cell in the quote item grid (user-confirmed locator)
    quoteUnitRateCell:      `[class="w-full h-full flex items-center outline-primary relative cursor-pointer p-[3.5px] px-[7px]"]`,
    quoteSubmitBtn:         `//button[contains(normalize-space(.),'Submit Quote')]`,
    quotedStatusBadge:      `//*[normalize-space(text())='Quoted']`,
    // RFX header status badge while the sourcing event awaits approval (next to
    // the RFX code). Disappears once the RFX is approved and goes live.
    rfxPendingApprovalBadge: `//*[normalize-space(text())='Pending Approval']`,

    // Supplier Selection — Add Supplier popup
    sourcingAddSupplierBtn:       `//button[contains(.,'Add Supplier')]`,
    sourcingSupplierSearch:       `//div[@role='dialog']//input`,
    sourcingSupplierOption: (name) => `//div[@role='dialog']//*[contains(normalize-space(.),"${name}") and not(.//*[contains(normalize-space(.),"${name}")])]`,
    sourcingSupplierPopupSubmit:  `//div[@role='dialog']//button[normalize-space(.)='Submit']`,

    // ── PR Transactions → Conversions → PRC → PO ──────────────────────────────
    // PR detail tabs: Overview | Process | Transactions (role=tab)
    prTransactionsTab:    `//*[@role='tab' or @data-slot='tabs-trigger' or self::button][normalize-space(.)='Transactions']`,
    // Collapsible "Conversions" section header inside the Transactions tab
    prConversionsSection: `//*[normalize-space(text())='Conversions']`,
    // PRC code link in the Conversions table (code is dynamic, e.g. PRC-NSEFN-26-37)
    prcCodeLink:          `//a[starts-with(normalize-space(.),'PRC-')] | //*[contains(@class,'cursor-pointer')][starts-with(normalize-space(.),'PRC-')] | //td//*[starts-with(normalize-space(.),'PRC-')]`,
    // Requisition Conversion View → "PO(s)" column value reads "POs(N)" (the blue
    // link); hovering it reveals a popover containing the PO code link. Match only
    // "POs(" so we hit the value, NOT the gray "PO(s)" column label.
    conversionPoCountLink: `//*[contains(normalize-space(text()),'POs(')]`,
    // PO code (shown in the hover popover; code is dynamic, e.g. PO-NSEFN-26-96)
    poCodeLink:           `//a[starts-with(normalize-space(.),'PO-NSEF')] | //span[starts-with(normalize-space(.),'PO-NSEF')] | //p[starts-with(normalize-space(.),'PO-NSEF')] | //*[starts-with(normalize-space(text()),'PO-NSEF')]`,

    // ── PO / GRN approval (capp v4 header — same modal for both) ──────────────
    // "Approve" button in the header; the confirm modal has a notes textarea + Approve
    poApproveBtn:         `//button[normalize-space(.)='Approve']`,
    poApproveNotesField:  `//textarea[@placeholder='Write your notes here'] | //div[@role='dialog']//textarea`,
    // Confirm button: the Approve that follows the notes textarea (not the header one)
    poApproveConfirmBtn:  `(//textarea[@placeholder='Write your notes here']/following::button[normalize-space(.)='Approve'])[1] | (//div[@role='dialog']//button[normalize-space(.)='Approve'])[1]`,
    // After all approvals the PO badge reads "Submitted" and a "Create" dropdown appears
    poSubmittedStatus:    `//*[normalize-space(text())='Submitted']`,
    poCreateBtn:          `//button[contains(normalize-space(.),'Create')]`,
    poCreateGrnOption:    `//li[@role='menuitem'][normalize-space(.)='GRN'] | //*[@role='menuitem'][normalize-space(.)='GRN']`,
    // "Select PO Items" popup → Submit. The PO page has 3 HIDDEN se-btn "Submit"
    // buttons; the visible popup Submit is a MUI button INSIDE the dialog — so
    // scope to the dialog or a .first() picks a hidden one and times out.
    selectPoItemsSubmitBtn: `//div[@role='dialog']//button[normalize-space(.)='Submit'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Submit']`,

    // ── GRN Create form ───────────────────────────────────────────────────────
    grnInvoiceNumberInput:   `(//*[contains(normalize-space(text()),'Invoice Number')]/following::input)[1]`,
    grnDeliveryChallanInput: `(//*[contains(normalize-space(text()),'Delivery challan')]/following::input)[1]`,
    grnDeliveryNoteRefInput: `(//*[contains(normalize-space(text()),'Delivery Note Reference')]/following::input)[1]`,
    // Document Date accepts typed input ("18 Jun 2026" → renders "18/06/2026")
    grnDocumentDateInput:    `input[placeholder="Enter Document Date"]`,
    // Create GRN page header Submit — single visible MUI button (text node)
    grnSubmitBtn:            `//button[normalize-space(.)='Submit']`,
    // "Workflow Summary" popup → Submit (approvers pre-populated). Same modal
    // component as Select PO Items, so scope to the dialog.
    grnWorkflowSummarySubmitBtn: `//div[@role='dialog']//button[normalize-space(.)='Submit'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Submit']`,
    // Line items AG Grid — column header (used to confirm the grid rendered;
    // cell values are read by col-id in the action). AG headers can wrap the
    // label in extra nodes, so match with contains.
    grnLineItemColHeader: (text) => `//*[@role='columnheader'][contains(normalize-space(.),'${text}')]`,
    // GRN terminal state after approval
    grnInwardedStatus:    `//*[normalize-space(text())='Inwarded']`,

    // ── PO → Invoice (Create → Invoice → /invoices/new) ───────────────────────
    poCreateInvoiceOption: `//li[@role='menuitem'][normalize-space(.)='Invoice'] | //*[@role='menuitem'][normalize-space(.)='Invoice']`,
    // "Confirm Invoice Creation" popup → Proceed (MUI button in dialog)
    confirmInvoiceProceedBtn: `//div[@role='dialog']//button[normalize-space(.)='Proceed'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Proceed']`,

    // Create Invoice form
    // Document upload: first file input (accepts PDF/JPEG/PNG/TIFF, NOT the CAD one)
    invoiceUploadInput:   `input[type="file"][accept*="application/pdf"]:not([accept*="dwg"])`,
    invoiceNumberInput:   `(//*[contains(normalize-space(text()),'Invoice Number')]/following::input)[1]`,
    // Invoice Date is a react-datepicker (use _pickReactDate)
    invoiceDateInput:     `input[placeholder="Enter Invoice Date"]`,
    // Period based Invoicing? / Extra billing — MUI Autocomplete (Yes/No options)
    invoicePeriodBasedField:  `(//*[contains(normalize-space(text()),'Period based Invoicing')]/following::input)[1]`,
    invoiceExtraBillingField: `(//*[contains(normalize-space(text()),'Extra billing')]/following::input)[1]`,
    autocompleteNoOption:     `//li[@role='option'][normalize-space(.)='No']`,

    // Line item FIX → "Item Matching" popup
    invoiceFixBtn:            `//button[normalize-space(.)='FIX']`,
    // "Add GRN" multi-select autocomplete in the Item Matching dialog
    itemMatchingAddGrnField:  `(//*[contains(normalize-space(text()),'Add GRN')]/following::input)[1]`,
    itemMatchingGrnOption: (code) => `//li[@role='option'][contains(normalize-space(.),'${code}')]`,
    itemMatchingSubmitBtn:    `//div[@role='dialog']//button[normalize-space(.)='Submit'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Submit']`,

    // Create Invoice page header Submit (single visible MUI button, not in dialog)
    invoiceSubmitBtn:         `//button[normalize-space(.)='Submit']`,
    // "Validations" popup → Proceed (MUI in dialog)
    invoiceValidationProceedBtn: `//div[@role='dialog']//button[normalize-space(.)='Proceed'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Proceed']`,
    // "Workflow Summary" popup → Submit (dialog-scoped)
    invoiceWorkflowSummarySubmitBtn: `//div[@role='dialog']//button[normalize-space(.)='Submit'] | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Submit']`,
    // After all approvals the invoice goes to "Pending Sync" — the test's terminal
    // state. It only flips to "Accounted" once an external party acknowledges it
    // (out of scope here), so we assert Pending Sync, not Accounted.
    invoicePendingSyncStatus:     `//*[normalize-space(text())='Pending Sync']`,
    invoicePendingApprovalStatus: `//*[normalize-space(text())='Pending Approval']`,

    // ── Submit ────────────────────────────────────────────────────────────────
    submitBtn: 'button:has-text("Submit")',

    // ── Post-submit assertions ────────────────────────────────────────────────
    cxoStatusBadge: '[class*="badge"], [class*="status"], span:has-text("Submitted"), span:has-text("Draft")',

};
