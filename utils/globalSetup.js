import fs from 'fs';

// Runs once at the start of every `npx playwright test`.
//
// The auction suite records each auction it builds in .auction-<a..e>-state.json
// and, on the next run, reuses it and skips every stage already verified — the
// 2026-10-06 full run skipped all 15 auction tests that way. Clearing the files
// here makes every run build and verify fresh auctions. Retries inside the same
// run still resume, from the files this run writes.
//
// AUC_RESUME=1 keeps the files, for finishing a run whose live window broke.
export default function globalSetup() {
    if (process.env.AUC_RESUME === '1') return;
    for (const f of fs.readdirSync('.')) {
        if (/^\.auction-[a-z]-state\.json$/.test(f)) {
            fs.rmSync(f);
            console.log(`[globalSetup] cleared ${f} — auctions will be rebuilt (AUC_RESUME=1 keeps them)`);
        }
    }
}
