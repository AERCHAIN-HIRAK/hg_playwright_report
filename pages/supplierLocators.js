// Locators for the Supplier module (v3 / MUI app on nse-capp-uat.aerchain.io).
// Verified against live DOM 2026-08-31.

exports.supplier_Locators = {

    listingUrlPath:        '/suppliers',

    // ── Listing ───────────────────────────────────────────────────────────────
    addNewButton:          '//button[contains(normalize-space(),"Add New")]',
    tabByName:             (name) => `//*[contains(@class,"MuiChip-root")][normalize-space()="${name}"]`,
    tableRows:             '//tbody/tr',
    firstRowLink:          '(//tbody/tr)[1]//a',
    totalPages:            '//span[@class="total-number"]',

    // ── Create Supplier form — field controls ─────────────────────────────────
    // Two shapes, and they must be handled differently:
    //  · plain text inputs carry a RANDOM ID SUFFIX ("Name-y9mB6lmRU7W7"), so
    //    they can only be matched on the id PREFIX;
    //  · MUI Autocompletes keep a stable exact id ("Payment Spoc").
    textByIdPrefix:        (label) => `input[id^="${label}-"]`,
    acById:                (label) => `input[id="${label}"]`,
    acOption:              'li[role="option"], .MuiAutocomplete-option',

    // User Details grid — click-to-edit cells that only exist AFTER "Add Item".
    // The cell shows its placeholder as TEXT until clicked; typing then Tab
    // walks Name → Email → Phone. Never press Escape to finish: it closes the
    // whole Create Supplier drawer and throws the entry away.
    addItemBtn:            '//button[normalize-space()="Add Item"]',
    gridCellByPlaceholder: (ph) => `//*[normalize-space()="${ph}"]`,

    // ── Create Supplier form ──────────────────────────────────────────────────
    // Opens over the listing (the URL does not change).
    //
    // CAUTION: the form embeds a SunEditor rich-text control, which injects its
    // own HIDDEN "Submit" buttons. An XPath text match resolves one of those and
    // the click silently does nothing — always target the real control by role.
    createFormHeading:     '//*[normalize-space()="Create Supplier"]',
    sectionSupplierDetails:'//*[normalize-space()="Supplier Details"]',
    sectionUserDetails:    '//*[normalize-space()="User Details"]',
    sectionNotes:          '//*[normalize-space()="Notes & Attachments"]',

    // Validation messages rendered after a blocked submit.
    // `[not(*)]` restricts the match to LEAF elements — without it every
    // ancestor up to <body> also matches "is Mandatory", and allInnerTexts()
    // returns the whole page instead of the individual messages.
    mandatoryMessages:     '//*[contains(normalize-space(),"is Mandatory")][not(*)]',
    atleastOneRowMessage:  '//*[contains(normalize-space(),"Atleast one row is required")][not(*)]',

    // ── User Details row validation (verified by hand 2026-09-04) ─────────────
    // Row-level errors are NOT page text. After "Add Item" the
    // "Atleast one row is required" message disappears and the row's own errors
    // move into an Ant POPOVER hung off an exclamation icon in the serial cell.
    // So a page-text assertion here passes while proving nothing.
    //
    // Hover the ICON, not the cell — hovering the cell does nothing.
    //
    // Read the popover via ant-popover-inner ONLY. The form's SunEditor keeps
    // ~56 of its own tooltips permanently in the DOM (Resize 100%, Rotate left,
    // Mirror Horizontal, …), so any [class*="tooltip"] match drowns the real
    // message. ant-popover-inner is empty until the hover.
    userRowErrorIcon:      '//span[contains(@class,"anticon-exclamation-circle")]',

    // ── Onboarding attachment fields (structure confirmed live 2026-09-04) ────
    // Every upload renders as
    //     div.attachments-wrapper
    //       ├─ div.attachments-label   ← the label text, with a leading "*"
    //       └─ input[type=file]        ← exactly one, a SIBLING of the label
    // so the wrapper is an unambiguous anchor: each of NDA / Code of Conduct /
    // File Upload with Template / No GST Acknowledgment resolved to exactly one
    // wrapper holding exactly one input. translate() drops the mandatory
    // asterisk so the label compares cleanly.
    attachmentWrapperByLabel: (label) =>
        `//*[contains(@class,"attachments-wrapper")][.//*[contains(@class,"attachments-label")][normalize-space(translate(.,"*",""))="${label}"]]`,
    antPopoverInner:       '//*[contains(@class,"ant-popover-inner")]',
    // "Add Item" has the accessible name "folder Add Item" (icon alt + text),
    // so getByRole('button', { name: 'Add Item', exact: true }) does NOT match.
    addItemBtnRole:        'folder Add Item',

    // ── Listing search ────────────────────────────────────────────────────────
    // Single "Search" box above the grid; filters server-side after a short debounce.
    searchInput:           '//input[@placeholder="Search"]',
    rowLinkByName:         (name) => `//tbody/tr[.//*[contains(normalize-space(),"${name}")]]//a`,

    // ── Supplier detail ───────────────────────────────────────────────────────
    // Registration status renders as a subtitle3 span beside the supplier title.
    statusChip:            (text) => `//span[contains(@class,"MuiTypography-subtitle3")][normalize-space()="${text}"]`,
    onboardingTab:         '//button[normalize-space()="Onboarding"]',
    overviewTab:           '//button[normalize-space()="Overview"]',
    resendOnboardingBtn:   '//button[contains(normalize-space(),"Re Send Onboarding")]',
    moreButton:            '//button[.//*[normalize-space()="More"]] | //button[normalize-space()="More"]',
    menuItem:              (label) => `//li[@role="menuitem"][normalize-space()="${label}"]`,

    // ── Workflow: create → approve → acknowledge → review → Send Onboarding ───
    // Verified live 2026-09-02 on FNSE-26-3034. The workflow has three stages
    // (Sup Create Approval · Sup Create Ack · Sup Create Review) and each is
    // driven by a DIFFERENTLY LABELLED header button:
    //   Pending Approval        → "Approve"      → confirm dialog + notes
    //   Pending Acknowledgement → "Acknowledge"  → same confirm dialog
    //   Pending Review          → "Review"       → opens the EDIT DRAWER; it is
    //                             completed with the drawer's Submit, not a
    //                             dialog. Clicking Review and waiting for a
    //                             dialog loops forever.
    // After the review the status is Submitted and "Send Onboarding" appears.
    workflowSummaryHeading: '//*[normalize-space()="Workflow Summary"]',
    approveBtn:            '//button[normalize-space()="Approve"]',
    acknowledgeBtn:        '//button[normalize-space()="Acknowledge"]',
    reviewBtn:             '//button[normalize-space()="Review"]',
    sendOnboardingBtn:     '//button[contains(normalize-space(),"Send Onboarding")]',
    dialogApproveNotes:    '//div[contains(@class,"MuiDialog-paper")]//textarea',
    dialogConfirmBtn:      '//div[contains(@class,"MuiDialog-paper")]//button[normalize-space()="Approve" or normalize-space()="Submit"]',
    // The onboarding dialog pre-selects "Default Supplier Onboarding" — QA said
    // do not change it, so the template picker is only read, never set.
    onboardingTemplateInput: '//div[contains(@class,"MuiDialog-paper")]//input[@placeholder="Select a template"]',

    // ── Block / Unblock dialog ────────────────────────────────────────────────
    // Same MUI dialog for both, only the heading and the placeholder change.
    // Blocking a supplier that has open POs adds an "Alert: ... open POs" line —
    // informational, it does not gate Submit.
    blockDialogHeading:    '//*[normalize-space()="Reason for Blocking Supplier"]',
    unblockDialogHeading:  '//*[normalize-space()="Reason for Unblocking Supplier"]',
    dialogRemarks:         '//div[@role="dialog"]//textarea[not(@readonly)]',
    dialogSubmit:          '//div[@role="dialog"]//button[normalize-space()="Submit"]',
    dialogCancel:          '//div[@role="dialog"]//button[normalize-space()="Cancel"]',
};
