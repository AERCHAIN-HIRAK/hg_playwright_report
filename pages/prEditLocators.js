// Locators for the v3 (MUI) Requisition EDIT page — /requisitions/{id}/edit on
// nse-capp-uat.aerchain.io. Verified against live DOM on 2026-09-03 against the
// draft PRs /requisitions/952 (1 line item) and /requisitions/903 (3 line items).
//
// This is a different page from the PR detail/view page in v3DetailLocators.js:
// the view page renders a READ-ONLY ag-Grid with no search control and no
// editable cells, which is why the line-item search (sheet scenario 53) was
// previously logged as "no search box renders".

exports.prEdit_Locators = {

    // ── Header actions ────────────────────────────────────────────────────────
    submitButton:          '//button[normalize-space()="Submit"]',
    cancelButton:          '//button[normalize-space()="Cancel"]',

    // ── General Details (mandatory before the form will submit) ──────────────
    // A draft PR carries these EMPTY, and submitting without them raises the
    // toast "Please fill mandatory fields" — the budget check never runs. So a
    // budget test MUST fill them first or it silently proves nothing.
    paymentTermsInput:     'input[placeholder="Select Payment Terms"]',
    expectedDeliveryInput: 'input[placeholder="Enter Expected Delivery Date"]',
    effectiveFromInput:    'input[placeholder^="Enter Effective from date"]',
    effectiveToInput:      'input[placeholder^="Enter Effective to date"]',
    purchaseTypeInput:     'input[id="Purchase Type"]',
    inwardRequiredYes:     'div[id="Inward Required"] input[type="radio"][value="1"]',
    inwardMatchQuantity:   'div[id="Inward Matching Criterion"] input[type="radio"][value="quantity"]',
    autocompleteOption:    '[role="option"], .MuiAutocomplete-option',

    // ── react-datepicker ──────────────────────────────────────────────────────
    calendar:              '.react-datepicker',
    calendarMonthCaption:  '.react-datepicker__current-month',
    calendarNextMonth:     '.react-datepicker__navigation--next',
    calendarPrevMonth:     '.react-datepicker__navigation--previous',
    // react-datepicker zero-pads day classes to three digits: day 5 → --005.
    calendarDay:           (d) => `.react-datepicker__day--${String(d).padStart(3, '0')}:not(.react-datepicker__day--outside-month)`,

    // ── Line Items (ag-Grid, editable) ────────────────────────────────────────
    // ag-Grid renders every logical row once per column container, so counts must
    // be scoped to the CENTER container. The trailing row of the center container
    // is ag-Grid's blank "new row" placeholder and carries no product, hence the
    // product names are read from the PINNED-LEFT container instead, which only
    // renders real rows.
    lineItemsHeading:      '//*[normalize-space()="Line Items"]',
    gridCenterRows:        '.ag-center-cols-container div.ag-row',
    gridProductCells:      '.ag-pinned-left-cols-container div.ag-row [col-id="line_items_product"]',
    cellInRow:             (colId) => `[col-id="${colId}"]`,
    col_quantity:          'line_items_quantity',
    col_suggestedPrice:    'line_items_suggested_price',
    col_totalPrice:        'line_items_total_price',

    // ── Line-item search (sheet scenario 53) ──────────────────────────────────
    // A round icon-only button immediately LEFT of "Add items in Bulk". It has no
    // accessible name and no stable class (MUI makeStyles hashes change per
    // build) — the image's alt text is the only durable anchor. Clicking it
    // REPLACES the button with the input, so the button locator stops resolving
    // afterwards; never re-query it to close the search.
    searchToggle:          '//button[.//img[@alt="Search"]]',
    searchInput:           'input[placeholder="Search"]',
    addItemsInBulk:        '//button[contains(normalize-space(),"Add items in Bulk")]',

    // ── Workflow Summary popup (titled "Approvers") ───────────────────────────
    // MUI dialogs here are position:fixed, so `offsetParent` is NULL for them —
    // any hand-rolled visibility filter written that way reports "no popup" while
    // it is plainly on screen. Use Playwright's toBeVisible(), which measures the
    // bounding box. (Same trap as the item-details drawer on the PR view page.)
    approversDialog:       '.MuiDialog-root',
    approversTitle:        '//*[contains(@class,"MuiDialog-root")]//*[normalize-space()="Approvers"]',
    budgetExceededBanner:  '//*[contains(@class,"MuiDialog-root")]//*[contains(normalize-space(),"Budget Amount is exceeded")]',
    budgetAmendHeading:    '//*[contains(@class,"MuiDialog-root")]//*[contains(normalize-space(),"Budget Amend Request")]',
    dialogDiscard:         '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Discard"]',
    dialogSubmit:          '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Submit"]',

    // ── Toasts ────────────────────────────────────────────────────────────────
    toast:                 '[class*="Toastify"]',
    mandatoryFieldsToast:  '//*[contains(normalize-space(),"Please fill mandatory fields")]',

    // ── Draft listing (to find an editable PR) ────────────────────────────────
    // Every Draft row's Code cell reads the literal "PR-DRAFT" — no code is
    // assigned until submit — so a draft can only be identified by the id in its
    // anchor href, never by code.
    listingTab:            (label) => `//*[contains(@class,"view-type")][normalize-space()="${label}"]`,
    listingHeaders:        'thead th',
    listingRows:           'tbody tr',
};
