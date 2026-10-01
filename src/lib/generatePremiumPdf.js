/**
 * MergeRSS intelligence report PDF export (design system v3, "briefing studio").
 *
 * Layout lives in ./pdf/buildReportPdf.js and is DOM-free so it can be tested
 * in node. This wrapper keeps the public API used by ReportViewer,
 * DigestReports and Inbox: generatePremiumPdf(savedReport) downloads the file.
 *
 * savedReport: {
 *   report: { executive_summary, key_themes[{ theme, description, trajectory }],
 *             escalating_topics[], deescalating_topics[], cyclical_topics[],
 *             inflection_points[{ date, event, significance }], outlook,
 *             data_summary{ digest_count, date_range, most_active_period } },
 *   digest_name, start_date, end_date, delivery_count, actual_start?, actual_end?
 * }
 */

import { buildReportPdf } from './pdf/buildReportPdf.js';

export { buildReportPdf };

export async function generatePremiumPdf(savedReport) {
  const { doc, filename } = buildReportPdf(savedReport || {});
  doc.save(filename);
}
