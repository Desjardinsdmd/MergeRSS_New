import fs from 'node:fs';
import { buildReportPdf } from '/app/src/lib/pdf/buildReportPdf.js';

const outlook = `### Institutional capital is rotating into necessity retail

**Primaris REIT** closed two enclosed-mall acquisitions this month, and the pricing implies cap rates near 8%. [Read on howardchai.substack.com](https://howardchai.substack.com/p/primaris-reit-acquisitions-and-the-mall-thesis-2026?utm_source=newsletter&utm_medium=email)

Why it matters: retail landlords with grocery anchors are now competing with multifamily for the same pension allocations, which compresses the spread for *new* purpose-built rental.

#### Retail and multifamily activity

- **CAPREIT** sold 1,200 suites in Quebec at a reported $260k per door ([source](https://www.globeandmail.com/business/article-capreit-sells-quebec-portfolio-2026/))
- Minto launched a 400-unit lease-up in Ottawa with two months free on 14-month terms
- Long link with no label: https://www.example-very-long-domain-name-for-testing.com/a/really/long/path/that/would/overflow/the/column/if/printed/raw/1234567890abcdef

1. Watch the Bank of Canada's December decision; a 25 bp cut would reopen the CMHC MLI Select refinance window for 2024 vintage deals.
2. Construction starts in Ottawa are tracking 30% below 2025. Supply relief for lease-ups arrives in 2028 at the earliest.
3. Expect more CMHC policy tweaks: **MLI Select** affordability points are under review.

Supercalifragilisticexpialidociousandthensomeextralongtokenwithoutanyspacesatallthatmustwrapsafelyacrossthecolumnwidthwithoutoverflowing
`;

const sample = {
  digest_name: 'Canadian Multifamily and Capital Markets Weekly',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  actual_start: '2026-09-03',
  actual_end: '2026-09-30',
  delivery_count: 26,
  report: {
    executive_summary: `Institutional capital rotated decisively toward necessity retail and stabilized multifamily in September, while development starts kept falling. **Primaris REIT** led retail acquisitions, CMHC programs kept rental construction financeable, and Ottawa lease-up concessions widened to two months free on most new product.
Rates remain the swing factor. A December cut would unlock refinancing for deals stuck since 2024, see [the BoC schedule](https://www.bankofcanada.ca/press/upcoming-events/).`,
    key_themes: [
      { theme: 'Necessity retail competes with multifamily for pension capital', trajectory: 'rising', description: 'Grocery-anchored retail traded at cap rates **50 to 75 bp** wider than multifamily. Pension buyers [noted the spread](https://www.reuters.com/markets/deals/pension-funds-retail-2026) as a reason to rebalance.\n\nWhy it matters: fewer bids for stabilized rental assets.' },
      { theme: 'Lease-up concessions deepen in Ottawa', trajectory: 'falling', description: 'Effective rents on new purpose-built rental fell for the third straight month as concessions reached two months free on 14-month terms across Kanata and Centretown.' },
      { theme: 'CMHC MLI Select remains the financing backbone', trajectory: 'stable', description: 'Nearly every new start in the sample relies on MLI Select. Policy chatter about tightening affordability points created uncertainty but no change yet.' },
      { theme: 'Construction cost volatility from tariffs', trajectory: 'volatile', description: 'Electrical and steel packages saw **8 to 12%** swings between tender and award. ' + 'Contractors are pricing tariff risk explicitly. '.repeat(4) },
      { theme: 'Condo inventory overhang', trajectory: 'peaked', description: 'Unsold condo inventory in Toronto appears to have topped out; some developers are converting projects to rental.' },
      { theme: 'Rate expectations', trajectory: 'resolving', description: 'Market pricing converged on one more cut this year.' },
    ],
    escalating_topics: ['Necessity retail acquisitions', 'Rental lease-up concessions', 'Tariff risk in tenders'],
    deescalating_topics: ['Condo pre-sales', 'Office-to-residential conversions'],
    cyclical_topics: [],
    inflection_points: [
      { date: 'Sep 4, 2026', event: 'Primaris REIT announces two mall acquisitions', significance: 'First sizeable enclosed-mall deals since 2022; **sets a pricing benchmark**.' },
      { date: 'Sep 12, 2026', event: 'CMHC signals review of MLI Select affordability scoring', significance: 'Raises execution risk for deals underwritten on 70-point scoring. [CMHC release](https://www.cmhc-schl.gc.ca/media-newsroom/news-releases/2026/mli-select-review)' },
      { date: 'Sep 18, 2026', event: 'Ottawa lease-up concessions reach two months free', significance: 'Effective rent decline now visible across three submarkets.' },
      { date: 'Sep 29, 2026', event: 'Bank of Canada minutes lean dovish', significance: 'Markets price a December cut at 70%.' },
    ],
    outlook,
    data_summary: { digest_count: 26, date_range: 'September 3 to September 30, 2026', most_active_period: 'Week of September 15' },
  },
};

const { doc, filename } = buildReportPdf(sample, { now: new Date('2026-10-01T12:00:00') });
fs.writeFileSync('/tmp/sample-report.pdf', Buffer.from(doc.output('arraybuffer')));
console.log('full', filename, doc.getNumberOfPages());

// Sparse report: empty sections must be skipped and renumbered (Inbox-style export).
const sparse = {
  digest_name: 'Daily briefing',
  start_date: '2026-09-30T13:00:00Z',
  end_date: '2026-09-30T13:00:00Z',
  delivery_count: 12,
  report: {
    executive_summary: '# Daily briefing',
    key_themes: [], inflection_points: [], escalating_topics: [], deescalating_topics: [], cyclical_topics: [],
    outlook: '# Daily briefing\n' + outlook,
    data_summary: { digest_count: 1, date_range: 'September 30, 2026', most_active_period: '' },
  },
};
const s2 = buildReportPdf(sparse, { now: new Date('2026-10-01T12:00:00') });
fs.writeFileSync('/tmp/sample-sparse.pdf', Buffer.from(s2.doc.output('arraybuffer')));
console.log('sparse', s2.filename, s2.doc.getNumberOfPages());
