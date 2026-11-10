const fs = require("node:fs");
const path = require("node:path");

const engine = require("./web/engine.js");

const testPath = path.join(__dirname, "data", "시험_요구문항_40건.csv");
const tests = engine.parseCsv(fs.readFileSync(testPath, "utf8"));

let firstCorrect = 0;
let topThreeCorrect = 0;
const incorrect = [];

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function formatResults(results) {
  if (results.length === 0) {
    return "확인필요(미매칭)";
  }

  return results
    .map(
      (result) =>
        `${result.과}(${result.점수.toFixed(1)}, ${result.근거키워드})`,
    )
    .join(" / ");
}

for (const test of tests) {
  const results = engine.classify(test.요구내용);
  const correctDepartment = test.정답_배분과;

  if (results[0]?.과 === correctDepartment) {
    firstCorrect += 1;
  } else {
    incorrect.push({ test, results });
  }

  if (results.some((result) => result.과 === correctDepartment)) {
    topThreeCorrect += 1;
  }
}

console.log(
  `1순위 정답 ${firstCorrect}/${tests.length} · 3순위 안 ${topThreeCorrect}/${tests.length}`,
);
console.log("");
console.log("틀린 문항 표");
console.log("| 시험번호 | 요구내용 | 정답 | 엔진 결과 |");
console.log("|---|---|---|---|");

if (incorrect.length === 0) {
  console.log("| - | 1순위 오답 없음 | - | - |");
} else {
  for (const { test, results } of incorrect) {
    console.log(
      `| ${escapeTable(test.시험번호)} | ${escapeTable(test.요구내용)} | ` +
        `${escapeTable(test.정답_배분과)} | ${escapeTable(formatResults(results))} |`,
    );
  }
}
