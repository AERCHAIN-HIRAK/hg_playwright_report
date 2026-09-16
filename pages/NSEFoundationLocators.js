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
    // The title textarea's placeholder is now EMPTY — the hint is a sibling
    // overlay div (so the red * can be styled). Anchor on text-[18px], unique to
    // the title (sections are 12.25px, summary 14px) and it survives typing;
    // anchoring on the overlay text breaks as soon as the field has a value.
    cxoTitle:   'textarea[class*="text-[18px]"]',
    cxoSummary: '[placeholder="Summary of the document"]',

    // ── Expand ALL sections at once ───────────────────────────────────────────
    // The expand/collapse-all toggle, top-right of the document header. Anchored
    // on its chevrons-up-down icon: unique on the page and index-free, unlike a
    // positional match which drifts when the header renders extra hidden buttons.
    cxoExpandAllSections: 'button:has(svg.lucide-chevrons-up-down)',

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
    // Cancel reuses the same reason-dialog shape as Foreclose (sheet scenario 98).
    rfxCancelOption:        `//*[@role='menuitem'][normalize-space(.)='Cancel']`,
    rfxCancelledBadge:      `//*[normalize-space()='Cancelled']`,

    // RFX — Award flow
    rfxAnalysisTab:          `//*[@role='tab' or @data-slot='tabs-trigger'][contains(normalize-space(.),'Analysis')]`,
    rfxAwardBtn:             `//button[normalize-space(.)='Award']`,
    // Award allocation table cells (stable id suffixes; prefix varies per quote)
    awardPendingQtyCell:     `td[id$="pendingAwardedQuantity"]`,
    // ── Award grid: section rows (sheet scenario 21) ─────────────────────────
    // The New Award page (/rfx/<id>/new-award) is ONE grid in which the
    // Event Information / Justification Section / Cost Approval Note "sections"
    // are just rows. Two things bite here, both verified live 2026-09-07:
    //   · the internal row index in the cell id is NOT the visible "#" column
    //     (Initial Quote Remarks shows as #11 but is cell_12_*), so a row must be
    //     found by its LABEL, never by the number on screen;
    //   · every row's value lives in ONE wide cell (595px) whose id ends
    //     "<supplierId>::price"; the row's other cells are zero-width and
    //     invisible, so `.last()` on the row picks an unclickable cell.
    awardRowLabelCells:      `td[id$="_product"]`,
    awardRowValueCell:       (row) => `td[id^="cell_${row}_"][id$="::price"]`,
    // Candidate homes for a hover reveal, tried in order.
    hoverRevealCandidates:   `[role="tooltip"], [data-radix-popper-content-wrapper], [class*="ant-popover-inner"], [class*="MuiTooltip-tooltip"], [data-state="delayed-open"][data-side]`,
    // New Sourcing event (Intake → Process → Send For Sourcing) item grid.
    // Every grid cell carries id="cell_<rowUuid>_<field>", so the Quantity cell
    // is addressable by field name instead of by column position — the
    // positional xpath in allLocators (intakeItemQty / intakeItemQtyEmptyRow)
    // silently targets the wrong column when the grid gains a column.
    // Verified live 2026-09-09: clicking it mounts <input> pre-filled "100.00".
    sourcingItemQtyCell:     `[id^="cell_"][id$="_quantity"]`,

    awardAllocatedQtyCell:   `td[id$="allocatedQuantity"]:not([id$="pendingAwardedQuantity"])`,
    workflowSummarySubmitBtn: `//div[@role='dialog']//button[contains(normalize-space(.),'Submit')]`,
    // Dialog buttons must be addressed with a FULLY-QUALIFIED path per union branch.
    // Do NOT append //button to `muiDialog`: that locator is an XPath union
    // (A | B), so the suffix binds to B alone and .first() then matches the dialog
    // DIV — a click lands on the dialog body and nothing happens. That is exactly
    // how a "Proceed" click was silently swallowed on 2026-09-08.
    dialogProceedBtn2:  `//div[@role='dialog']//button[normalize-space(.)='Proceed']`
        + ` | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Proceed']`,
    dialogMakeChangesBtn: `//div[@role='dialog']//button[normalize-space(.)='Make Changes']`
        + ` | //div[contains(@class,'MuiDialog')]//button[normalize-space(.)='Make Changes']`,
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
    reassignSubmitBtn:       `//*[@role='dialog']//button[normalize-space(.)='Reassign'] | //*[@role='dialog']//button[normalize-space(.)='Submit']`,
    rfxAwardsTab:            `//*[@role='tab' or @data-slot='tabs-trigger'][contains(normalize-space(.),'Awards')]`,
    // RFX → Awards tab renders the award summary as "<label>:" / "<value>" pairs
    // (Award Code:, Awarded Suppliers:, Total Value:, Requisition:, Status:).
    // This is the ONLY place the AWARD's own status is shown — the award detail
    // page shows the parent RFX's badge and the LINE ITEM's status, both of
    // which read "Awarded" on an award that is in fact Rejected (verified
    // 2026-09-10 on AWD-FNSE-26-198).
    // Award → More → Cancel opens a dedicated "Cancel Award" dialog. It does NOT
    // follow the CXO/intake shape: the confirm is labelled "Cancel Award", and
    // the DISMISS is "Keep Award" — clicking the wrong one silently keeps the
    // award. Reason is a mandatory textarea. Verified live 2026-09-10.
    awardCancelDialog:       `//*[@role='dialog'][.//*[normalize-space(text())='Cancel Award']]`,
    awardCancelReason:       `//*[@role='dialog']//textarea`,
    awardCancelConfirm:      `//*[@role='dialog']//button[normalize-space(.)='Cancel Award']`,
    awardCancelDismiss:      `//*[@role='dialog']//button[normalize-space(.)='Keep Award']`,

    // The Awards view renders each field as <label>Award Code:</label><p>AWD-…</p>.
    // Match on normalize-space(.) — the element's whole string value — NOT
    // normalize-space(text()), which takes only the FIRST text node. React emits
    // `{label}:` as two text nodes ("Award Code" + ":"), so the text() form
    // matched zero nodes for every label on this page and readAwardSummary
    // silently returned empty strings (verified in the DOM 2026-09-11).
    awardsTabLabel:          (label) => `//label[normalize-space()='${label}:']`,
    awardsTabValueFor:       (label) => `//label[normalize-space()='${label}:']/following-sibling::*[1]`,

    // ── Intake Bulk Upload (sheet scenario 10) ────────────────────────────────
    // Verified live 2026-09-11 on /intakes/create. The dialog offers exactly
    // three buttons - Download Template, Upload File, Cancel - and states
    // "You can only create 2000 line items via Bulk Upload".
    //
    // "Upload File" is NOT a label on the file input: the dialog's lone
    // input[type=file] is inert, and setInputFiles on it does nothing at all
    // (no request, no toast, no grid change). The button mounts a real OS file
    // chooser, so the upload must go through page.waitForEvent('filechooser').
    intakeBulkUploadBtn:      `//button[contains(normalize-space(.),'Bulk Upload')]`,
    bulkDownloadTemplateBtn:  `//*[@role='dialog']//button[contains(normalize-space(.),'Download Template')]`,
    bulkUploadFileBtn:        `//*[@role='dialog']//button[normalize-space(.)='Upload File']`,
    // Line-item grid cell. The grid is VIRTUALISED - roughly 31 of 100 rows are
    // mounted at any moment - so counting these is an undercount, never a row
    // count. Use countIntakeLineItemRows(), which scrolls and reads the serial
    // column.
    intakeGridCell:           `//div[@class="w-full h-full flex items-center outline-primary relative cursor-pointer p-[3.5px] px-[7px]"]`,

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
    // "Currencies" on the Event Information section of the Send-for-Sourcing /
    // RFX edit form. MULTI-select: the menu offers "Select All" plus one row per
    // currency (INR/USD/EUR/CAD/GBP), has a Search box, and selection shows as a
    // lucide-check rather than aria-selected — so aria state cannot be trusted.
    // An EXACT text match is required: contains() would also hit "Preferred
    // Currency" and "Transaction Currency Exchange Rate" on the same form.
    sourcingCurrenciesField: `(//*[normalize-space(text())='Currencies']/following::button[@role='combobox'])[1]`,
    currencyMultiOption:     (label) => `//*[@role='option'][contains(normalize-space(.),'${label}')]`,
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

    // ── Reject-edit suite (GRN + Invoice, old capp domain) — PROVISIONAL ─────────
    // Old-capp approval pages expose a header Reject beside Approve; the notes
    // modal is shared (poApproveNotesField). GRN/Invoice edit re-uses AG-grid
    // col-ids. Selectors below must be verified on the first live run.
    cappRejectBtn:        `//button[normalize-space(.)='Reject']`,
    cappRejectConfirmBtn: `(//div[@role='dialog']//button[normalize-space(.)='Reject'])[1] | (//textarea[@placeholder='Write your notes here']/following::button[normalize-space(.)='Reject'])[1]`,
    cappEditBtn:          `//button[normalize-space(.)='Edit']`,
    // Rejected GRN/Invoice expose no text "Edit" (More holds only "Reassign
    // User") — the edit affordance is an unlabelled header pencil icon button.
    cappEditIconBtn:      `//button[.//img[@alt='Edit']]`,
    // GRN Received-qty cell (AG grid col-id, row 0)
    // PO edit form, line-item Quantity (ag-grid). Modelled on grnReceivedCell:
    // the grid is found by a column header, then row 0's cell by col-id. The
    // col-id is a guess pending the first live dump - editPoLowerQtyAndSubmit
    // falls back to dumpEditableFields when this misses, so a wrong guess costs
    // information rather than a silent no-op.
    poQuantityCell:       `//div[@role='grid'][.//*[@role='columnheader'][contains(normalize-space(.),'Quantity')]]//div[contains(@class,'ag-row')][@row-index='0']//div[contains(@col-id,'quantity')]`,
    grnReceivedCell:      `//div[@role='grid'][.//*[@role='columnheader'][contains(normalize-space(.),'Received')]]//div[@class='ag-row' or contains(@class,'ag-row')][@row-index='0']//div[@col-id='line_items_received']`,
    grnInwardedOrRejected: `//*[normalize-space(text())='Rejected' or normalize-space(text())='Inwarded']`,
    // Invoice line-item qty (AG grid, row 0) — the "* Invoice" column under the
    // QUANTITY group. Distinct from the GRN's line_items_received.
    invoiceQtyCell:       `//div[@role='grid']//div[contains(@class,'ag-row')][@row-index='0']//div[@col-id='line_items_quantity']`,

    // ── Invoice line-item TAX (scenario 58) ──────────────────────────────────
    // Same AG grid as invoiceQtyCell, different col-id. The tax editor renders in
    // a body-level portal (this grid uses ant-select elsewhere — see nonPoAntOption),
    // so the option is matched in the OPEN dropdown, never inside the cell.
    invoiceTaxCell:        `//div[@role='grid']//div[contains(@class,'ag-row')][@row-index='0']//div[@col-id='line_items_tax']`,
    invoiceNetTaxPctCell:  `//div[@role='grid']//div[contains(@class,'ag-row')][@row-index='0']//div[@col-id='line_items_net_tax_percentage']`,
    invoiceTaxValueCell:   `//div[@role='grid']//div[contains(@class,'ag-row')][@row-index='0']//div[@col-id='line_items_tax_value']`,
    gridSelectDropdownOpen: `.ant-select-dropdown:not(.ant-select-dropdown-hidden)`,
    gridSelectOptionFor: (needle) =>
        `//*[contains(@class,'ant-select-dropdown') and not(contains(@class,'ant-select-dropdown-hidden'))]`
        + `//*[contains(@class,'ant-select-item-option')][contains(normalize-space(.),'${needle}')]`
        + ` | //*[@role='option'][contains(normalize-space(.),'${needle}')]`
        + ` | //li[contains(@class,'MuiMenuItem')][contains(normalize-space(.),'${needle}')]`,

    // Workflow-level status badges used by scenario 58's end-state assertion.
    // Per-stage rows carry their own badges, so readWorkflowRuns() confines the
    // search to the smallest ancestor holding exactly one "Workflow N" label.
    workflowRunLabel: `//*[starts-with(normalize-space(text()),'Workflow ')]`,

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
    // After the external acknowledgement API call, the invoice flips to "Accounted".
    invoiceAccountedStatus:       `//*[normalize-space(text())='Accounted']`,
    // Non-PO invoices in UAT end approvals on "Sync Failed" rather than "Pending
    // Sync" (EBS integration not wired for this template). The ack API still
    // drives them to Accounted — verified live on Invoice-FNSE-26-255.
    invoiceSyncFailedStatus:      `//*[normalize-space(text())='Sync Failed']`,

    // ── Invoice payment ("+ Payment" → Converting to Payment drawer) ───────────
    // "Invoice Amount" value on the invoice Overview header (e.g. "₹ 2,00,000.00").
    invoiceAmountValue:        `(//*[normalize-space(text())='Invoice Amount']/following::*[contains(text(),'₹')])[1]`,
    invoiceAddPaymentBtn:      `//button[contains(normalize-space(.),'Payment')]`,
    paymentDrawerHeading:      `//*[normalize-space(text())='Converting to Payment']`,
    // Submit lives in the drawer header, right after the "Converting to Payment" title.
    paymentSubmitBtn:          `//*[normalize-space(text())='Converting to Payment']/following::button[normalize-space(.)='Submit'][1]`,
    paymentPaidAmountInput:    `[id="Paid Amount"]`,
    paymentUtrInput:           `input[id^="UTR-"]`,
    paymentDateInput:          `input[placeholder="Enter Payment Date"]`,
    // The payment drawer's line-item grid — col-id line_items_actual_amount is
    // unique to this grid (the invoice's own grids don't have it).
    paymentActualAmountCell:   `.ag-row[row-index="0"] [col-id="line_items_actual_amount"]`,
    // Success toast after submit (transient) — assert any non-empty toast.
    paymentSuccessToast:       `[data-sonner-toast], .Toastify__toast, [role="alert"], [role="status"]`,
    // Invoice detail tabs + payment row status.
    invoiceTransactionsTab:    `//*[normalize-space(text())='Transactions']`,
    paymentCompletedStatus:    `//*[normalize-space(text())='Completed']`,

    // ── Submit / Cancel / Save-as-Draft ───────────────────────────────────────
    submitBtn: 'button:has-text("Submit")',
    cancelBtn: 'button:has-text("Cancel")',
    // Save on the CXO create page persists the CXO WITHOUT submitting it into the
    // approval workflow → toast "CXO request saved successfully" → the CXO lands
    // on /cxos/{id}/overview in Draft status. It is an ICON-ONLY button (no text
    // or aria-label) sitting immediately after the "AI Polish" button in the
    // header action group — anchor on AI Polish and take the next sibling button.
    cxoSaveDraftBtn: `xpath=//button[normalize-space(.)='AI Polish']/following-sibling::button[1]`,

    // Icon-only Save on the v4 create pages (CXO and Intake both have one).
    // Anchoring on the icon rather than sibling position survives a change in
    // the button row's layout.
    v4SaveDraftBtn: `//button[.//*[contains(@class,"lucide-save")]]`,
    cxoSavedToast: 'saved successfully',

    // ── CXO create – validation (negative / edge tests) ───────────────────────
    // After an invalid Submit, each section with missing mandatory fields shows
    // a red "N errors!" badge (a <span class="...rounded-full...">N errors!</span>)
    // next to its title, plus transient toasts. NOTE: section titles are
    // <textarea>s, so they cannot be anchored on by text — match the badge spans
    // directly. On a fully empty form the badges render in document order with
    // counts [6, 4, 9, 4, 1, 1] = Header Details, Basic Information,
    // Particulars of Procurement, Purchase Business Case, Item Details,
    // Suggested Suppliers.
    cxoErrorBadgeRegex: /^\d+ errors?!$/,
    // When sections are expanded and Submit is clicked, each unfilled mandatory
    // field gets a red border (class "border-destructive", border rgb(176,21,0))
    // and a red "<field> is empty" helper message. The fields are combobox buttons.
    cxoRedBorderField: 'button[role="combobox"][class*="border-destructive"]',
    cxoFieldEmptyMsgRegex: /is empty$/i,
    // Validation toast messages (substring match — toasts auto-dismiss)
    cxoTitleRequiredToast: 'Please enter the title',
    cxoItemRowRequiredToast: 'At least one row is required',
    cxoHighlightedErrorsToast: 'Seems like there are errors in the highlighted fields',

    // ── Post-submit assertions ────────────────────────────────────────────────
    cxoStatusBadge: '[class*="badge"], [class*="status"], span:has-text("Submitted"), span:has-text("Draft")',

    // ── Org Settings › User Management (Tracks — department access) ────────────
    // VERIFIED against the live UAT env (2026-07-07). The v4 top-bar gear
    // ("Open Settings") opens Org Settings in a NEW BROWSER TAB on a different
    // subdomain (https://nse-capp-admin-uat.aerchain.io). Every step from
    // User Management onward runs on that admin tab; "home" = close the admin
    // tab and return to the still-open v4 dashboard tab.

    // v4 top-bar gear that launches the Org Settings tab
    orgSettingsGearBtn:  'button[aria-label="Open Settings"]',
    // Admin sidebar: "User Management" is an expandable accordion heading (a button)
    adminUserMgmtHeading: '//button[.//p[normalize-space(.)="User Management"] or normalize-space(.)="User Management"]',
    // Its "Users" child link (revealed after expanding)
    adminUsersLink:      '//a[@href="/user-management/users"]',
    // A user row in the Users table, matched by display name (opens "Update User" drawer)
    adminUserRowByName:  (name) => `//table//td[normalize-space(.)="${name}"]`,
    // The "Update User" drawer — signalled by its h6 heading (a clean leaf; note
    // XPath normalize-space(text())="Update User" wrongly returns 0 here, so
    // match on normalize-space(.) instead).
    updateUserDrawer:    '//h6[normalize-space(.)="Update User"]',
    // "Full Access" checkbox beside a given dimension's "Select <Dim>" field.
    // Each dimension row is a MuiStack holding the "Select <Dim>" label + exactly
    // one checkbox. Pass the label text, e.g. "Select Department".
    fullAccessCheckboxFor: (dimensionLabel) =>
        `//label[normalize-space(.)="${dimensionLabel}"]/ancestor::div[contains(@class,"MuiStack-root")][1]//input[@type="checkbox"]`,
    // Update button inside the drawer (disabled until a field changes; exact text
    // avoids matching the "Update User" heading)
    updateBtn:           '//div[contains(@class,"MuiPaper-root")]//button[normalize-space(.)="Update"]',
    // Success toast after Update
    userUpdatedToast:    'User updated successfully',
    // ── Non-PO ("CXO") Invoice — §4 of the NSE Customer Flow Document ─────────
    // CAPTURED LIVE 2026-08-19. This flow leaves V4 (nse-capp-v4-uat) for the V3
    // Ant Design app (nse-capp-uat), so the shell selectors below are Ant while
    // the invoice form itself is MUI.
    //
    // Route: V4 dashboard → "Home" → /home (V3) → Modules panel → Invoice
    //        → /invoices → "Create New" → /invoices/new
    v3HomeLink:              `//*[normalize-space(text())="Home"]`,
    // The all-modules icon: an Ant appstore glyph inside div.modules-toggle.
    v3ModulesToggle:         '.modules-toggle, [aria-label="appstore"]',
    // NOTE: the module is "Invoices" (plural) — there is no exact "Invoice" text.
    // Three nodes match: Recently-visited, the All-Modules group heading, and the
    // child link. openInvoiceModule() tries each until the URL actually changes.
    v3ModuleInvoices:        `//*[normalize-space(text())="Invoices"]`,
    v3ModulesFindInput:      'input[placeholder="Find Modules"]',
    // Real label is "+ Create Invoice" (MUI button) — NOT "Create New".
    invoiceCreateNewBtn:     `//button[contains(normalize-space(.),"Create Invoice")]`,

    // The create form is PROGRESSIVE: only the upload dropzone renders until a
    // document is attached — template/CXO/details appear afterwards.
    nonPoUploadDropzoneText: `//*[contains(normalize-space(text()),"Upload Invoice Document")]`,

    // Every picker on this form is a MUI Autocomplete. Options render in a
    // document-level portal as li.MuiAutocomplete-option.
    muiAcOption:             'li.MuiAutocomplete-option',
    // Generic: the <input> of the autocomplete whose label (or any descendant
    // text) contains `label`. Used by NSEFoundationActions._ac().
    muiAcInputFor: (label) =>
        `//*[contains(@class,"MuiAutocomplete-root")][.//label[contains(normalize-space(.),"${label}")]` +
        ` or contains(normalize-space(.),"${label}")]//input`,
    // Templates picker — placeholder is "Choose Template". Options observed:
    // "RC Invoice", "PO Invoice NSEF", "CXO Template (Dev)", "NSEF Credit Note".
    nonPoTemplateInput:      'input[placeholder="Choose Template"]',
    // CXO selection at the invoice header (§4 Step 2). Lists CXO codes.
    nonPoCxoLabel:           'Select CXO Transaction',
    // Single budget item at header level (§4 Step 3). Does NOT auto-populate from
    // the CXO — it is the intersection of user dimension access + the CXO budget.
    nonPoBrfInput:           'input[placeholder="Select Budget Items"]',

    // Every control on this form carries a STABLE id equal to its visible label
    // (captured 2026-08-19) — no label-proximity guessing needed:
    //   autocompletes / selects : id="Department", id="GL Account", id="BRF - Description"
    //   plain text inputs       : id="Subject-2hUeVYKM8oeG"  (random suffix → prefix match)
    //   date pickers            : no id; addressed by placeholder
    nonPoFieldById:   (label) => `[id="${label}"]`,
    // Vendor Type / RPT FLag (sheet scenarios 73-80). Auto-populated from the
    // chosen supplier's onboarding record, so both are DISABLED text inputs —
    // read them, never fill them.
    //
    // Three traps, all of which made the 2026-09-02 probe wrongly report the
    // fields as absent (corrected 2026-09-08):
    //   1. they live inside a COLLAPSED accordion, so a visible-only field sweep
    //      never sees them — expandNonPoSections() first;
    //   2. the id carries a per-render random suffix ("Vendor Type-V5GCVvt0Av7T"),
    //      so it must be matched by PREFIX;
    //   3. the app's label is misspelt "RPT FLag" (capital L) — match that, not
    //      "RPT Flag".
    // MSME is inconsistent: suffixed on some templates, bare on others, hence the
    // two-branch selector.
    nonPoLabelledField: (label) => `[id="${label}"], [id^="${label}-"]`,
    nonPoSupplierInput: 'input[id="Supplier"]',

    // ── PO Recall (sheet scenario 65) ─────────────────────────────────────────
    // Recall is offered ONLY while the PO is Pending Approval. Verified live
    // 2026-09-08 by reading both menus: Pending-Approval PO-NSEFN-26-213 lists
    // Clone / Recall / Reassign User / Reassign Workflow Approver / Regenerate
    // Document; the approved PO-NSEFN-26-220 lists Clone / Reassign User /
    // Regenerate Document. Every earlier probe checked Submitted/In-progress POs
    // and so concluded — wrongly — that Recall does not exist in this build.
    v3MoreBtn:          `//button[contains(normalize-space(.),'More')]`,
    v3MenuItem:         (label) => `//*[@role='menuitem'][normalize-space()='${label}']`
        + ` | //li[normalize-space()='${label}']`,
    anyV3MenuItem:      `//*[@role='menuitem'] | //li[@role='option']`,
    nonPoTextById:    (label) => `[id^="${label}-"]`,
    nonPoDateByPh:    (ph)    => `input[placeholder="${ph}"]`,

    // Line-item AG grid. Real col-ids captured from the live grid.
    nonPoAddItemBtn:  'button.add-item-button',
    // Any MUI dialog — the Workflow Summary popup is where a budget-ceiling breach
    // is reported (per NSE QA), not on the create page.
    muiDialog:        `//div[@role='dialog'] | //div[contains(@class,'MuiDialog-container')]`,
    // The in-grid Product editor is an ANT AutoComplete (not MUI): its options
    // render in a body-level portal. Captured live from the cell editor markup.
    nonPoProductEditorInput: '.product-auto-complete input.ant-select-selection-search-input',
    nonPoAntOption:          '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option',
    nonPoGridCell:    (colId, row = 0) =>
        `//div[@role='grid']//div[contains(@class,'ag-row')][@row-index='${row}']//div[@col-id='${colId}']`,
    nonPoGridColIds: {
        product: 'line_items_product',
        uom: 'line_items_uom',
        quantity: 'line_items_quantity',
        price: 'line_items_price',
        hsn: 'line_items_hsn',
        tax: 'line_items_tax',
        netTaxPercentage: 'line_items_net_tax_percentage',
        taxValue: 'line_items_tax_value',
        amount: 'line_items_amount',
    },

    // Totals strip: the label and its value are siblings inside one container.
    nonPoTotalFor: (label) =>
        `//*[normalize-space(text())="${label}"]/parent::*`,

    // Mandatory-field validation, as worded by the app: "<Field> is Mandatory"
    // helper texts plus an "Atleast one row is required" toast for the grid.
    nonPoMandatoryHelperText: `//*[contains(normalize-space(.),"is Mandatory")]`,
    nonPoNoRowsToast:         `//*[contains(normalize-space(.),"Atleast one row is required")]`,

    // Budget ceiling breach (§2.4 hard parent check). PROVISIONAL — text not yet
    // observed live; matched loosely so the real wording still trips it.
    budgetExceededError:     `//*[contains(translate(normalize-space(.),"BUDGETEXCD","budgetexcd"),"budget exceed")]`,

    // Cross (X) icon closing the drawer — MUI icon button wrapping a lucide-x svg
    panelCloseIcon:      'div.MuiPaper-root button:has(svg.lucide-x)',

    // ── CXO "More" dropdown + Transactions tab (sheet scenarios 3 & 8) ────────
    // Radix dropdown: items are [role=menuitem]; an unavailable action carries
    // aria-disabled="true" AND data-disabled="". Do NOT test for a "disabled"
    // substring in className — every item's Tailwind class list contains
    // `data-[disabled]:` utilities, so that check is always true.
    cxoMoreButton:            `//button[contains(normalize-space(.),'More')]`,
    cxoMenuItem:              (label) => `//*[@role="menuitem"][normalize-space()="${label}"]`,
    cxoMenuItemDisabled:      (label) => `//*[@role="menuitem"][normalize-space()="${label}"][@aria-disabled="true"]`,
    anyCxoMenuItem:           `//*[@role="menuitem"]`,

    // Transactions tab renders two sections, each with its own table.
    cxoTxnLinkedIntakesHeading:     `//*[normalize-space()="Linked Intakes"]`,
    cxoTxnLinkedNonPoHeading:       `//*[normalize-space()="Linked Non-PO Invoices"]`,
    cxoTxnNoIntakes:                `//*[contains(normalize-space(.),"No intakes found")]`,
    cxoTxnAnyRow:                   `//tbody/tr`,

    // ── Activity Log panel (sheet scenarios 35-37) ────────────────────────────
    // Present on every v4 detail page (CXO, Intake, RFX). The trigger is an
    // icon-only clock button; the panel is a radix sheet with role="dialog" and
    // a download button in its header.
    //
    // The download is generated CLIENT-SIDE (Blob → <a download>) — it fires NO
    // network request, so it can only be asserted via Playwright's `download`
    // event, never by watching for a response.
    activityLogButton:        `//button[.//*[contains(@class,"lucide-clock")]]`,
    activityLogPanel:         `//*[@role="dialog"][.//*[normalize-space()="Activity Log"]]`,
    activityLogTitle:         `//*[normalize-space()="Activity Log"]`,
    // The download control is a DROPDOWN TRIGGER, not a direct download — the
    // button pairs a download icon with a chevron and opens a two-item menu:
    // "Download Activities" and "Download Comments". Clicking the trigger alone
    // fires no download event and no network request.
    activityLogDownloadBtn:   `//*[@role="dialog"]//button[.//*[contains(@class,"lucide-download")]]`,
    activityLogDownloadItem:  (label) => `//*[@role="menuitem"][normalize-space()="${label}"]`,
    activityLogCloseBtn:      `//*[@role="dialog"]//button[.//*[contains(@class,"lucide-x")]]`,
    activityLogEntries:       `//*[@role="dialog"]//*[contains(@class,"lucide-circle-check-big")]`,
    // Add-comment affordance inside the same sheet (verified live 2026-09-04).
    // The send control is the blue right-arrow beside the field: a button whose
    // only child is a lucide-send-horizontal icon. It ships DISABLED and only
    // enables once the textarea is non-empty, so a click must wait for enabled
    // rather than fire straight after fill().
    activityLogCommentInput:  `//*[@role="dialog"]//textarea[@placeholder="Add comment..."]`,
    activityLogCommentSendBtn:`//*[@role="dialog"]//button[.//*[contains(@class,"lucide-send-horizontal")]]`,
    // Feed filter chips: All | Comments | Activities | Audit Logs | Approvals.
    activityLogFilterChip:    (label) => `//*[@role="dialog"]//button[normalize-space()="${label}"]`,

    // ── RFX Analysis tab (sheet scenarios 23, 25, 26, 27, 30) ─────────────────
    // Verified live on RFX-26-231 (2026-08-31).
    rfxAnalysisTabBtn:          `//button[normalize-space()="Analysis"]`,
    rfxEvaluationsTabBtn:       `//button[normalize-space()="Evaluations"]`,
    rfxAwardsTabBtn:            `//button[normalize-space()="Awards"]`,
    rfxExtendDeadlineBtn:       `//button[normalize-space()="Extend Deadline"]`,
    rfxAddEvaluationBtn:        `//button[normalize-space()="Add Evaluation"]`,

    // ── Extend Deadlines dialog (sheet scenario 36) ───────────────────────────
    // Two date TRIGGER BUTTONS (Quote Deadline / Technical Quote Deadline) whose
    // label IS the current value, a #remarks textarea and Cancel / Update.
    // Update stays DISABLED until a date actually changes.
    extendDeadlineDialog:       `//*[@role="dialog"][.//*[contains(normalize-space(),"Extend Deadline")]]`,
    extendDeadlineDateBtns:     `//*[@role="dialog"]//button[starts-with(normalize-space(),"20")]`,
    extendDeadlineRemarks:      `//*[@role="dialog"]//textarea[@id="remarks"]`,
    extendDeadlineUpdateBtn:    `//*[@role="dialog"]//button[normalize-space()="Update"]`,
    // The calendar renders in a Radix popper OUTSIDE the dialog, so day cells
    // must be matched there — not under the dialog node.
    datePickerPopper:           `//*[@data-radix-popper-content-wrapper]`,
    datePickerDay:              (d) => `//*[@data-radix-popper-content-wrapper]//button[normalize-space()="${d}"]`,

    // ── Create Evaluation dialog (sheet scenario 35) ──────────────────────────
    // Same dialog on the Intake → RFX conversion page and on an RFX that has not
    // been quoted yet. Four Radix comboboxes in a fixed order:
    //   0 Section · 1 Assigned Users · 2 Rating Type · 3 Approval Type
    // Their label IS their current value, so they cannot be matched by a static
    // placeholder once something has been picked — index is the stable handle.
    evalCreateDialog:           `//*[@role="dialog"][.//*[normalize-space()="Create Evaluation"]]`,
    evalLabelInput:             `//*[@role="dialog"]//input[@id="label"]`,
    evalCombos:                 `//*[@role="dialog"]//*[@role="combobox"]`,
    evalCreateBtn:              `//*[@role="dialog"]//button[normalize-space()="Create"]`,

    // ── Evaluations tab ───────────────────────────────────────────────────────
    evalCardByLabel:            (label) => `//*[contains(normalize-space(),"${label}")][not(*)]`,
    evalEvaluateBtn:            `//button[normalize-space()="Evaluate"]`,
    evalSubmitBtn:              `//button[normalize-space()="Submit"]`,

    // Header line above the tabs; the value is the sibling text node.
    rfxQuoteDeadlineLabel:      `//*[normalize-space()="Quote Deadline:"]`,
    // Either action means the supplier can still quote.
    rfxQuoteActionBtn:          `//button[normalize-space()="Submit Quote" or normalize-space()="Update Quote"]`,

    // Radix switches carry no accessible label of their own — the label text
    // lives in the PARENT element, so anchor on that.
    analysisSwitch:             (label) => `//*[@role="switch"][parent::*[normalize-space()="${label}"]]`,
    analysisBaseCurrencySwitch: `//*[@role="switch"][parent::*[normalize-space()="Show in base currency"]]`,
    analysisDeletedItemsSwitch: `//*[@role="switch"][parent::*[normalize-space()="Show deleted items"]]`,

    // Download here is a DROPDOWN TRIGGER offering four exports:
    // Analysis / Versions / Benchmarks / Questionnaire.
    analysisDownloadBtn:        `//button[.//*[contains(@class,"lucide-download")]]`,
    analysisDownloadItem:       (label) => `//*[@role="menuitem"][normalize-space()="${label}"]`,

    analysisViewTypeBtn:        `//button[normalize-space()="Select View Type"]`,
    analysisSupplierConfigBtn:  `//button[.//*[contains(@class,"lucide-user-cog")]]`,
    analysisColumnConfigBtn:    `//button[.//*[contains(@class,"lucide-columns3-cog")]]`,

    // Compare renders INLINE on the analysis page (not in a dialog).
    analysisCompareBtn:         `//button[normalize-space()="Compare"]`,
    analysisCompareSupplier:    `//*[contains(normalize-space(),"Select suppliers")]`,
    analysisCompareVersions:    `//*[contains(normalize-space(),"Select versions")]`,
    analysisCompareNote:        `//*[contains(normalize-space(),"Select up to 2 versions of a single field")]`,

    // ── User's Dashboard (sheet scenarios 22, 89, 92) ─────────────────────────
    // The v4 root ("/") IS the dashboard. Its tabs are rendered TWICE (a desktop
    // and a mobile copy), and an XPath match can land on the copy that does not
    // respond to clicks — use getByRole('tab', …) instead, which resolves the
    // live one. Verified 2026-08-31: an XPath click left All active and the grid
    // showing 1586 rows; getByRole switched it and the count dropped to 164.
    dashboardHeading:        `//*[normalize-space()="User's Dashboard"]`,
    aerchainLogoLink:        `//a[@href="/"][.//img[@alt="Logo"]]`,
    aerchainLogo:            `//img[@alt="Logo"]`,
    dashboardPaginationInfo: `//p[contains(.,"Showing") and contains(.,"entries")]`,

    // ── CXO listing side panel (sheet scenario 4) ─────────────────────────────
    // Opens by clicking the ROW (e.g. the Subject cell) — NOT the code link,
    // which navigates to the detail page instead. Confirmed by QA 2026-09-01.
    // The panel is a fixed-position sheet on the right (~640px wide) carrying
    // Subject, Reference Code, Supplier, Created On and the approval actions.
    cxoListingRowBody:      `(//tbody/tr)[1]/td[2]`,
    cxoListingPanel:        `//*[@role="dialog"][.//*[contains(normalize-space(),"Reference Code")]]`,
    cxoPanelReferenceCode:  `//*[@role="dialog"]//*[normalize-space()="Reference Code"]`,

    // ── RFX Transactions tab (sheet scenarios 31, 32) ─────────────────────────
    // Three sections: Linked Auctions, Linked Negotiations, Linked Intakes.
    rfxTransactionsTabBtn:  `//button[normalize-space()="Transactions"]`,
    rfxLinkedIntakes:       `//*[normalize-space()="Linked Intakes"]`,
    rfxLinkedAuctions:      `//*[normalize-space()="Linked Auctions"]`,
    rfxLinkedNegotiations:  `//*[normalize-space()="Linked Negotiations"]`,

    // ── PO document download (sheet scenario 43) ──────────────────────────────
    // Lives in the General Details section as a "PO Document" field with a
    // Download anchor. The anchor has NO href — it is JS-driven — so the click
    // must be observed via a download event or a new tab.
    poDocumentLabel:        `//*[normalize-space()="PO Document"]`,
    poDocumentDownload:     `//a[normalize-space()="Download"]`,

};
