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
