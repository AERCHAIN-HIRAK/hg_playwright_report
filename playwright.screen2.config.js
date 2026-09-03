// Same as playwright.config.js, but launches the browser on the EXTERNAL monitor
// instead of the MacBook's built-in display.
//
// Verified 2026-08-20 by probing screen.width/height from a launched window:
//   built-in "Color LCD"  → logical 1710x1112 at (0,0)      (main display)
//   BenQ GW2790T          → logical 1920x1080 at (1710,0)   (screen 2)
// so --window-position=1710,0 puts the window fully on the BenQ.
//
// Usage: npx playwright test --config=playwright.screen2.config.js <spec>
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
    ...base,
    use: {
        ...base.use,
        launchOptions: {
            ...(base.use?.launchOptions ?? {}),
            // Position ONLY. Forcing --window-size fights the tests' own
            // page.setViewportSize({1800x900}) and produced "element is outside
            // of the viewport" + sticky-header click interception in the quote grid.
            args: ['--window-position=1710,0'],
        },
    },
});
