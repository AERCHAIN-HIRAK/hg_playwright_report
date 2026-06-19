import { test as setup } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import data from '../pages/NSEFoundationData.json';

// One-time login for the NSE Foundation user (nsefsupport@demo.com).
// Saves the authenticated session to auth.nsef.json, which both NSEF suites
// (testSuiteNSEFhappyPATHS + testSuiteNsefCXOtest) reuse via storageState —
// so login happens once per run instead of for every test.
setup('NSEF login and save session', async ({ page }) => {
    const a = new NSEFoundationActions(page);
    await page.setViewportSize({ width: 1800, height: 900 });

    await a.navigateToApp(data);
    await a.fillLoginEmail(data);
    await a.clickLoginContinue();
    await a.fillLoginPassword(data);
    await a.clickLoginSubmit();
    await a.assertLoggedIn();

    // Wait for the dashboard to finish rendering so the saved state is complete.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.locator('tbody tr td').first()
        .waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    await page.context().storageState({ path: 'auth.nsef.json' });
});
