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

    // Quote page
    quotePreferredCurrency: `(//*[contains(normalize-space(text()),'Preferred Currency')]/following::button[@role='combobox'])[1]`,
    // Editable Unit Rate cell in the quote item grid (user-confirmed locator)
    quoteUnitRateCell:      `[class="w-full h-full flex items-center outline-primary relative cursor-pointer p-[3.5px] px-[7px]"]`,
    quoteSubmitBtn:         `//button[contains(normalize-space(.),'Submit Quote')]`,
    quotedStatusBadge:      `//*[normalize-space(text())='Quoted']`,

    // Supplier Selection — Add Supplier popup
    sourcingAddSupplierBtn:       `//button[contains(.,'Add Supplier')]`,
    sourcingSupplierSearch:       `//div[@role='dialog']//input`,
    sourcingSupplierOption: (name) => `//div[@role='dialog']//*[contains(normalize-space(.),"${name}") and not(.//*[contains(normalize-space(.),"${name}")])]`,
    sourcingSupplierPopupSubmit:  `//div[@role='dialog']//button[normalize-space(.)='Submit']`,

    // ── Submit ────────────────────────────────────────────────────────────────
    submitBtn: 'button:has-text("Submit")',

    // ── Post-submit assertions ────────────────────────────────────────────────
    cxoStatusBadge: '[class*="badge"], [class*="status"], span:has-text("Submitted"), span:has-text("Draft")',

};
