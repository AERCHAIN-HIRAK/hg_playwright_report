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

    // ── Submit ────────────────────────────────────────────────────────────────
    submitBtn: 'button:has-text("Submit")',

    // ── Post-submit assertions ────────────────────────────────────────────────
    cxoStatusBadge: '[class*="badge"], [class*="status"], span:has-text("Submitted"), span:has-text("Draft")',

};
