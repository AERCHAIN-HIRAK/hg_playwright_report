// Locators for the CXO Listing page (/cxos).
// Verified against live DOM on nse-capp-v4-uat.aerchain.io/cxos (2026-06-19).
// Mirrors intakeListingLocators but adapted to CXO columns/tabs (no status cards).

exports.cxoListing_Locators = {

    // ── Page / Navigation ────────────────────────────────────────────────────
    createCxoButton:                '[href="/cxos/create"]',

    // ── Listing Tabs ─────────────────────────────────────────────────────────
    // NOTE: the top nav (Home/CXO/Intake/Sourcing) ALSO uses data-slot="tabs-trigger",
    // so match listing tabs by EXACT text. Responsive layout renders each twice →
    // use .filter({ visible: true }).first() when interacting.
    tab_All:                '//button[@data-slot="tabs-trigger"][normalize-space()="All"]',
    tab_MyPendingApproval:  '//button[@data-slot="tabs-trigger"][normalize-space()="My Pending Approval"]',
    tab_Draft:              '//button[@data-slot="tabs-trigger"][normalize-space()="Draft"]',
    // A specific listing tab's active state is read from its own data-state attribute.
    tabActiveState:         (name) => `//button[@data-slot="tabs-trigger"][normalize-space()="${name}"]`,

    // ── Toolbar ───────────────────────────────────────────────────────────────
    // Search input is collapsed (≈36px) and covered by a search-icon overlay
    // (an absolutely-positioned cursor-pointer div holding a lucide-search svg)
    // that intercepts clicks. Click the icon to expand, then fill the input.
    searchInput:    '//a[@href="/cxos/create"]/parent::*//input',
    searchIcon:     '//a[@href="/cxos/create"]/parent::*//div[contains(@class,"cursor-pointer")][.//*[contains(@class,"lucide-search")]]',
    filterButton:   '//button[contains(normalize-space(),"Filters")]',

    // ── Column Sort Buttons (LAST button inside the header) ───────────────────
    // Sortable columns (have a sort ↕): Code, Subject, Date, Status
    sortBtn_Code:     '//th[contains(normalize-space(),"Code") and not(contains(normalize-space(),"Created"))]//button[last()]',
    sortBtn_Subject:  '//th[contains(normalize-space(),"Subject")]//button[last()]',
    sortBtn_Date:     '//th[contains(normalize-space(),"Date")]//button[last()]',
    sortBtn_Status:   '//th[normalize-space()="Status"]//button[last()]',

    // ── Column Filter Buttons (FIRST button inside the header) ────────────────
    // Filterable columns: Date, Created By, Status, Approver Role(s), Approver(s),
    // Assigned Purchaser(s), Purchaser
    filterBtn_Date:               '//th[normalize-space()="Date"]//button[1]',
    filterBtn_CreatedBy:          '//th[normalize-space()="Created By"]//button[1]',
    filterBtn_Status:             '//th[normalize-space()="Status"]//button[1]',
    filterBtn_ApproverRoles:      '//th[contains(normalize-space(),"Approver Role")]//button[1]',
    filterBtn_Approvers:          '//th[normalize-space()="Approver(s)"]//button[1]',
    filterBtn_AssignedPurchasers: '//th[contains(normalize-space(),"Assigned Purchaser")]//button[1]',
    filterBtn_Purchaser:          '//th[normalize-space()="Purchaser"]//button[1]',

    // ── Filter Popup (Radix Popover) ──────────────────────────────────────────
    filterPopup_Container:   '//div[@data-radix-popper-content-wrapper]',
    filterPopup_SearchInput: '//div[@data-radix-popper-content-wrapper]//input',
    filterPopup_Option:      '//div[@data-radix-popper-content-wrapper]//*[contains(@class,"item")] | //div[@data-radix-popper-content-wrapper]//*[@role="option"]',
    filterPopup_ClearAll:    '//button[normalize-space()="Clear all selections"] | //div[@data-radix-popper-content-wrapper]//*[contains(normalize-space(),"Clear all")]',
    filterPopup_Apply:       '//div[@data-radix-popper-content-wrapper]//button[normalize-space()="OK"]',

    // ── Table ─────────────────────────────────────────────────────────────────
    tableRows:    '//tbody/tr',
    // Empty state on the CXO listing renders a row whose cell text is "No Data".
    tableNoData:  '//tbody//*[contains(normalize-space(.),"No Data")] | //tbody/tr/td[@colspan] | //*[contains(normalize-space(.),"No results")] | //*[contains(normalize-space(.),"No records")]',

    // Column cell reads (Code=1 Subject=2 Date=3 Created By=4 Status=5)
    col_AllCode:      '//tbody/tr/td[1]',
    col_AllSubject:   '//tbody/tr/td[2]',
    col_AllDate:      '//tbody/tr/td[3]',
    col_AllCreatedBy: '//tbody/tr/td[4]',
    col_AllStatus:    '//tbody/tr/td[5]',

    // First row
    firstRow_CodeLink: '(//tbody/tr)[1]/td[1]//a',
    firstRow_Code:     '(//tbody/tr)[1]/td[1]',
    firstRow_Subject:  '(//tbody/tr)[1]/td[2]',
    firstRow_Status:   '(//tbody/tr)[1]/td[5]',

    // ── Pagination ──────────────────────────────────────────────────────────────
    pagination_Info:        '//p[contains(.,"Showing") and contains(.,"entries")]',
    pagination_Prev:        '//nav[@aria-label="pagination"]//button[contains(.,"Previous")]',
    pagination_Next:        '//nav[@aria-label="pagination"]//button[contains(.,"Next")]',
    pagination_CurrentPage: '//nav[@aria-label="pagination"]//button[@aria-current="page"]',

    // ── Detail / Create pages ──────────────────────────────────────────────────
    detailPage_AnyHeading:  '//h1 | (//div[contains(@class,"font-bold")])[1]',
    createPage_TitleField:  '[placeholder="Title of the document goes here"]',

};
