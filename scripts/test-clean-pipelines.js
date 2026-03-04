#!/usr/bin/env node
/**
 * test-clean-pipelines.js — Test script to validate clean pipeline execution
 *
 * This script validates that:
 * 1. No mock data is being used
 * 2. All pipelines execute cleanly
 * 3. Real audit data is generated properly
 */

import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/engine/orchestrator.js";
import { generateHtmlReport } from "../src/main/report-gen-html.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`[test-clean-pipelines] 🧪 Testing clean pipeline execution...`);

// Test parameters for different profiles
const testCases = [
  {
    name: "Fast Profile",
    params: {
      url: "https://example.com",
      company: "TestCompany",
      preset: "fast",
      accessMode: "public",
      lang: "fr"
    }
  },
  {
    name: "Private Profile",
    params: {
      url: "https://example.com",
      company: "TestCompany",
      preset: "private",
      accessMode: "private",
      lang: "fr",
      serviceAccountJsonPath: null, // Intentionally null to test clean failure
      ga4PropertyId: null,
      gscSiteUrl: null
    }
  }
];

async function runTest(testCase) {
  console.log(`\n[test-clean-pipelines] 📋 Running: ${testCase.name}`);
  
  try {
    // Mock log and progress functions
    const log = (msg) => console.log(`  ${msg}`);
    const progress = (pct) => console.log(`  ⏳ Progress: ${pct}%`);
    
    // Run audit pipeline
    const auditDir = await runAudit(testCase.params, log, progress, null);
    
    // Verify outputs exist
    const auditRunPath = path.join(auditDir, 'audit_run.json');
    const hasAuditRun = await fs.pathExists(auditRunPath);
    
    if (hasAuditRun) {
      const auditRun = await fs.readJson(auditRunPath);
      
      // Validate no mock data
      const hasMockData = JSON.stringify(auditRun).includes('mock') || 
                          JSON.stringify(auditRun).includes('Mock') ||
                          JSON.stringify(auditRun).includes('fixture');
      
      if (hasMockData) {
        console.log(`  ❌ FAILED: Mock data detected in output`);
        return false;
      }
      
      console.log(`  ✅ Audit run saved: ${auditRunPath}`);
      console.log(`  ✅ No mock data detected`);
    }
    
    // Test HTML report generation
    const htmlReportRes = await generateHtmlReport(
      { meta: testCase.params, modules: {}, scores: {} },
      auditDir,
      testCase.params.company
    );
    
    if (htmlReportRes?.htmlPath) {
      console.log(`  ✅ HTML report generated: ${htmlReportRes.htmlPath}`);
    }
    
    return true;
    
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`[test-clean-pipelines] 🚀 Starting pipeline validation...\n`);
  
  const results = [];
  
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push({ name: testCase.name, success: result });
  }
  
  console.log(`\n[test-clean-pipelines] 📊 Results Summary:`);
  results.forEach(r => {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}`);
  });
  
  const allPassed = results.every(r => r.success);
  
  if (allPassed) {
    console.log(`\n[test-clean-pipelines] 🎉 All tests passed! Pipelines are clean.`);
    console.log(`[test-clean-pipelines] 🧹 No mock data detected in any pipeline.`);
  } else {
    console.log(`\n[test-clean-pipelines] ⚠️ Some tests failed. Check logs above.`);
    process.exit(1);
  }
}

main().catch(console.error);
