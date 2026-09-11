import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Per-field upload files for sheet scenario 59.
//
// The award page shows only a COUNT ("Upload 1 File"), never a filename, so
// uploading the same file into all four fields would make the carry-forward
// check meaningless: "4 files on the PR" could not be tied back to the field
// each came from. Each field therefore gets its own distinctly named copy, and
// the PR/PRC assertions look for those exact names.
//
// Copies are written to downloads/ (gitignored) rather than fixtures/, so a run
// never adds files to the repo.
// ─────────────────────────────────────────────────────────────────────────────

export const AWARD_ATTACHMENT_FIELDS = [
    'Commercial Comparison',
    'Vendor Quotes',
    'Justification',
    'Others',
];

const SOURCE = 'fixtures/invoice_document.png';

/**
 * One uniquely named copy of the fixture per award attachment field.
 * @returns {{field: string, file: string, name: string}[]}
 */
export function makeAwardAttachmentFiles(runId = Date.now()) {
    if (!fs.existsSync(SOURCE)) {
        throw new Error(`[S59] upload fixture missing: ${SOURCE}`);
    }
    fs.mkdirSync('downloads', { recursive: true });

    return AWARD_ATTACHMENT_FIELDS.map((field) => {
        const slug = field.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const name = `s59_${slug}_${runId}.png`;
        const file = path.join('downloads', name);
        fs.copyFileSync(SOURCE, file);
        return { field, file, name };
    });
}
