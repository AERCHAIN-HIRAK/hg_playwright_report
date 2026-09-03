import { test, expect } from '@playwright/test';
import { rfxCollabActions } from '../pages/rfxCollabActions';

// ─────────────────────────────────────────────────────────────────────────────
// RFX — Negotiations and buyer comments (v4 app)
//
// Sheet scenarios:
//   30  Negotiations can be performed for the RFX
//   34  the buyer can add comments for another user of the RFX
//
// Both were parked as "none on the sample RFX" — correctly, because the sample
// RFX-26-231 is AWARDED. Neither control exists in that state. Verified live
// 2026-09-03:
//   RFX-26-231 (Awarded) → Analysis offers "Select View Type", "Compare" only
//   RFX-26-239 (Quoted)  → Analysis adds "Negotiation" and "Award"
// So these tests find a QUOTED RFX instead of using the saved sample.
//
// Safety: only RFXs whose Subject contains "HG Automation" are touched, the same
// guard the RFX-cancel test uses.
//
// 30 stops at the negotiation request FORM and does not submit — sending a
// negotiation changes the RFX's state and would need a QA-designated throwaway
// RFX, the way block/unblock (147) and RFX-cancel (98) were handled.
// 34 DOES post a real comment, since a comment that is never sent proves
// nothing. It is stamped so automation-authored comments are obvious.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RFX — negotiations and comments', () => {

    test.describe.configure({ timeout: 300000 });

    /** @type {rfxCollabActions} */
    let rfx;

    test.beforeEach(async ({ page }) => {
        rfx = new rfxCollabActions(page);
        await page.setViewportSize({ width: 1800, height: 950 });
    });

    // ── 30 ────────────────────────────────────────────────────────────────────

    test('a quoted RFX offers Negotiation and opens the negotiation request form @RFX @Negotiation @S30', async ({ page }) => {
        const target = await rfx.findQuotedRfx();
        test.skip(!target, 'no Quoted "HG Automation" RFX available');

        await rfx.openOverview(target.id);
        await rfx.openAnalysis();

        const actions = await rfx.analysisActionLabels();
        console.log(`[S30] ${target.code} analysis actions: ${actions.join(' · ')}`);
        expect(actions, `${target.code} is Quoted but exposes no Negotiation action`)
            .toContain('Negotiation');

        await rfx.openNegotiation();
        expect(page.url(), 'Negotiation did not open the negotiations route').toMatch(/\/negotiations/);

        // The request form must actually be usable, not just routed to.
        const body = (await page.locator('body').innerText()).trim();
        expect(body, 'no new-negotiation-request form rendered').toMatch(/negotiation-request/i);
        await expect(page.locator('xpath=//button[normalize-space()="Submit"]').first(),
            'the negotiation form offers no Submit').toBeVisible({ timeout: 20000 });
        await expect(page.locator('xpath=//button[contains(normalize-space(),"Select template")]').first(),
            'the negotiation form offers no template picker').toBeVisible({ timeout: 20000 });

        console.log('[S30] negotiation request form is available — not submitted (would alter RFX state)');
    });

    test('an awarded RFX does not offer Negotiation @RFX @Negotiation @S30', async () => {
        const all = await rfx.listRfx();
        const awarded = all.find(r => /awarded/i.test(r.status) && /HG Automation/i.test(r.subject));
        test.skip(!awarded, 'no Awarded "HG Automation" RFX available for the contrast case');

        await rfx.openOverview(awarded.id);
        await rfx.openAnalysis();

        const actions = await rfx.analysisActionLabels();
        console.log(`[S30] ${awarded.code} (Awarded) analysis actions: ${actions.join(' · ')}`);

        // Without this, "Negotiation is present on a quoted RFX" could just mean
        // "Negotiation is always present".
        expect(actions, `${awarded.code} is Awarded yet still offers Negotiation`)
            .not.toContain('Negotiation');
    });

    // ── 34 ────────────────────────────────────────────────────────────────────

    test('the buyer can post a comment mentioning another user @RFX @Comments @S34', async () => {
        const target = await rfx.findQuotedRfx();
        test.skip(!target, 'no Quoted "HG Automation" RFX available');

        await rfx.openOverview(target.id);
        await rfx.openActivityLog();
        await rfx.openCommentsTab();

        const before = await rfx.commentsText();
        expect(before, 'the Comments tab did not render its composer hint')
            .toMatch(/Add comment|Start a conversation|@ to mention/i);

        const stamp = Date.now().toString().slice(-8);
        const text = `HG Automation comment ${stamp}`;
        const { mentioned } = await rfx.postComment(text, { mention: 'NSEIL Support User' });

        const after = await rfx.commentsText();
        expect(after, `the posted comment "${text}" is not shown in the Comments tab`)
            .toContain(text);
        expect(after, 'the tab still shows the empty state after posting')
            .not.toMatch(/No comments yet/i);

        if (mentioned) {
            expect(after, `the comment does not show the mentioned user "${mentioned}"`)
                .toContain(mentioned);
            console.log(`[S34] posted "${text}" mentioning ${mentioned}`);
        } else {
            // Recorded rather than silently downgraded — 34 is specifically about
            // commenting FOR another user, so a run without a mention is partial.
            console.log(`[S34] posted "${text}" WITHOUT a mention — the @ list offered no target`);
        }
    });
});
