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

// ── Network-quiet wait ───────────────────────────────────────────────────────
// Replaces fixed sleeps whose real job was "let the app finish talking to the
// server" (after a Submit, an Approve, a reload, a new tab). A fixed 2-3s is
// too long on a fast network and too short on a slow one; this waits until the
// page has had no XHR/fetch in flight for `quietMs`, however long that takes,
// up to `maxMs`.
//
// Contract, so a slow network can never turn this into a failure:
//   · it NEVER throws — on `maxMs` it logs and lets the caller carry on, which
//     is exactly what the old fixed sleep did;
//   · the quiet clock starts when it is called, so it always waits at least
//     `quietMs` even if nothing has started yet;
//   · requests open for over 30s (long-polls, streams) count as background,
//     not as "the app is still busy".
// Requests are tracked per browser CONTEXT, so tabs opened later are covered.
const _netByPage = new WeakMap();
const _trackedContexts = new WeakSet();

function _netState(page) {
    let s = _netByPage.get(page);
    if (!s) { s = new Map(); _netByPage.set(page, s); }
    return s;
}

export function trackNetwork(context) {
    if (!context || _trackedContexts.has(context)) return;
    _trackedContexts.add(context);
    const pageOf = r => { try { return r.frame().page(); } catch { return null; } };
    // intake-canvas-update is the intake page's background autosave: it fires
    // repeatedly and stays open 20-30s, so counting it would make every wait on
    // an intake page sit out its full limit (seen 2026-11-26).
    const IGNORED = /\/intake-canvas-update\b/;
    const isApi = r => (r.resourceType() === 'xhr' || r.resourceType() === 'fetch')
        && !IGNORED.test(r.url());
    context.on('request', r => {
        if (!isApi(r)) return;
        const p = pageOf(r);
        if (p) _netState(p).set(r, Date.now());
    });
    const done = r => { const p = pageOf(r); if (p) _netState(p).delete(r); };
    context.on('requestfinished', done);
    context.on('requestfailed', done);
}

export async function waitForNetworkQuiet(page, { quietMs = 1000, maxMs = 120000, tag = '' } = {}) {
    trackNetwork(page.context());
    const inflight = _netState(page);
    const start = Date.now();
    let quietSince = start;
    while (Date.now() - start < maxMs) {
        if (page.isClosed()) return false;
        const now = Date.now();
        let busy = false;
        for (const t of inflight.values()) if (now - t < 30000) { busy = true; break; }
        if (busy) quietSince = now;
        else if (now - quietSince >= quietMs) {
            if (process.env.WAIT_PROFILE_DIR) console.log(`[NET] ${tag} quiet after ${now - start}ms`);
            return true;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    const open = [...inflight.entries()].filter(([, t]) => Date.now() - t < 30000)
        .map(([r, t]) => `${r.method()} ${r.url().replace(/\?.*/, "")} (${Math.round((Date.now() - t) / 1000)}s)`);
    console.log(`[NET] ${tag} still busy after ${maxMs / 1000}s — continuing. Open: ${open.join(", ") || "none"}`);
    return false;
}
