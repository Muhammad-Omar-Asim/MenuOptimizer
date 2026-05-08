// Confirmatory review prompt.
//
// Used by /api/review. Takes the first-pass audit, compares it against the
// gold-standard reference for completeness/depth/structure, and outputs a
// final REVISED audit. Same output format as the first pass (JSON metrics
// block + GitHub-flavoured Markdown).
//
// To refine:
//   - Edit the CRITICAL RULES list below
//   - Edit the gold-standard reference in lib/prompts/gold-standard.js

import { GOLD_STANDARD } from './gold-standard.js';

export function buildReviewPrompt({ firstPassAudit, location, reports }) {
  const reportsBlock = reports.length
    ? `\n\nSUPPORTING BUSINESS REPORTS (extracted text — figures here are authoritative; cite them where relevant):\n\n` +
      reports
        .map(r => `=== ${String(r?.name || 'report').slice(0, 120)} ===\n${String(r?.content || '').slice(0, 30000)}`)
        .join('\n\n')
    : '';

  const locationBlock = location
    ? `\n\nRESTAURANT LOCATION: ${location}\nCompetitive analysis is at a 45-mile radius around this address.`
    : '';

  return `You are a senior reviewer auditing the work of another consultant. Your job is to perform a CONFIRMATORY CHECK against a known gold-standard audit template, then output a complete, REVISED audit.

CRITICAL RULES:
1. The gold-standard below is a STRUCTURE and DEPTH reference — not source data. Do not import its restaurant-specific facts (item names, prices, category names) into the revised audit unless they actually exist in the first-pass audit or supporting reports.
2. Identify any sections, tables, or analyses that are MISSING, INCOMPLETE, or SHALLOWER than the gold-standard.
3. Identify any sentences that are cut off mid-thought or that reference content that doesn't exist (artifacts of streaming truncation).
4. Then output the FINAL REVISED audit in full. Do not output the diff or list of issues — output the corrected audit text directly. Preserve the first-pass's correct findings; expand or repair the parts that need it.
5. Use the SAME output format rules as the first pass:
   - Begin with the JSON metrics block between <<<JSON and JSON>>> markers (carry over the metrics from the first pass — do not change them unless they are clearly wrong).
   - Then GitHub-flavoured Markdown with proper tables (header row + separator), ## section headings, ### sub-headings, **bold** for emphasis.
   - Tables MUST be valid Markdown tables (every row including the separator and every data row) — never use raw inline pipes-on-one-line.
   - Conclude with the literal line: *— End of audit —*
6. Length budget: aim for parity with the gold-standard's 6-section depth. Do not pad with generic platitudes; every recommendation must connect to a concrete observation in the menu or reports.${locationBlock}

GOLD-STANDARD AUDIT TEMPLATE (reference for structure & depth — DO NOT copy facts):
${GOLD_STANDARD}

FIRST-PASS AUDIT TO REVIEW AND REVISE:
${firstPassAudit}${reportsBlock}

Now output the FINAL REVISED audit.`;
}
