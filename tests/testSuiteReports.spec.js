import { test, expect } from '@playwright/test';
import { reportsActions } from '../pages/reportsActions';

// ─────────────────────────────────────────────────────────────────────────────
// Reports module — scenario 114
//
//   "Verify after any report is sent via mail from admin reports or reports
//    module then its logged in admin reports and that report can be downloaded
//    from the log."
//
// QA walkthrough (2026-09-01):
//   go into any report → generate for the last 3 months → Download (a file must
//   download) → Send Mail → the send is recorded in the Email Report Logs, and
//   a status of success there means the mail went out. The log row also carries
//   its own download.
//
// QA also confirmed /admin-reports is 403 for the NSEF login, so admin reports
// are OUT OF SCOPE here; only the Reports module is covered.
//
// Checking the RECEIVED MAIL is a separate test — see the @Mailbox tag — because
// Gmail sign-in for this account is behind a device-tap 2FA prompt.
// ─────────────────────────────────────────────────────────────────────────────

const REPORT = 'PR Ageing Report';

test.describe('Reports — generate, download and email', () => {

    // Generous: the email pipeline is asynchronous and has been seen to take
    // several minutes to move a log row from "pending" to "success".
    test.describe.configure({ timeout: 900000 });

    test(`a report generates, downloads and is logged when emailed @Reports @Email @S109`, async ({ page }) => {
        const r = new reportsActions(page);
        await page.setViewportSize({ width: 1800, height: 900 });

        const url = await r.openReport(REPORT);
        console.log(`[S114] ${REPORT} at ${url}`);

        const range = await r.setDateRangeMonths(3);
        expect(range.start, 'start date did not accept a 3-month range').toBeTruthy();
        console.log(`[S114] range ${range.start} → ${range.end}`);

        // A report with no rows would make the download meaningless.
        const rows = await r.generateAndCountRows();
        expect(rows, 'report generated no rows for the last 3 months').toBeGreaterThan(0);
        console.log(`[S114] generated ${rows} rows`);

        const dl = await r.downloadReport();
        expect(dl, 'Download produced neither a file nor a document tab').not.toBeNull();
        console.log(`[S114] download → ${JSON.stringify(dl).slice(0, 120)}`);

        const status = await r.sendMail();
        expect(status, `Send Mail returned HTTP ${status}`).toBeLessThan(400);
        console.log(`[S114] send mail HTTP ${status}`);

        // The send is asynchronous: the row lands as "pending" first.
        const row = await r.waitForLogStatus(REPORT);
        expect(row, `no Email Report Log row for "${REPORT}"`).toBeTruthy();
        console.log(`[S114] log row ${JSON.stringify(row)}`);

        expect((row['Status'] || '').toLowerCase(),
            `the emailed report was logged as "${row['Status']}" rather than a success`)
            .toMatch(/success|completed/);

        // The log's own download must be live. Rows age out to "Link Expired",
        // so a freshly-sent one is the only meaningful thing to assert on.
        expect(row['Report URL'],
            'the log row exposes no download for the report that was just sent')
            .toMatch(/Download/i);
    });
});
