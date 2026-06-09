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
    btn_More:                       "//button[normalize-space(.)='More' or normalize-space(text())='More']",
    menu_ReassignWorkflowApprover:  "//*[@role='menuitem'][contains(normalize-space(),'Reassign Workflow Approver')] | //button[contains(normalize-space(),'Reassign Workflow Approver')] | //li[contains(normalize-space(),'Reassign Workflow Approver')]",
    menu_WorkflowStages:            "//*[@role='menuitem'][normalize-space()='Workflow Stages']",
    menu_Edit:                      "//*[@role='menuitem'][normalize-space()='Edit']",

    // ── Process dropdown (visible when intake is Released) ───────────────────
    btn_Process:                    "//button[normalize-space(.)='Process' or normalize-space(text())='Process']",
    menu_CreatePR:                  "//*[@role='menuitem'][normalize-space()='Create PR']",
    menu_SendForSourcing:           "//*[@role='menuitem'][contains(normalize-space(),'Send for Sourcing')] | //*[@role='menuitem'][contains(normalize-space(),'Send For Sourcing')] | //*[@role='menuitem'][contains(normalize-space(),'Sourcing')]",
    // Create Requisition confirmation dialog
    createPR_ConfirmDialog:         "//*[contains(normalize-space(),'Create Requisition')]",
    createPR_ConfirmBtn:            "//button[normalize-space(text())='Confirm']",
    // Success toast — transient; caught within a short window after Confirm click
    createPR_SuccessToast:          "//*[contains(normalize-space(),'Requisition') and (contains(normalize-space(),'success') or contains(normalize-space(),'initiated'))]",
    // Overview status after Create PR
    overviewStatus_Processed:       "//*[normalize-space(text())='Processed' and not(ancestor::table) and not(ancestor::nav)]",

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

    // ── Transaction Tab (on Intake overview page) ─────────────────────────────
    tab_Transaction:                "//button[@data-slot='tabs-trigger'][contains(normalize-space(),'Transaction')] | //button[@role='tab'][contains(normalize-space(),'Transaction')]",

    // First Requisition/PR link in Transaction tab table
    transactionTab_FirstPRLink:     "(//a[contains(@href,'requisition')])[1]",

    // ── Purchase Requisition (PR) page ────────────────────────────────────────
    pr_EditButton:                  '[alt="Edit"]',
    // Ant Design wraps button text in <span> — use normalize-space() not normalize-space(text())
    pr_SubmitButton:                "//button[normalize-space()='Submit']",
    // PR Value — scoped to visible card/div elements only, excludes script/style tags
    pr_ValueField:                  "(//*[self::div or self::span or self::p][contains(normalize-space(),'₹') and string-length(normalize-space()) < 30 and not(ancestor::script) and not(ancestor::style)])[1]",

    // PR Edit form — mandatory field helpers (Ant Design selects + date picker)
    pr_EntityTest2Select:           "(//*[contains(normalize-space(text()),'Entity Test 2')]/following::div[contains(@class,'ant-select')])[1]",
    pr_CompanySelect:               "(//*[contains(normalize-space(text()),'Company') and not(contains(normalize-space(text()),'Contact'))]/following::div[contains(@class,'ant-select')])[1]",
    pr_DeliveryDateInput:           "(//*[contains(normalize-space(text()),'Expected Delivery Date') or contains(normalize-space(text()),'Delivery Date')]/following::input)[1]",
    pr_AntSelectOption:             ".ant-select-item-option-content",

    // PR status badges — similar pattern to intake status
    pr_StatusSubmitted:             "//*[contains(normalize-space(),'Submitted') and not(ancestor::table) and not(ancestor::nav)]",
    pr_StatusPendingProcessCalc:    "//*[contains(normalize-space(),'Pending Process Calculation') and not(ancestor::table) and not(ancestor::nav)]",

    // ── PR More dropdown options ───────────────────────────────────────────────
    pr_Menu_ProcessCalculation:     "//*[@role='menuitem'][contains(normalize-space(),'Process Calculation')]",

    // ── Process tab inside PR ─────────────────────────────────────────────────
    pr_Tab_Process:                 "//button[@data-slot='tabs-trigger'][contains(normalize-space(),'Process')] | //button[@role='tab'][contains(normalize-space(),'Process')]",

    // ── Convert to dropdown (on Process tab — MUI Autocomplete) ──────────────
    // Click the autocomplete input, not the outer label div (pointer events intercepted)
    pr_ConvertToInput:              'input[placeholder*="convert" i], input[placeholder*="Select convert" i]',
    pr_ConvertTo_BulkPO:            "//li[@role='option'][contains(normalize-space(),'Bulk PO')] | //div[@role='option'][contains(normalize-space(),'Bulk PO')] | //*[@role='menuitem'][contains(normalize-space(),'Bulk PO')]",

    // ── Bulk PO — supplier column cells (AG Grid col-id="supplier") ───────────
    // Index [1] is the header row — data rows start at [2]
    bulkPO_SupplierCells:           "//div[@col-id='supplier'][position()>1]",
    bulkPO_SupplierSearch:          'input[placeholder*="Search" i], input[placeholder*="Supplier" i], .ant-select-search__field, input.ant-select-selection-search-input',
    // MUI Autocomplete option — index 1 = "HG HF Test 001" (index 0 is typically "No supplier" or blank)
    bulkPO_SupplierOption:          'li[role="option"][id$="-option-1"], li[role="option"]:has-text("HG HF Test 001")',
    // Price value cell — populated after supplier selection
    bulkPO_PriceCell:               "//td[contains(normalize-space(),'₹') or contains(normalize-space(),'INR')] | (//input[@placeholder='Enter a number' or @type='number'])[1]",

    // ── Convert button (finalises Bulk PO → creates PRC) ─────────────────────
    bulkPO_ConvertBtn:              "//button[normalize-space(.)='Convert' or normalize-space(text())='Convert']",

    // ── Order Builder / PO Approvals page ────────────────────────────────────
    orderBuilder_Heading:           "//*[contains(normalize-space(),'Order Builder') or contains(normalize-space(),'Order builder') or contains(normalize-space(),'PO Approval')]",

    // ── PRC mandatory fields & submit ─────────────────────────────────────────
    prc_CompanyField:               '[id="Company"]',
    prc_PaymentTermsField:          '[id="Payment Terms"]',
    prc_SubmitButton:               "(//span[@class='MuiButton-label'])[3]",

    // ── PRC status: Converted ─────────────────────────────────────────────────
    prc_StatusConverted:            "//*[(normalize-space(text())='Converted' or (contains(normalize-space(),'Converted') and (contains(@class,'badge') or contains(@class,'status') or contains(@class,'chip')))) and not(ancestor::table) and not(ancestor::nav)]",

    // ── Requisition Conversion view ───────────────────────────────────────────
    reqConversion_Section:          "//*[contains(normalize-space(),'Requisition Conversion') or contains(normalize-space(),'Conversion View')]",
    reqConversion_SplitRows:        "//*[contains(@class,'split-row') or contains(@data-testid,'split') or (contains(normalize-space(),'Split') and (ancestor::*[contains(normalize-space(),'Requisition Conversion')]))]",
    reqConversion_PO1:              "//*[normalize-space(text())='PO(1)' or normalize-space(text())='PO (1)' or (contains(normalize-space(),'PO') and contains(normalize-space(),'(1)'))]",
    reqConversion_POCodeLink:       "//a[contains(@href,'/purchase-orders/') or contains(@href,'/orders/') or contains(@href,'/po/')]",

    // ── Quote Requests (RFX) page ─────────────────────────────────────────────
    // Template selector on the quote-requests page — shows current template name
    rfx_TemplateSelector:           "//*[contains(normalize-space(),'NSEF RFX') or contains(normalize-space(),'Default RFX') or contains(normalize-space(),'Template')]//ancestor-or-self::*[@role='combobox' or contains(@class,'select') or contains(@class,'dropdown')][1] | //button[contains(normalize-space(),'NSEF RFX')] | //div[contains(normalize-space(),'NSEF RFX') and contains(@class,'select')]",
    rfx_TemplateOption_DefaultRFX:  "//*[contains(normalize-space(),'Default RFX')][@role='option' or contains(@class,'option') or contains(@class,'item')]",
    // Expand icon button after template change
    rfx_ExpandButton:               "//div[@class='flex w-full']//div[@class='flex gap-[7px]']//button[@class='inline-flex items-center justify-center gap-[7px] whitespace-nowrap text-[12.25px] font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 font-sans hover:bg-accent hover:text-accent-foreground transition-shadow active:shadow-[inset_0_0_0_1000px_rgba(0,0,0,0.05)] rounded-[7px] h-[21px] w-[21px]']",

};
