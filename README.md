# morgan-stanley-pdf-to-csv
Converts exported PDFs from Morgan Stanley At Work to CSV format

*IMPORTANT:* This code is provided with absolutely no guarantees whatsoever of correctness.
Use at your own risk, I am not responsible for any miscalculations, accounting errors or other
problems arising from this code or its usage.

## Usage

Open the [statement download page](https://shareworks.solium.com/solium/servlet/ui/activity/reports/statement)
in Morgan Stanley At Work. Select **All Available History**, **PDF**, **Full**,
and **Original**, then download the statement.

<img width="1151" height="719" alt="Statement download settings" src="https://github.com/user-attachments/assets/5cdab01a-0f5a-4429-bc86-41c00bd53275" />

Install Node.js and make sure `pdftotext` (from Poppler) is on your PATH.
On macOS, you can install Poppler with `brew install poppler`.

```sh
npm ci
npx tsx parse-statement.ts statement.pdf output.csv
```

Use `--separate` to write separate files for releases, sales, and ESPP purchases.

```sh
npx tsx parse-statement.ts statement.pdf --separate figma
```

This creates `figma_releases.csv`, `figma_sales.csv`, and
`figma_espp_purchases.csv`.

## CSV conventions

- For sales, `Date` in the combined CSV is the statement's withdrawal date.
  The separate sales CSV calls this `Withdrawal Date`. Both exports include
  `Settlement Date`. Use the trade confirmation to establish the execution date.
- Sale proceeds are in USD. The CSV includes gross and net proceeds and lists
  wire fees, commissions, and supplemental transaction fees as positive charges.
  Fee fields are blank when the statement omits the charge.
- ESPP `Quantity` (or `Shares Purchased` in the separate export) is the gross
  purchase quantity. `Withheld` records shares withheld for tax and `Issued`
  gives the remaining shares. Both fields are blank when only the purchase
  summary is available. The combined CSV repeats the ESPP purchase date in
  `Settlement Date` because the statement supplies one date for the purchase.
- For RSUs, `Withheld` counts shares withheld or sold to cover taxes and fees.
