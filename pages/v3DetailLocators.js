// Locators for the v3 (MUI) transaction DETAIL pages on nse-capp-uat.aerchain.io
// — Requisition, PRC, Purchase Order, GRN (Inwards) and Invoice.
// Verified against live DOM on 2026-08-31.

exports.v3Detail_Locators = {

    // ── Header actions ────────────────────────────────────────────────────────
    // The trigger's accessible name is "More info", but its visible label is just
    // "More" in a child span — match on the child so the locator survives an
    // aria-label change.
    moreButton:            '//button[.//*[normalize-space()="More"]]',
    approveButton:         '//button[normalize-space()="Approve"]',
    rejectButton:          '//button[normalize-space()="Reject"]',
    overviewTab:           '//button[normalize-space()="Overview"]',
    transactionsTab:       '//button[normalize-space()="Transactions"]',

    // ── "More" dropdown items ─────────────────────────────────────────────────
    // Rendered as li[role=menuitem] in a body-level MUI portal.
    menuItem:              (label) => `//li[@role="menuitem"][normalize-space()="${label}"]`,
    anyMenuItem:           '//li[@role="menuitem"]',

    // Menu labels differ per module — Requisition/PO say "Download", Invoice says
    // "Download Document". Callers should try both.
    menu_Clone:                  'Clone',
    menu_ReassignUser:           'Reassign User',
    menu_ReassignPurchaser:      'Reassign Purchaser',
    menu_ReassignWorkflowApprover: 'Reassign Workflow Approver',
    menu_Download:               'Download',
    menu_DownloadDocument:       'Download Document',
    menu_RegenerateDocument:     'Regenerate Document',
    menu_Recall:                 'Recall',

    // ── Generic MUI dialog ────────────────────────────────────────────────────
    dialog:                '//*[contains(@class,"MuiDialog-root")] | //*[@role="dialog"]',
    dialogTitle:           '//*[contains(@class,"MuiDialogTitle-root")]',
    dialogCancel:          '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Cancel"]',
    dialogSubmit:          '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Submit"]',
    dialogReassign:        '//*[contains(@class,"MuiDialog-root")]//button[normalize-space()="Reassign"]',

    // Empty-state shown when the transaction has no eligible reassignment targets
    // (e.g. an already-Completed requisition).
    reassignNoUsers:       '//*[contains(normalize-space(),"No users are available to be reassigned")]',
    reassignUserSelect:    '//*[contains(@class,"MuiDialog-root")]//input[not(@type="hidden")]',
    reassignReason:        '//*[contains(@class,"MuiDialog-root")]//textarea',

    // ── Status ────────────────────────────────────────────────────────────────
    statusChip:            '//*[contains(@class,"MuiChip-root") and contains(@class,"chip-tag")]',

    // ── Back navigation (sheet scenario 60) ───────────────────────────────────
    // Icon-only affordance: a MUI <p> wrapping an arrowLeft svg. There is no
    // breadcrumb and no accessible name, so the image src is the only anchor.
    backArrow:             '//p[.//img[contains(@src,"arrowLeft")]]',

    // ── Cross-transaction links (sheet scenarios 52-55) ───────────────────────
    // Rendered as plain <div>s styled blue + cursor:pointer rather than <a>, so
    // they cannot be matched by role=link.
    // The budget (BRF) link is a real <a> with NO href — JS-driven, opens a
    // drawer in place rather than a new tab.
    anchorContaining:      (text) => `//a[contains(normalize-space(),"${text}")]`,
    blueLink:              (text) => `//div[normalize-space()="${text}"][contains(@style,"cursor: pointer")]`,
    anyBlueLink:           '//div[contains(@style,"cursor: pointer")][contains(@style,"rgb(24, 144, 255)")]',
    // Value cell sitting immediately after a given field label.
    fieldValueLink:        (label) => `//*[normalize-space()="${label}"]/following::div[contains(@style,"cursor: pointer")][1]`,

    // ── Line items ────────────────────────────────────────────────────────────
    // The grid is ag-Grid, NOT an HTML <table> — the PR detail page contains zero
    // <table> elements. ag-Grid also renders each logical row once per column
    // container (pinned-left / center / pinned-right), so counting `.ag-row`
    // globally triples the row count. Scope to the center container for counts,
    // and to pinned-left for the Product column, which is pinned.
    lineItemsHeading:      '//*[normalize-space()="Line Items"]',
    lineItemGrid:          '.ag-root',
    lineItemRows:          '.ag-center-cols-container div.ag-row',
    lineItemPinnedRows:    '.ag-pinned-left-cols-container div.ag-row',
    lineItemProductCell:   '.ag-pinned-left-cols-container div.ag-row [col-id="line_items_product"]',
    lineItemProductLink:   '.ag-pinned-left-cols-container div.ag-row [col-id="line_items_product"] a',
    lineItemCell:          (colId) => `.ag-center-cols-container div.ag-row [col-id="${colId}"]`,

    // ── Item details panel (sheet scenario 59) ────────────────────────────────
    // Clicking the Product name opens a RIGHT-SIDE MUI drawer and fires
    // GET /api/capp/products/{id}. The drawer is position:fixed, so
    // `offsetParent` is null for it — a visibility check written that way
    // reports "no panel opened" even though it is on screen. Use Playwright's
    // own toBeVisible(), which measures the bounding box instead.
    // The page keeps a second, permanently-closed MuiDrawer-paper parked
    // off-screen (x=1800, width=1, visibility:hidden). Match the OPEN one by its
    // makeStyles class so the assertion cannot latch onto the parked node.
    itemDetailsDrawer:     '.MuiDrawer-root',
    itemDetailsPaper:      '.MuiDrawer-paper[class*="makeStyles"]',
    itemDetailsTabText:    'Details',

    // ── PRC / Requisition Conversion View (sheet scenarios 39, 44) ────────────
    // A PRC has NO listing of its own — it is reachable only through a parent
    // Requisition's Transactions tab → Conversions → the PRC-… link, and it
    // renders IN PLACE (the URL stays /requisitions/{id}), headed by the PARENT
    // PR's code with the status chip "Converted". So a PRC test cannot navigate
    // by URL and cannot assert on the PRC code in the header.
    prcTransactionsTab:    '//button[normalize-space()="Transactions"]',
    prcConversionsSection: '//*[normalize-space(text())="Conversions"]',
    prcCodeLink:           "//*[starts-with(normalize-space(.),'PRC-')]",
    prcConversionViewHeading: '//*[normalize-space()="Requisition Conversion View"]',
    prcConversionDetailsHeading: '//*[normalize-space()="Requisition Conversion Details"]',
    // The conversion view's header carries only these two icon buttons plus
    // More. `Reload` is a PLAIN REFRESH — clicking it fires zero non-GET
    // requests (verified live), so it is NOT a document regeneration.
    prcReloadIcon:         '//button[.//img[@alt="Reload"]]',
    prcActivityLogIcon:    '//button[.//img[@alt="clock"]]',
};
