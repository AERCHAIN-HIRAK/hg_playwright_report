// ─────────────────────────────────────────────────────────────────────────────
// Intake Workflow Locators
// Covers: submission popup (workflow summary + purchaser assignment),
//         overview-page step buttons, and post-action status verification.
//
// Conventions:
//   • Text-based XPath preferred for resilience against CSS changes.
//   • Locators marked "⚠ VERIFY" should be confirmed against live DOM.
// ─────────────────────────────────────────────────────────────────────────────

exports.intakeWorkflow_Locators = {

    // ── Submission Popup container ────────────────────────────────────────────
    // Standard React modal rendered with role="dialog"
    submissionPopup:                '[role="dialog"]',

    // ── Popup Step 1 — Workflow Summary ───────────────────────────────────────
    // Section heading that contains "Workflow"
    popupWorkflowSummaryHeading:    '//*[@role="dialog"]//*[contains(normalize-space(),"Workflow")]',

    // Individual step entries inside the popup (text-based, order-independent)
    // NSE popup uses "Vertical Approver" / "Approver" — "Approval" does not appear
    popupStep_Approval:             '//*[@role="dialog"]//*[contains(normalize-space(),"Approver") or contains(normalize-space(),"Approval")]',
    popupStep_Review:               '//*[@role="dialog"]//*[contains(normalize-space(),"Review")]',
    // Matches both "Acknowledgement" and "Acknowledgment"
    popupStep_Acknowledgement:      '//*[@role="dialog"]//*[contains(normalize-space(),"Acknowledg")]',

    // ── Popup Step 2 — Purchaser Assignment ───────────────────────────────────
    // Section heading that mentions "Purchaser"
    popupPurchaserHeading:          '//*[@role="dialog"]//*[contains(normalize-space(),"Purchaser")]',

    // ── Overview Page — Status Indicators ─────────────────────────────────────
    // Actual NSE badge text observed on live DOM (header breadcrumb area):
    //   After submission  → "Pending Approval"
    //   After rejection   → Approve/Reject buttons hidden; badge stays "Pending Approval"
    //   After release     → "Active" or "Released"
    // Locator excludes table rows and nav ancestors to avoid false-positive listing matches.
    overviewStatus_AwaitingActions: '//*[(contains(normalize-space(),"Pending Approval") or contains(normalize-space(),"Awaiting Actions")) and not(ancestor::table) and not(ancestor::nav)]',
    overviewStatus_ActiveReleased:  '//*[(contains(normalize-space(),"Active") or contains(normalize-space(),"Released")) and not(ancestor::table) and not(ancestor::nav)]',
    overviewStatus_CancelledRejected: '//*[(contains(normalize-space(),"Cancelled") or contains(normalize-space(),"Rejected") or contains(normalize-space(),"Pending Approval")) and not(ancestor::table) and not(ancestor::nav)]',

    // ── Approval Step ─────────────────────────────────────────────────────────
    btn_Approve:                    "//button[normalize-space(text())='Approve']",
    btn_Reject:                     "//button[normalize-space(text())='Reject']",

    // Comments modal — appears after clicking Approve or Reject
    commentsField:                  '[placeholder="Enter your comments..."]',

    // Confirm buttons inside the comments modal (2nd occurrence in the DOM)
    modal_ApproveConfirm:           "(//button[normalize-space(text())='Approve'])[2]",
    modal_RejectConfirm:            "(//button[normalize-space(text())='Reject'])[2]",

    // Cancel / close a modal without confirming
    // ⚠ VERIFY: exact button label or aria-label on live DOM
    modal_Cancel:                   '//button[normalize-space()="Cancel"] | //button[@aria-label="Close"] | //*[@role="dialog"]//button[last()]',

    // ── Review Step ───────────────────────────────────────────────────────────
    btn_Review:                     "//button[normalize-space(text())='Review']",

    // Edit page that opens after clicking Review
    // ⚠ VERIFY: URL pattern — might be /edit, /review, or /update
    editPage_TitleField:            '[placeholder="Title of the document goes here"]',
    editPage_SubmitButton:          "//button[normalize-space(text())='Submit']",

    // ── Acknowledgement Step ──────────────────────────────────────────────────
    // ⚠ VERIFY: exact button text on live DOM — several variants listed
    btn_Acknowledge:                "//button[normalize-space(text())='Acknowledge'] | //button[normalize-space(text())='Acknowledgement'] | //button[normalize-space(text())='Acknowledged']",
    modal_AcknowledgeConfirm:       "(//button[contains(normalize-space(text()),'Acknowledg')])[2]",

    // ── Purchaser Accept Step ─────────────────────────────────────────────────
    btn_Accept:                     "//button[normalize-space(text())='Accept']",
    modal_AcceptConfirm:            "(//button[normalize-space(text())='Accept'])[2]",

    // ── More dropdown (top-right toolbar on overview page) ────────────────────
    btn_More:                       "//button[normalize-space(text())='More']",
    menu_ReassignWorkflowApprover:  "//*[@role='menuitem'][contains(normalize-space(),'Reassign Workflow Approver')] | //button[contains(normalize-space(),'Reassign Workflow Approver')] | //li[contains(normalize-space(),'Reassign Workflow Approver')]",
    menu_WorkflowStages:            "//*[@role='menuitem'][normalize-space()='Workflow Stages']",
    menu_Edit:                      "//*[@role='menuitem'][normalize-space()='Edit']",

    // ── Workflow Stages dialog ────────────────────────────────────────────────
    // Opens via More → Workflow Stages. Shows all workflow instances (Workflow 1, Workflow 2…)
    // each with a status badge (Active / Pending / Rejected / Skipped).
    workflowStagesHeading:          "//*[@role='dialog']//*[normalize-space(text())='Workflow Steps']",
    // Workflow-level status badge — tiny pill next to "Workflow N" header.
    // Class pattern confirmed from live DOM: text-[10.5px] px-[7px] py-[3.5px]
    workflowStages_RejectedBadge:   "//*[@role='dialog']//*[normalize-space(text())='Rejected' and contains(@class,'text-[10.5px]') and contains(@class,'px-[7px]')]",
    // First workflow entry (newest) — its status badge is the first px-[7px] pill in the dialog
    workflowStages_FirstWorkflowStatusBadge: "(//*[@role='dialog']//*[contains(@class,'text-[10.5px]') and contains(@class,'px-[7px]') and contains(@class,'py-[3.5px]')])[1]",

    // ── Reassign User dialog ──────────────────────────────────────────────────
    reassign_UserDropdown:          "(//*[@role='dialog']//button[@aria-haspopup='dialog'])[1]",
    reassign_AdminOption:           '[data-value="Aerchain NSE Admin"]',
    reassign_ReasonField:           "//*[@role='dialog']//textarea",
    reassign_SubmitBtn:             "//*[@role='dialog']//button[normalize-space(text())='Reassign'] | //*[@role='dialog']//button[normalize-space(text())='Submit']",

    // ── Step Sequence Verification (timeline on overview) ────────────────────
    // ⚠ VERIFY: class names — these are common patterns for step timelines
    timeline_Container:             '//*[contains(@class,"timeline") or contains(@class,"workflow-steps") or contains(@class,"approval-steps")]',
    timeline_ActiveStep:            '//*[contains(@class,"active") and (contains(@class,"step") or contains(@class,"stage"))]',
    timeline_CompletedStep:         '//*[(contains(@class,"complete") or contains(@class,"done")) and (contains(@class,"step") or contains(@class,"stage"))]',
    timeline_PendingStep:           '//*[contains(@class,"pending") and (contains(@class,"step") or contains(@class,"stage"))]',

};
