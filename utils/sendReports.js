import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const WEBHOOK_URL = process.env.SLACK_WEBHOOK;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

// Strip ANSI escape codes from Playwright error messages
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\[\d+m/g, "");
}

function cleanError(message) {
  if (!message) return "Unknown error";
  const lines = stripAnsi(message)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (lines[0] || "Unknown error").substring(0, 300);
}

async function uploadScreenshotToSlack(screenshotPath, testName, errorMsg, testNumber) {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) return false;
  if (!fs.existsSync(screenshotPath)) return false;

  const fileBuffer = fs.readFileSync(screenshotPath);
  const filename = `${testName.replace(/[^a-z0-9]/gi, "_")}.png`;
  const authHeader = { Authorization: `Bearer ${SLACK_BOT_TOKEN}` };

  // Step 1: get an upload URL
  const urlRes = await axios.get("https://slack.com/api/files.getUploadURLExternal", {
    headers: authHeader,
    params: { filename, length: fileBuffer.length },
  });
  if (!urlRes.data.ok) {
    console.error(`❌ Could not get upload URL for "${testName}":`, urlRes.data.error);
    return false;
  }
  const { upload_url, file_id } = urlRes.data;

  // Step 2: upload the file binary
  await axios.post(upload_url, fileBuffer, {
    headers: { "Content-Type": "application/octet-stream" },
  });

  // Step 3: complete the upload and post to channel
  const completeRes = await axios.post(
    "https://slack.com/api/files.completeUploadExternal",
    {
      files: [{ id: file_id, title: `❌ Test Case ${testNumber}: ${testName}` }],
      channel_id: SLACK_CHANNEL_ID,
      initial_comment: `📸 *Test Case ${testNumber}* — ${testName}\n🔍 *Error:* ${errorMsg}`,
    },
    { headers: { ...authHeader, "Content-Type": "application/json" } }
  );

  if (!completeRes.data.ok) {
    console.error(`❌ Screenshot upload failed for "${testName}":`, completeRes.data.error);
    return false;
  }
  return true;
}

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

    function parseSuites(suites) {
      suites.forEach((suite) => {
        if (suite.specs) {
          suite.specs.forEach((spec) => {
            spec.tests.forEach((test) => {
              const result = test.results[test.results.length - 1];
              total++;

              if (result.status === "passed") {
                passed++;
              } else {
                failed++;
                const screenshot = result.attachments?.find(
                  (a) => a.name === "screenshot" && a.contentType === "image/png"
                );
                failedTests.push({
                  title: spec.title,
                  error: cleanError(result.error?.message),
                  screenshotPath: screenshot?.path || null,
                  testNumber: failed,
                });
              }
            });
          });
        }

        if (suite.suites) parseSuites(suite.suites);
      });
    }

    parseSuites(report.suites);

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

    // ================= SLACK SUMMARY MESSAGE =================
    const reportUrl = "https://aerchain-hirak.github.io/hg_playwright_report/";
    const user1 = "<@U026PKJJHC6>";
    const user2 = "<@U02DHMS34G6>";
    const user3 = "<@U026BUKTDEJ>";

    const slackMessage = {
      text: `
🚀 *Playwright Automation Report*

${user1} ${user2} ${user3}

📅 *Execution Time:* ${date}

📊 *Summary:*
• Total: ${total}
• Passed: ${passed} ✅
• Failed: ${failed} ❌

🔗 *View Report:* ${reportUrl}
`,
    };

    await axios.post(WEBHOOK_URL, slackMessage);
    console.log("✅ Slack message sent");

    // ================= SCREENSHOT UPLOADS =================
    const screenshotsToUpload = failedTests.filter((t) => t.screenshotPath);

    if (screenshotsToUpload.length > 0) {
      if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID) {
        console.log(`📸 Uploading ${screenshotsToUpload.length} screenshot(s) to Slack...`);
        for (let i = 0; i < screenshotsToUpload.length; i++) {
          const test = screenshotsToUpload[i];
          const ok = await uploadScreenshotToSlack(test.screenshotPath, test.title, test.error, test.testNumber);
          if (ok) console.log(`✅ Screenshot uploaded: ${test.title}`);
        }
      } else {
        console.log(
          "ℹ️  Screenshots available but SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not set in .env — skipping upload"
        );
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

sendReport();
