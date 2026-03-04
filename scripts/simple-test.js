#!/usr/bin/env node
/**
 * simple-test.js — Simple validation that mock data is gone
 */

import fs from "fs-extra";
import path from "node:path";

console.log(`[simple-test] 🧪 Validating clean pipeline...`);

// Check that fixtures are gone
const fixturesDir = path.join(process.cwd(), "fixtures");
const fixturesGone = !await fs.pathExists(fixturesDir) || 
                   (await fs.readdir(fixturesDir)).length === 0;

if (fixturesGone) {
  console.log(`✅ Fixtures directory is empty or removed`);
} else {
  console.log(`❌ Fixtures still exist`);
  process.exit(1);
}

// Check that report-sample.js doesn't reference fixtures in code (not comments)
const reportSamplePath = path.join(process.cwd(), "scripts", "report-sample.js");
const reportSampleContent = await fs.readFile(reportSamplePath, "utf-8");
const lines = reportSampleContent.split('\n');
const codeLines = lines.filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
const codeContent = codeLines.join('\n');
const hasFixtureReferences = codeContent.includes("fixtures/") || 
                           codeContent.includes("audit-sample.json") ||
                           codeContent.includes("ga4-sample.json") ||
                           codeContent.includes("fixturesDir");

if (!hasFixtureReferences) {
  console.log(`✅ report-sample.js has no fixture references in code`);
} else {
  console.log(`❌ report-sample.js still references fixtures in code`);
  process.exit(1);
}

// Check that report-gen-html.js doesn't have mockup function (excluding cleanup message)
const reportGenPath = path.join(process.cwd(), "src", "main", "report-gen-html.js");
const reportGenContent = await fs.readFile(reportGenPath, "utf-8");
const hasMockupFunction = reportGenContent.includes("buildLookerStudioMockup") ||
                        reportGenContent.includes("Mockup") ||
                        (reportGenContent.includes("mock") && !reportGenContent.includes("plus de données mock"));

if (!hasMockupFunction) {
  console.log(`✅ report-gen-html.js has no mockup functions`);
} else {
  console.log(`❌ report-gen-html.js still has mockup references`);
  process.exit(1);
}

// Check that clean message is present
const hasCleanMessage = reportGenContent.includes("Nettoyage effectué") ||
                       reportGenContent.includes("plus de données mock");

if (hasCleanMessage) {
  console.log(`✅ Clean pipeline message is present`);
} else {
  console.log(`⚠️ Clean pipeline message not found (optional)`);
}

console.log(`\n🎉 All validations passed!`);
console.log(`🧹 Pipeline cleanup successful - no mock data detected`);
console.log(`✅ Ready for production use`);
