// Shared wait helpers.

/**
 * Wait until an editable element (input / textarea / contenteditable, or a
 * focused ag-grid cell) has focus, i.e. a click really opened an editor, before typing into it.
 *
 * Blind keystrokes after a fixed pause lost their input whenever the editor
 * opened late on a slow UAT - S12's PO quantity cell was left EMPTY that way
 * (2026-10-05) and Submit was then silently blocked by validation. Waiting for
 * focus turns that into an immediate, clearly-worded failure instead.
 */
export async function waitForEditorFocus(page, timeout = 10000) {
    await page.waitForFunction(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return false;
        // An ag-grid cell that has focus is also ready: typing into it starts
        // the cell editor, which several grid helpers rely on.
        return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable
            || a.getAttribute('role') === 'gridcell' || a.classList.contains('ag-cell');
    }, null, { timeout }).catch(() => {
        throw new Error(`no input took focus within ${timeout}ms - the click did not open an editor`);
    });
}

/**
 * "Today" as the SERVER sees it: the UTC date, as YYYY-MM-DD.
 *
 * The app refuses an invoice dated today (IST) as "Invoice cannot be future
 * dated" between 00:00 and 05:30 IST - it compares in UTC. The UI shows NO error,
 * the Workflow Summary just stays open (found 2026-10-06 00:02 IST, POST
 * /api/capp/invoices/v2 -> 400). Overnight full runs lost most invoice tests to
 * this. Outside that window the UTC and IST dates are equal, so daytime runs
 * are unchanged. Remove once the app compares dates in the user's timezone.
 */
export function serverToday() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * After an invoice document is attached, wait until `ready` is visible, clicking
 * Retry on the intermittent "Extraction Failed" dialog the moment it appears.
 * Used by EVERY invoice upload (CAPP PO / non-PO, Supplier Portal) — the user's
 * standing instruction (2026-11-19) is that Retry must be clicked, and the old
 * helpers either waited minutes before looking or never looked.
 *
 * Polls every 2s for either outcome. Retries up to `maxRetries` times, then
 * falls back to the dialog's continue-without-extraction action.
 *
 * `ready` may be null for a form that is already open (Supplier Portal attaches
 * the document into a filled form): then it only watches for `settleMs` and
 * returns once no failure dialog has shown in that window.
 */
export async function waitForInvoiceExtraction(page, {
    ready = null, tag = 'INV', maxRetries = 5, timeoutMs = 8 * 60000, settleMs = 15000,
} = {}) {
    const failed = () => page.getByText(/Extraction Failed/i).first().isVisible().catch(() => false);
    const click = async (pattern, what) => {
        const btn = page.locator('button').filter({ visible: true }).filter({ hasText: pattern }).first();
        if (!(await btn.isVisible().catch(() => false))) {
            const labels = [...new Set((await page.locator('button').filter({ visible: true }).allTextContents())
                .map(t => t.trim()).filter(t => t && t.length < 40))];
            console.log(`[${tag}] Extraction Failed — no button for ${what}; buttons: ${JSON.stringify(labels)}`);
            return;
        }
        await btn.click();
        console.log(`[${tag}] Extraction Failed → clicked ${what}`);
        await page.waitForTimeout(3000);
    };

    let retries = 0;
    let quietSince = Date.now();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (ready && await ready.isVisible().catch(() => false)) {
            await page.waitForTimeout(2000);
            console.log(`[${tag}] form rendered${retries ? ` after ${retries} retr${retries > 1 ? 'ies' : 'y'}` : ''}`);
            return retries;
        }
        if (await failed()) {
            quietSince = Date.now();
            if (retries < maxRetries) {
                retries++;
                await click(/^\s*retry\s*$/i, `Retry (${retries}/${maxRetries})`);
            } else {
                await click(/manual|proceed|continue|without|skip/i, 'continue manually');
            }
        } else if (!ready && Date.now() - quietSince >= settleMs) {
            return retries;
        }
        await page.waitForTimeout(2000);
    }
    const seen = (await page.locator('body').innerText().catch(() => '')).slice(0, 200);
    throw new Error(`[${tag}] invoice document uploaded but the form never became ready after ${retries} retries. Page shows: ${JSON.stringify(seen)}`);
}
