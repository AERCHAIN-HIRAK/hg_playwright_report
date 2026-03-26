import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import axios from "axios";

// 👇 Slack Webhook
const WEBHOOK_URL = process.env.SLACK_WEBHOOK;

export async function sendReport() {

  console.log("📧 sendReport function started...");

  try {
    const resultsPath = path.resolve("test-results/results.json");
    const rawData = fs.readFileSync(resultsPath, "utf-8");
    const report = JSON.parse(rawData);

    let total = 0;
    let passed = 0;
    let failed = 0;

    let failedTests = [];

    // ✅ FIXED LOGIC (Playwright result parsing)
    report.suites.forEach(suite => {
      suite.specs.forEach(spec => {
        spec.tests.forEach(test => {

          const result = test.results[test.results.length - 1]; // ✅ latest result

          total++;

          if (result.status === "passed") {
            passed++;
          } else {
            failed++;
            failedTests.push(spec.title);
          }

        });
      });
    });

    const summary = `Total: ${total} | Passed: ${passed} | Failed: ${failed}`;
    const date = new Date().toLocaleString();

    // ================= EMAIL =================
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "hirak.goswami@aerchain.io",
        pass: "azncqrbbxxkfbjiz",
      },
    });

    const reportPath = path.resolve("playwright-report/index.html");

    await transporter.sendMail({
      from: "hirak.goswami@aerchain.io",
      to: "mohammed.hammad@aerchain.io",
      subject: "Playwright Test Report",
      text: `Automation execution completed.\n\n${summary}`,
      attachments: [
        {
          filename: "PlaywrightReport.html",
          path: reportPath,
        },
      ],
    });

    console.log("✅ Email sent successfully");

    // ================= SLACK =================

    const reportUrl = "https://aerchain-hirak.github.io/hg_playwright_report/";

    const user1 = "<@U026PKJJHC6>";

    // ✅ Format failed tests
    let failedText = "";
    if (failedTests.length > 0) {
      failedText = failedTests
        .map((test, index) => `Test Case ${index + 1} - ${test}`)
        .join("\n");
    }

    const slackMessage = {
      text: `
🚀 *Playwright Automation Report*

${user1} 

📅 *Execution Time:* ${date}

📊 *Summary:*
• Total: ${total}
• Passed: ${passed} ✅
• Failed: ${failed} ❌

${failedText ? `\n❌ *Failed Test Cases:*\n${failedText}\n` : ""}

🔗 *View Report:* ${reportUrl}
`
    };

    await axios.post(WEBHOOK_URL, slackMessage);

    console.log("✅ Slack message sent");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// 🔥 REQUIRED
sendReport();