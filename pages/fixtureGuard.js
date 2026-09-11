import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot / restore for NSEFoundationData.json.
//
// Chain-building tests rewrite savedCxo … savedGrn / savedInvoice, which other
// suites read as fixtures, so a chain-heavy test restores the file when it is
// done. But a NAIVE restore is a trap, and it bit on 2026-09-08:
//
//   invoice.invoiceNumber is a MONOTONIC COUNTER, not a fixture. Rolling it back
//   hands out a number the SERVER has already consumed. The next run then fails
//   the app's duplicate validation with Proceed disabled — scenario 70's first
//   run died exactly this way, on INV-AUTO-119 already held by
//   Invoice-FNSE-26-376 from the scenario 126(b) work.
//
// So: restore the fixtures, but carry counters FORWARD. Anything that only ever
// increases belongs in COUNTER_PATHS.
// ─────────────────────────────────────────────────────────────────────────────

const DATA_PATH = path.resolve('pages/NSEFoundationData.json');

// Dotted paths whose value must never regress.
const COUNTER_PATHS = ['invoice.invoiceNumber'];

const get = (obj, dotted) =>
    dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const set = (obj, dotted, value) => {
    const keys = dotted.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] = o[k] ?? {}), obj);
    target[last] = value;
};

/** Trailing integer of e.g. "INV-AUTO-119" → 119. */
const trailingNum = (v) => {
    const m = String(v ?? '').match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : -1;
};

export function snapshotFixtures() {
    return fs.readFileSync(DATA_PATH, 'utf-8');
}

export function restoreFixtures(snapshot, { tag = 'FIXTURE' } = {}) {
    if (!snapshot) return;
    const before = JSON.parse(snapshot);
    const after = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

    const carried = [];
    for (const p of COUNTER_PATHS) {
        const b = get(before, p);
        const a = get(after, p);
        if (trailingNum(a) > trailingNum(b)) {
            set(before, p, a);
            carried.push(`${p}: ${b} → ${a}`);
        }
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(before, null, 4) + '\n', 'utf-8');
    console.log(`[${tag}] fixtures restored`
        + (carried.length ? `; counters carried forward (${carried.join(', ')})` : ''));
}
