
/**
 * IMPORTANT
 * =========
 * This code is provided with absolutely no guarantees whatsoever of correctness.
 * Use at your own risk, I am not responsible for any miscalculations, accounting
 * errors or other problems arising from this code or its usage.
 */

//
// For usage instructions see README.md
//

import { execSync } from "child_process";
import * as fs from "fs";

const saleAmountColumns = [
  "Gross Proceeds",
  "Wire Fee",
  "Commission",
  "Supplemental Transaction Fee",
  "Net Proceeds",
];

interface Release {
  releaseDate: string;
  settlementDate: string;
  releasePrice: string;
  quantity: number;
  withheld: number;
  issued: number;
}

interface Sale {
  withdrawalDate: string;
  settlementDate: string;
  marketPricePerUnit: string;
  sharesSold: number;
  amounts: string[];
}

interface ESPPPurchase {
  purchaseDate: string;
  purchasePrice: string;
  sharesPurchased: number;
  sharesWithheld?: number;
}

interface ParsedData {
  releases: Release[];
  sales: Sale[];
  esppPurchases: ESPPPurchase[];
}

function extractTextFromPDF(pdfPath: string): string {
  const result = execSync(`pdftotext -layout "${pdfPath}" -`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function parseReleases(text: string): Release[] {
  const releases: Release[] = [];
  const sections = text.split(/Share Units - Release \(/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    const releaseDateMatch = section.match(
      /Release Date:\s*(\d{2}-\w{3}-\d{4})/
    );
    const settlementDateMatch = section.match(
      /Settlement Date:\s*(\d{2}-\w{3}-\d{4})/
    );
    const releasePriceMatch = section.match(
      /Release Price:\s*\$([\d,.]+)\s*USD/
    );
    const quantityMatch = section.match(
      /Number of Restricted Awards Released:\s*([\d,]+)/
    );
    const withheldMatch = section.match(
      /Number of Restricted Awards (?:Withheld|Sold):\s*([\d,]+)/
    );
    const issuedMatch = section.match(
      /Number of Restricted Awards (?:Issued|Disbursed):\s*([\d,]+)/
    );

    if (
      releaseDateMatch &&
      settlementDateMatch &&
      releasePriceMatch &&
      quantityMatch &&
      issuedMatch
    ) {
      releases.push({
        releaseDate: releaseDateMatch[1],
        settlementDate: settlementDateMatch[1],
        releasePrice: releasePriceMatch[1],
        quantity: parseInt(quantityMatch[1].replace(/,/g, "")),
        withheld: withheldMatch
          ? parseInt(withheldMatch[1].replace(/,/g, ""))
          : 0,
        issued: parseInt(issuedMatch[1].replace(/,/g, "")),
      });
    }
  }

  return releases;
}

function parseSales(text: string): Sale[] {
  const sales: Sale[] = [];
  const sections = text.split(/Withdrawal on ([^\r\n]+)/);

  for (let i = 1; i < sections.length; i += 2) {
    const headingDate = sections[i].match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})\s*$/);
    const section = sections[i + 1];

    const settlementDateMatch = section.match(
      /Settlement Date:\s*(\d{2}-\w{3}-\d{4})/
    );
    const priceMatch = section.match(
      /Market Price Per Unit:\s*\$([\d,.]+)\s*USD/
    );
    const sharesMatch = section.match(/Shares Sold:\s*([\d,]+)/);

    if (settlementDateMatch && priceMatch && sharesMatch) {
      sales.push({
        withdrawalDate: headingDate
          ? `${headingDate[2].padStart(2, "0")}-${headingDate[1].slice(0, 3)}-${headingDate[3]}`
          : "",
        settlementDate: settlementDateMatch[1],
        marketPricePerUnit: priceMatch[1].replace(/,/g, ""),
        sharesSold: parseInt(sharesMatch[1].replace(/,/g, "")),
        amounts: saleAmountColumns.map((label) => {
          // Export fees as positive charges, as with the share withholding counts.
          const amount = section.match(new RegExp(`\\b${label}:?\\s*\\$-?([\\d,.]+)\\s*USD\\b`));
          return amount ? amount[1].replace(/,/g, "") : "";
        }),
      });
    }
  }

  return sales;
}

function parseESPPPurchases(text: string): ESPPPurchase[] {
  const purchases: ESPPPurchase[] = [];
  const youBoughtPattern =
    /(\d{2}-\w{3}-\d{4})[ \t]+You bought[ \t]+(?:\$[\d,.]+(?:[ \t]+USD)?[ \t]+)?([\d,]+)[ \t]+\$([\d,.]+)[^\r\n]*/g;
  // Start at the end of the purchase row so another same-day purchase can't reuse the withholding.
  const withheldPattern =
    /\r?\n[ \t]*(\d{2}-\w{3}-\d{4})[ \t]+Shares Withheld for Taxes[ \t]+(?:\$-?[\d,.]+(?:[ \t]+USD)?[ \t]+)?-([\d,]+)/y;

  let match;
  while ((match = youBoughtPattern.exec(text)) !== null) {
    withheldPattern.lastIndex = youBoughtPattern.lastIndex;
    const withholding = withheldPattern.exec(text);
    purchases.push({
      purchaseDate: match[1],
      purchasePrice: match[3].replace(/,/g, ""),
      sharesPurchased: parseInt(match[2].replace(/,/g, "")),
      sharesWithheld: withholding && withholding[1] === match[1]
        ? parseInt(withholding[2].replace(/,/g, ""))
        : 0,
    });
  }

  if (purchases.length === 0) {
    const purchaseHistoryPattern =
      /(\d{2}-\w{3}-\d{4})\s+\d{2}-\w{3}-\d{4}\s+\$[\d.]+\s+(\d{2}-\w{3}-\d{4})\s+\$[\d.]+\s+\$([\d.]+)\s+(\d+)/g;
    while ((match = purchaseHistoryPattern.exec(text)) !== null) {
      purchases.push({
        purchaseDate: match[2],
        purchasePrice: match[3],
        sharesPurchased: parseInt(match[4]),
      });
    }
  }

  return purchases;
}

function parseStatement(pdfPath: string): ParsedData {
  const text = extractTextFromPDF(pdfPath);

  return {
    releases: parseReleases(text),
    sales: parseSales(text),
    esppPurchases: parseESPPPurchases(text),
  };
}

function parseDate(dateStr: string): Date {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const [day, month, year] = dateStr.split("-");
  return new Date(parseInt(year), months[month], parseInt(day));
}

function toCSV(data: ParsedData): string {
  interface Record {
    type: string;
    date: string;
    settlementDate: string;
    price: string;
    quantity: number;
    withheld: number | string;
    issued: number | string;
    sortDate: Date;
    saleAmounts?: string[];
  }

  const records: Record[] = [];

  for (const r of data.releases) {
    records.push({
      type: "Release",
      date: r.releaseDate,
      settlementDate: r.settlementDate,
      price: r.releasePrice,
      quantity: r.quantity,
      withheld: r.withheld,
      issued: r.issued,
      sortDate: parseDate(r.releaseDate),
    });
  }

  for (const s of data.sales) {
    records.push({
      type: "Sale",
      date: s.withdrawalDate,
      settlementDate: s.settlementDate,
      price: s.marketPricePerUnit,
      quantity: s.sharesSold,
      withheld: "",
      issued: "",
      sortDate: parseDate(s.settlementDate),
      saleAmounts: s.amounts,
    });
  }

  for (const p of data.esppPurchases) {
    records.push({
      type: "ESPP Purchase",
      date: p.purchaseDate,
      settlementDate: p.purchaseDate,
      price: p.purchasePrice,
      quantity: p.sharesPurchased,
      withheld: p.sharesWithheld ?? "",
      issued: p.sharesWithheld === undefined ? "" : p.sharesPurchased - p.sharesWithheld,
      sortDate: parseDate(p.purchaseDate),
    });
  }

  records.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

  // Date is the statement's withdrawal date for sales. It may differ from execution.
  const lines = [
    ["Type", "Date", "Settlement Date", "Price", "Quantity", "Withheld", "Issued", ...saleAmountColumns].join(","),
  ];
  const emptySaleAmounts = saleAmountColumns.map(() => "");
  for (const r of records) {
    lines.push([
      r.type, r.date, r.settlementDate, r.price, r.quantity, r.withheld, r.issued,
      ...(r.saleAmounts ?? emptySaleAmounts),
    ].join(","));
  }

  return lines.join("\n");
}

function toSeparateCSVs(data: ParsedData): {
  releases: string;
  sales: string;
  esppPurchases: string;
} {
  const sortedReleases = [...data.releases].sort(
    (a, b) => parseDate(a.releaseDate).getTime() - parseDate(b.releaseDate).getTime()
  );
  const releasesLines = [
    "Release Date,Settlement Date,Release Price,Quantity,Withheld,Issued",
  ];
  for (const r of sortedReleases) {
    releasesLines.push(
      `${r.releaseDate},${r.settlementDate},${r.releasePrice},${r.quantity},${r.withheld},${r.issued}`
    );
  }

  const sortedSales = [...data.sales].sort(
    (a, b) => parseDate(a.settlementDate).getTime() - parseDate(b.settlementDate).getTime()
  );
  const salesLines = [
    ["Settlement Date", "Market Price Per Unit", "Shares Sold", "Withdrawal Date", ...saleAmountColumns].join(","),
  ];
  for (const s of sortedSales) {
    salesLines.push([
      s.settlementDate, s.marketPricePerUnit, s.sharesSold, s.withdrawalDate, ...s.amounts,
    ].join(","));
  }

  const sortedESPP = [...data.esppPurchases].sort(
    (a, b) => parseDate(a.purchaseDate).getTime() - parseDate(b.purchaseDate).getTime()
  );
  const esppLines = ["Purchase Date,Purchase Price,Shares Purchased,Withheld,Issued"];
  for (const p of sortedESPP) {
    esppLines.push([
      p.purchaseDate, p.purchasePrice, p.sharesPurchased, p.sharesWithheld ?? "",
      p.sharesWithheld === undefined ? "" : p.sharesPurchased - p.sharesWithheld,
    ].join(","));
  }

  return {
    releases: releasesLines.join("\n"),
    sales: salesLines.join("\n"),
    esppPurchases: esppLines.join("\n"),
  };
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: npx tsx parse-statement.ts <pdf-file> [output-file.csv]");
  console.error(
    "       npx tsx parse-statement.ts <pdf-file> --separate [output-prefix]"
  );
  process.exit(1);
}

const pdfPath = args[0];
if (!fs.existsSync(pdfPath)) {
  console.error(`File not found: ${pdfPath}`);
  process.exit(1);
}

const data = parseStatement(pdfPath);

const separateIndex = args.indexOf("--separate");
if (separateIndex !== -1) {
  const prefix = args[separateIndex + 1] || "statement";
  const csvs = toSeparateCSVs(data);

  fs.writeFileSync(`${prefix}_releases.csv`, csvs.releases);
  fs.writeFileSync(`${prefix}_sales.csv`, csvs.sales);
  fs.writeFileSync(`${prefix}_espp_purchases.csv`, csvs.esppPurchases);

  console.log(`Created: ${prefix}_releases.csv`);
  console.log(`Created: ${prefix}_sales.csv`);
  console.log(`Created: ${prefix}_espp_purchases.csv`);
} else if (args[1]) {
  fs.writeFileSync(args[1], toCSV(data));
  console.log(`Created: ${args[1]}`);
} else {
  console.log(toCSV(data));
}
