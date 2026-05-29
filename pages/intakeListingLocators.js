// Locators for the Intake Listing page.
// Verified against live DOM snapshot from nse-capp-v4-uat.aerchain.io/intakes.

exports.intakeListing_Locators = {

    // ── Page / Navigation ────────────────────────────────────────────────────
    createIntakeButton:             '[href="/intakes/create"]',

    // ── Status Summary Cards ─────────────────────────────────────────────────
    // Cards contain a label and a numeric count. Icons are SVG (which add text via <title>).
    // Use normalize-space(text()) to match direct text nodes only, ignoring SVG title text.
    statusCard_Draft:               '//div[.//*[normalize-space(text())="Draft"] and not(ancestor::table)]',
    statusCard_AwaitingActions:     '//div[.//*[normalize-space(text())="Awaiting Actions"] and not(ancestor::table)]',
    statusCard_ActiveReleased:      '//div[.//*[normalize-space(text())="Active/Released"] and not(ancestor::table)]',
    statusCard_Completed:           '//div[.//*[normalize-space(text())="Completed/Successful"] and not(ancestor::table)]',
    statusCard_Cancelled:           '//div[.//*[normalize-space(text())="Cancelled/Rejected"] and not(ancestor::table)]',
    // Count text inside a status card (first numeric-looking child div)
    statusCard_CountDiv:            './/div[translate(normalize-space(),"0123456789","")=""]',

    // ── Listing Tabs ─────────────────────────────────────────────────────────
    // Two identical button elements exist in DOM (desktop + hidden mobile).
    // data-slot="tabs-trigger" confirmed in DOM. Use .filter({ visible: true }).first() when interacting.
    tab_All:                        '//button[@data-slot="tabs-trigger"][contains(.,"All")]',
    tab_MyPendingApproval:          '//button[@data-slot="tabs-trigger"][contains(normalize-space(),"My Pending Approval")]',
    tab_PendingBuyerAcceptance:     '//button[@data-slot="tabs-trigger"][contains(normalize-space(),"Pending Buyer Acceptance")]',
    tab_PendingBuyerToProcess:      '//button[@data-slot="tabs-trigger"][contains(normalize-space(),"Pending Buyer to process")]',
    tab_Draft:                      '//button[@data-slot="tabs-trigger"][contains(normalize-space(),"Draft")]',
    activeTab:                      '//button[@data-slot="tabs-trigger"][@data-state="active"]',

    // ── Toolbar ───────────────────────────────────────────────────────────────
    // The search input is hidden by default (width:0 CSS). Click the img icon next to it to reveal.
    // Structure: <div> <input/> <img cursor=pointer/> </div> <button/> <a href="/intakes/create"/>
    // The icon is an <img>, NOT a <button>. Using parent-of-create-link to scope the search area.
    searchIcon:                     '//a[@href="/intakes/create"]/parent::*//img[preceding-sibling::input or following-sibling::input]',
    searchInput:                    '//a[@href="/intakes/create"]/parent::*//input',
    filterButton:                   '//button[contains(normalize-space(),"Filters")]',
    refreshButton:                  '//div[.//a[@href="/intakes/create"]]//button[not(.//input)]',

    // ── Column Sort Buttons (LAST button inside header for columns that have 2) ─
    // Sortable columns (have ↑↓ icon): Code, Subject, Date, Status, Purchaser
    // Non-sortable (filter-only): Created By, Approver Role(s), Approver(s), Dept
    // Use contains() so that sort indicators appended to th text do not break the locator.
    sortBtn_Code:                   '//th[contains(normalize-space(),"Code") and not(contains(normalize-space(),"Created"))]//button[last()]',
    sortBtn_Subject:                '//th[contains(normalize-space(),"Subject")]//button[last()]',
    sortBtn_Date:                   '//th[contains(normalize-space(),"Date")]//button[last()]',
    sortBtn_Status:                 '//th[contains(normalize-space(),"Status")]//button[last()]',
    sortBtn_Purchaser:              '//th[contains(normalize-space(),"Purchaser")]//button[last()]',

    // ── Column Filter Buttons (FIRST button inside header) ────────────────────
    // Filter-capable columns: Date, Created By, Status, Approver(s), Purchaser
    filterBtn_Date:                 '//th[normalize-space()="Date"]//button[1]',
    filterBtn_CreatedBy:            '//th[normalize-space()="Created By"]//button[1]',
    filterBtn_Status:               '//th[normalize-space()="Status"]//button[1]',
    filterBtn_ApproverRoles:        '//th[contains(normalize-space(),"Approver Role")]//button[1]',
    filterBtn_Approvers:            '//th[normalize-space()="Approver(s)"]//button[1]',
    filterBtn_Purchaser:            '//th[normalize-space()="Purchaser"]//button[1]',

    // ── Filter Popup (Popover) ─────────────────────────────────────────────────
    filterPopup_Container:          '//div[@data-radix-popper-content-wrapper]',
    filterPopup_SearchInput:        '//div[@data-radix-popper-content-wrapper]//input',
    filterPopup_Option:             '//div[@data-radix-popper-content-wrapper]//*[contains(@class,"item")] | //div[@data-radix-popper-content-wrapper]//*[@role="option"]',
    filterPopup_ClearAll:           '//button[normalize-space()="Clear all selections"] | //div[@data-radix-popper-content-wrapper]//*[contains(normalize-space(),"Clear all")]',
    filterPopup_Apply:              '//div[@data-radix-popper-content-wrapper]//button[normalize-space()="OK"]',

    // ── Table ─────────────────────────────────────────────────────────────────
    tableRows:                      '//tbody/tr',
    tableRow_First:                 '(//tbody/tr)[1]',
    tableNoData:                    '//tbody/tr/td[@colspan] | //div[contains(.,"No results")] | //div[contains(.,"No records")]',

    // All-column reads for sort/filter validation
    col_AllCode:                    '//tbody/tr/td[1]',
    col_AllSubject:                 '//tbody/tr/td[2]',
    col_AllDate:                    '//tbody/tr/td[3]',
    col_AllCreatedBy:               '//tbody/tr/td[4]',
    col_AllStatus:                  '//tbody/tr/td[5]',

    // First row
    firstRow_CodeLink:              '(//tbody/tr)[1]/td[1]//a',
    firstRow_Code:                  '(//tbody/tr)[1]/td[1]',
    firstRow_Subject:               '(//tbody/tr)[1]/td[2]',
    firstRow_Status:                '(//tbody/tr)[1]/td[5]',

    // ── Pagination ─────────────────────────────────────────────────────────────
    // Pagination info lives in a <p> in a fixed bottom bar
    pagination_Info:                '//p[contains(.,"Showing") and contains(.,"entries")]',
    pagination_Prev:                '//nav[@aria-label="pagination"]//button[contains(.,"Previous")]',
    pagination_Next:                '//nav[@aria-label="pagination"]//button[contains(.,"Next")]',
    pagination_Pages:               '//nav[@aria-label="pagination"]//button[number(normalize-space()) = number(normalize-space())]',
    pagination_CurrentPage:         '//nav[@aria-label="pagination"]//button[@aria-current="page"]',

    // ── Detail / Create pages ──────────────────────────────────────────────────
    detailPage_AnyHeading:          '//h1 | (//div[contains(@class,"font-bold")])[1]',
    createPage_TitleField:          '[placeholder="Title of the document goes here"]',

};
