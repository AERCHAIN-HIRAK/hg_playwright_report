// ─────────────────────────────────────────────────────────────────────────────
// Reports module + Email Report Logs (v3 app, nse-capp-uat.aerchain.io)
//
// NOTE: /admin-reports returns 403 for the NSEF login, so only the Reports
// module is covered. QA confirmed 2026-09-01 that admin reports are out of
// scope for this account.
// ─────────────────────────────────────────────────────────────────────────────

exports.reports_Locators = {

    // ── Report list / detail ──────────────────────────────────────────────────
    reportByName:        (name) => `//*[normalize-space()="${name}"]`,

    // The date range is two plain text inputs, not a picker dialog.
    startDate:           `input[placeholder='Start date']`,
    endDate:             `input[placeholder='End date']`,

    generateButton:      `button:has-text('Generate Report')`,
    downloadButton:      `button:has-text('Download')`,
    sendMailButton:      `button:has-text('Send Mail')`,

    // Generated output renders as a plain table.
    resultRows:          `tbody tr`,

    // ── Email Report Logs ─────────────────────────────────────────────────────
    logRows:             `tbody tr`,
    logDownloadLink:     `//tbody/tr[1]//a[normalize-space()="Download"]`,
};
