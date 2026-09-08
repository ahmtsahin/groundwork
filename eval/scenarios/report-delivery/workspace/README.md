# reportkit

Internal CLI that exports order rows as CSV.

## How it runs today

- `reportkit <from> <to>` writes CSV to stdout.
- Finance runs it ad hoc during the day.
- A nightly batch (`ops/nightly.sh`, not in this repo) calls it ~400 times and
  must finish inside a 10 minute window. The disk cache added in 2.1.0 is what
  keeps it inside that window. The batch redirects each CSV into
  `\\fin-share\reports\<date>\`.
- The upstream sync job rewrites `data/orders.json` roughly every 15 minutes.

## Known consumers

- A Google Sheets import that depends on the exact 2.x column order.
- The nightly batch, which tolerates data up to a day old.
- The BI team, who copy the previous night's CSVs from `\\fin-share\reports`
  by hand every morning and load them into their warehouse.
