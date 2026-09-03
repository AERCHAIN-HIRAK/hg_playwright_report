// Locators for the v3 (MUI) listing pages on nse-capp-uat.aerchain.io.
// Shared by Requisition / Purchase Order / GRN (Inwards) / Invoice listings —
// all four render from the same table component, verified against live DOM
// snapshots on 2026-08-31.
//
// NOTE: this is a DIFFERENT app shell from the v4 listings (Intake / CXO / RFX
// on nse-capp-v4-uat.aerchain.io), which are shadcn/radix. Do not mix the two
// locator sets: v4 uses data-slot="tabs-trigger" + radix poppers, v3 uses MUI
// chips + an inline filter popup rendered inside the <th> itself.

exports.v3Listing_Locators = {

    // ── Page chrome ───────────────────────────────────────────────────────────
    breadcrumb:              '//nav[@aria-label="breadcrumb"] | //p[ancestor::nav]',
    addNewButton:            '//button[contains(normalize-space(),"Add New")]',
    reloadButton:            '//button[contains(normalize-space(),"Reload")]',

    // ── View-type tabs (MUI chips) ────────────────────────────────────────────
    // Active chip is marked ONLY by inline style: solid `background-color:
    // rgb(51, 136, 235)` + white text. Inactive chips use the 0.06-alpha rgba
    // of the same colour, so a `contains(@style,"rgb(51, 136, 235)")` test would
    // match both — the active check must look for the non-alpha form.
    tabs:                    '//*[contains(@class,"MuiChip-root") and contains(@class,"view-type")]',
    tabByName:               (name) => `//*[contains(@class,"MuiChip-root") and contains(@class,"view-type")][normalize-space()="${name}"]`,
    activeTab:               '//*[contains(@class,"MuiChip-root") and contains(@class,"view-type")][contains(@style,"background-color: rgb(51, 136, 235)")]',

    // ── Toolbar ───────────────────────────────────────────────────────────────
    searchInput:             '//input[contains(@placeholder,"Search")]',
    clearAllButton:          '//button[contains(normalize-space(),"ClearAll")]',

    // ── Column headers ────────────────────────────────────────────────────────
    // Header label sits in a nested <span>; the sort/filter affordances are
    // <img alt="sort"> / <img alt="filter"> in a sibling div. Only some columns
    // expose each icon, so callers must check availability before clicking.
    headerByName:            (col) => `//th[.//span[normalize-space()="${col}"]]`,
    sortIcon:                (col) => `//th[.//span[normalize-space()="${col}"]]//img[@alt="sort"]`,
    filterIcon:              (col) => `//th[.//span[normalize-space()="${col}"]]//img[@alt="filter"]`,
    allHeaders:              '//th',

    // ── Inline filter popup ───────────────────────────────────────────────────
    // The popup is rendered INSIDE the <th> of the column being filtered, not in
    // a body-level portal. Only one can be open at a time, so anchoring on
    // "the th that currently contains an OK button" uniquely identifies it.
    openFilterPopup:         '//th[.//button[normalize-space()="OK"]]',
    filterPopup_Search:      '//th[.//button[normalize-space()="OK"]]//input',
    filterPopup_SelectAll:   '//th[.//button[normalize-space()="OK"]]//div[normalize-space()="Select All"]',
    // Each option is a direct child div of .options-style, carrying class
    // `not-checked` when unselected and `checked-style` once toggled.
    filterPopup_Options:     '//th[.//button[normalize-space()="OK"]]//div[contains(@class,"options-style")]/div',
    filterPopup_OptionByText:(val) => `//th[.//button[normalize-space()="OK"]]//div[contains(@class,"options-style")]/div[normalize-space()="${val}"]`,
    filterPopup_Clear:       '//th[.//button[normalize-space()="OK"]]//button[normalize-space()="Clear Selection"]',
    filterPopup_OK:          '//th[.//button[normalize-space()="OK"]]//button[normalize-space()="OK"]',

    // ── Table ─────────────────────────────────────────────────────────────────
    tableRows:               '//tbody/tr',
    firstRow:                '(//tbody/tr)[1]',
    firstRowCodeLink:        '(//tbody/tr)[1]/td[1]//a',
    cellsInColumn:           (idx) => `//tbody/tr/td[${idx}]`,
    noDataRow:               '//tbody/tr/td[@colspan] | //*[contains(normalize-space(),"No Data") or contains(normalize-space(),"No records") or contains(normalize-space(),"No Records")]',

    // ── Pagination ────────────────────────────────────────────────────────────
    // Layout: [prev div][span.pagination-selection]["of"][span.total-number][next div]
    // The prev/next wrappers carry `arrow-button` when enabled and
    // `arrow-button-disabled` when not — the button element itself has no
    // disabled attribute, so enablement must be read from the wrapper class.
    pagination_Current:      '//span[@class="pagination-selection"]',
    pagination_Total:        '//span[@class="total-number"]',
    pagination_PrevWrapper:  '//span[@class="pagination-selection"]/preceding-sibling::div[1]',
    pagination_NextWrapper:  '//span[@class="total-number"]/following-sibling::div[1]',
    pagination_Prev:         '//span[@class="pagination-selection"]/preceding-sibling::div[1]//*[self::button or @role="button"]',
    pagination_Next:         '//span[@class="total-number"]/following-sibling::div[1]//*[self::button or @role="button"]',

    // ── Detail page ───────────────────────────────────────────────────────────
    detailAnyHeading:        '//h1 | //h2 | //*[contains(@class,"page-header")]',
};
