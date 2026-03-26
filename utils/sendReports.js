import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import axios from "axios"; // ✅ ADD THIS

// 👇 Slack Webhook
const WEBHOOK_URL = process.env.SLACK_WEBHOOK

export async function sendReport() {

  console.log("📧 sendReport function started...");

  try {
    const resultsPath = path.resolve("test-results/results.json");
    const rawData = fs.readFileSync(resultsPath, "utf-8");
    const report = JSON.parse(rawData);

    let total = 0;
    let passed = 0;
    let failed = 0;

    report.suites.forEach(suite => {
      suite.specs.forEach(spec => {
        spec.tests.forEach(test => {
          total++;
          if (test.status === "expected") {
            passed++;
          } else {
            failed++;
          }
        });
      });
    });

    const summary = `Total: ${total} | Passed: ${passed} | Failed: ${failed}`;
    const date = new Date().toLocaleString(); // ✅ ADD DATE

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

    // 🔗 TEMP link (replace later with hosted URL)
    const reportUrl = "https://aerchain-hirak.github.io/hg_playwright_report/";

    // 👥 Replace with real Slack user IDs
    const user1 = "<@U026PKJJHC6>";
    // const user2 = "<@USER_ID_2>";

    const slackMessage = {
      text: `
🚀 *Playwright Automation Report*

${user1} 


📅 *Execution Time:* ${date}

📊 *Summary:*
• Total: ${total}
• Passed: ${passed} ✅
• Failed: ${failed} ❌

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