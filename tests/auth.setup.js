import { test as setup, expect } from '@playwright/test';

setup('Login and save session', async ({ page }) => {

    await page.goto('https://nse-capp-v4-uat.aerchain.io');

    await page.fill('#email', 'nsesupport@aerchain.io');
    await page.click('[type="submit"]');

    await page.fill('#password', 'Test@12345');
    await page.click('[type="submit"]');

    await page.waitForURL('**nse-capp-v4-uat.aerchain.io/**');

    await expect(page).toHaveURL(/capp/);

    await page.waitForURL('**nse-capp-v4-uat.aerchain.io/**');

    await page.waitForSelector('text=Intake', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.context().storageState({ path: 'auth.json' });

});