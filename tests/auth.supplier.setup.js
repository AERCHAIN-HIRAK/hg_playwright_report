import { test as setup } from '@playwright/test';
import { NSEFoundationActions } from '../pages/NSEFoundationActions';
import { SupplierPortalActions } from '../pages/SupplierPortalActions';
import data from '../pages/NSEFoundationData.json';

// One-time combined login for the supplier-portal E2E suite.
//
// The suite spans two portals:
//   • CAPP  (nsefsupport@demo.com)  — CXO/Intake/Sourcing/Award/PR/PO/review/approve
//   • SAPP  (hgautonsef@mail.com)   — quote the RFX, create GRN, create Invoice
//
// Both auth tokens are cookies on `.aerchain.io` with distinct names
// (`x-capp-nse-uat-token` / `x-sapp-nse-uat-token`), so a single storageState
// holding both authenticates every page the suite touches. We log into each
// portal in turn, then save the combined session to auth.supplier.json.
setup('CAPP + SAPP login and save combined session', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });

    // 1) CAPP login (sets x-capp-nse-uat-token)
    const capp = new NSEFoundationActions(page);
    await capp.navigateToApp(data);
    await capp.fillLoginEmail(data);
    await capp.clickLoginContinue();
    await capp.fillLoginPassword(data);
    await capp.clickLoginSubmit();
    await capp.assertLoggedIn();
    await page.waitForLoadState('networkidle').catch(() => {});

    // 2) SAPP login (sets x-sapp-nse-uat-token)
    const sapp = new SupplierPortalActions(page);
    await sapp.login();
    // Touch the v4 origin so its localStorage is captured too.
    await sapp.openRfxListing();

    await page.context().storageState({ path: 'auth.supplier.json' });
});
