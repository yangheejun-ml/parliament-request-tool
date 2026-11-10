const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const inputPath = path.join(root, "data", "A부_조직도_26개과.csv");
const outputPath = path.join(root, "org.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (quoted) {
    throw new Error("CSV의 따옴표가 닫히지 않았습니다.");
  }

  return rows;
}

const csvText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const [headers, ...dataRows] = parseCsv(csvText);
const requiredHeaders = ["실국", "과", "대표키워드"];

for (const header of requiredHeaders) {
  if (!headers.includes(header)) {
    throw new Error(`필수 열이 없습니다: ${header}`);
  }
}

const columnIndex = Object.fromEntries(
  headers.map((header, index) => [header, index]),
);

const organizations = dataRows
  .filter((row) => row.some((value) => value.trim() !== ""))
  .map((row) => ({
    실국: row[columnIndex.실국].trim(),
    과: row[columnIndex.과].trim(),
    대표키워드: row[columnIndex.대표키워드]
      .split("|")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  }));

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(organizations, null, 2)}\n`,
  "utf8",
);

console.log(`원소 수: ${organizations.length}`);
console.log("첫 원소:");
console.log(JSON.stringify(organizations[0], null, 2));
