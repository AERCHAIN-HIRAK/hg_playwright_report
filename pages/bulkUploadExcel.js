import ExcelJS from 'exceljs';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Intake Bulk Upload template writer (sheet scenario 10)
//
// The template the app serves from Bulk Upload → Download Template is a single
// sheet, "Item Details", and it is NOT a blank grid — everything below was read
// out of the real file (Intake_Create_20260911.xlsx) on 2026-09-11:
//
//   · the sheet is PASSWORD PROTECTED (sheetProtection, SHA-512 + salt,
//     spinCount 100000) and carries 6 dataValidations;
//   · 1002 rows and all validation ranges are pre-built, so up to 1001 data
//     rows need no range surgery — do not "extend" anything;
//   · columns H (Remarks) and L (Key/itemKey) carry a `custom` validation whose
//     formula is literally FALSE, i.e. they REJECT every value. H looks like an
//     ordinary free-text column and is a trap. Never write to either;
//   · the pre-built data rows only contain cells C,D,E,F,G,H,L. Column A —
//     Item Name, which is MANDATORY — does not exist in the XML at all, nor do
//     B, I, J, K. Filling A means INSERTING a cell in correct ascending-column
//     order, which is why this goes through exceljs rather than a hand-patched
//     zip: a naive XML edit produces a file that looks right and is corrupt.
//
// exceljs 4.4.0 was verified to round-trip this file losslessly: sheetProtection
// (hash intact), all 6 validations with identical sqrefs, the header row byte
// for byte (including its embedded newlines), and row 1002 untouched.
// ─────────────────────────────────────────────────────────────────────────────

export const INTAKE_SHEET = 'Item Details';

// Only the mandatory columns plus Description. Keys are column letters.
// DeliveryAddress/BillingAddress have exactly ONE legal value in the template's
// dropdown, so anything else is rejected by the schema validation step.
export const INTAKE_BULK_ROW = {
    A: 'Manpower (T&M)',              // Item Name *  (must match the product master)
    B: 'Automation Description',      // Description
    C: 100,                           // Qty *
    D: 'NOS',                         // Unit Of Measurement * (one of the 51 listed)
    E: 'Mumbai - Exchange Plaza BKC', // DeliveryAddress *
    F: 'Mumbai - Exchange Plaza BKC', // BillingAddress *
    G: 2000,                          // Suggested Price (Unit Price) *
};

/**
 * Write `count` identical line-item rows into a downloaded template.
 *
 * @param {string} srcPath  the file the app just served
 * @param {string} outPath  where to write the filled workbook
 * @param {{count?: number, values?: object}} opts
 * @returns {Promise<{path: string, rows: number, size: number}>}
 */
export async function fillIntakeBulkTemplate(srcPath, outPath, { count = 100, values = INTAKE_BULK_ROW } = {}) {
    // 1001 = the 1002 pre-built rows minus the header. Beyond that the
    // validations stop covering the rows and the upload silently loses columns,
    // so fail loudly here instead.
    if (count < 1 || count > 1001) {
        throw new Error(`[BULK] count must be 1..1001 (template ships 1002 rows); got ${count}`);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(srcPath);

    const ws = wb.getWorksheet(INTAKE_SHEET);
    if (!ws) {
        throw new Error(`[BULK] sheet "${INTAKE_SHEET}" not found in ${srcPath} — `
            + `the template changed shape. Sheets present: `
            + JSON.stringify(wb.worksheets.map(w => w.name)));
    }

    for (let r = 2; r <= count + 1; r++) {
        const row = ws.getRow(r);
        for (const [col, val] of Object.entries(values)) row.getCell(col).value = val;
        row.commit();
    }

    await wb.xlsx.writeFile(outPath);
    const size = fs.statSync(outPath).size;
    if (!size) throw new Error(`[BULK] wrote an empty file to ${outPath}`);

    console.log(`[BULK] wrote ${count} rows -> ${outPath} (${size} bytes)`);
    return { path: outPath, rows: count, size };
}
