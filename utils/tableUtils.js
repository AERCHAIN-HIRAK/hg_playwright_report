// Reusable table utility helpers used by action classes.
// These functions work against any Playwright page object + a locator string.

/**
 * Returns an array of trimmed text values from all cells matching cellLocator.
 * @param {import('@playwright/test').Page} page
 * @param {string} cellLocator - XPath or CSS selector that matches a set of <td> cells
 * @returns {Promise<string[]>}
 */
export async function extractColumnText(page, cellLocator) {
    const cells = page.locator(cellLocator);
    const count = await cells.count();
    const values = [];
    for (let i = 0; i < count; i++) {
        const text = await cells.nth(i).textContent();
        values.push((text || '').trim());
    }
    return values;
}

/**
 * Returns number of visible rows in the table body.
 * @param {import('@playwright/test').Page} page
 * @param {string} rowLocator - defaults to standard tbody/tr pattern
 * @returns {Promise<number>}
 */
export async function getRowCount(page, rowLocator = '//tbody/tr') {
    return await page.locator(rowLocator).count();
}

/**
 * Parses pagination info text "Showing X - Y entries" and returns {from, to}.
 * Returns null if text cannot be parsed.
 * @param {string} infoText
 * @returns {{ from: number, to: number } | null}
 */
export function parsePaginationInfo(infoText) {
    const match = infoText.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (!match) return null;
    return { from: parseInt(match[1], 10), to: parseInt(match[2], 10) };
}

/**
 * Checks whether a string array is sorted in ascending order (case-insensitive).
 * @param {string[]} arr
 * @returns {boolean}
 */
export function isAscending(arr) {
    for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].toLowerCase() > arr[i + 1].toLowerCase()) return false;
    }
    return true;
}

/**
 * Checks whether a string array is sorted in descending order (case-insensitive).
 * @param {string[]} arr
 * @returns {boolean}
 */
export function isDescending(arr) {
    for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].toLowerCase() < arr[i + 1].toLowerCase()) return false;
    }
    return true;
}

/**
 * Checks whether an array of date strings is sorted ascending.
 * Handles formats like "May 2, 2026", "April 30, 2026".
 * @param {string[]} arr
 * @returns {boolean}
 */
export function isDateAscending(arr) {
    const timestamps = arr.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (timestamps.length !== arr.length) return true; // skip if unparseable
    for (let i = 0; i < timestamps.length - 1; i++) {
        if (timestamps[i] > timestamps[i + 1]) return false;
    }
    return true;
}

/**
 * Checks whether an array of date strings is sorted descending.
 * @param {string[]} arr
 * @returns {boolean}
 */
export function isDateDescending(arr) {
    const timestamps = arr.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (timestamps.length !== arr.length) return true;
    for (let i = 0; i < timestamps.length - 1; i++) {
        if (timestamps[i] < timestamps[i + 1]) return false;
    }
    return true;
}

/**
 * Waits until the table has at least one visible row, or the no-data row appears.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs=10000]
 */
export async function waitForTableLoad(page, timeoutMs = 15000) {
    await page.waitForFunction(
        () => {
            // img[alt="Loading"] is present in the table container while data is fetching.
            // Wait until it is gone (offsetParent === null = hidden/removed from layout).
            const spinner = document.querySelector('img[alt="Loading"]');
            if (spinner && spinner.offsetParent !== null) return false;
            // Check for cells (not just rows) so we don't pass on empty placeholder rows
            return document.querySelectorAll('tbody tr td').length > 0;
        },
        { timeout: timeoutMs }
    );
    // Brief settle time: React may batch-render pagination text after rows appear
    await page.waitForTimeout(300);
}

/**
 * Checks whether every value in the column contains the expected substring (case-insensitive).
 * @param {string[]} values
 * @param {string} expectedSubstring
 * @returns {boolean}
 */
export function allValuesContain(values, expectedSubstring) {
    const lower = expectedSubstring.toLowerCase();
    return values.every(v => v.toLowerCase().includes(lower));
}
