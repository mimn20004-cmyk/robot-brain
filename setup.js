// ============================================================
//  SETUP.JS — بيحمّل الموديل تلقائياً
//  شغّله مرة واحدة: node setup.js
// ============================================================

import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { RECOMMENDED_MODELS } from "./core/model.js";

const MODEL_DIR = "./models";

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // تعامل مع الـ redirect
    const protocol = url.startsWith("https") ? https : http;

    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;
    let lastPrint = 0;

    const request = protocol.get(url, (res) => {

      // Redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      total = parseInt(res.headers["content-length"] || "0");
      res.pipe(file);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastPrint > 1000) {
          const pct = total ? ((downloaded / total) * 100).toFixed(1) : "?";
          const mb  = (downloaded / 1024 / 1024).toFixed(0);
          const tot = (total    / 1024 / 1024).toFixed(0);
          process.stdout.write(`\r   📥 ${mb}MB / ${tot}MB  (${pct}%)   `);
          lastPrint = now;
        }
      });

      file.on("finish", () => {
        file.close();
        console.log("\n");
        resolve();
      });
    });

    request.on("error", (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function setup() {
  console.log("\n🚀 إعداد ARIA Brain\n");

  // أنشئ مجلد الموديلات
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }
  if (!fs.existsSync("./data/vectors")) {
    fs.mkdirSync("./data/vectors", { recursive: true });
  }
  if (!fs.existsSync("./data/knowledge")) {
    fs.mkdirSync("./data/knowledge", { recursive: true });
  }

  // اختر الموديل
  console.log("اختر الموديل:\n");
  const models = Object.entries(RECOMMENDED_MODELS);
  models.forEach(([key, info], i) => {
    console.log(`  ${i + 1}. ${key}`);
    console.log(`     الحجم: ${info.size} | الجودة: ${info.quality} | RAM: ${info.ramNeeded}`);
    console.log();
  });

  const choice = process.argv[2] || "1";
  const idx = parseInt(choice) - 1;
  const [modelName, modelInfo] = models[Math.max(0, Math.min(idx, models.length - 1))];

  const destPath = path.join(MODEL_DIR, modelInfo.filename);

  // تحقق لو موجود
  if (fs.existsSync(destPath)) {
    const size = fs.statSync(destPath).size;
    console.log(`✅ الموديل موجود بالفعل (${(size / 1024 / 1024 / 1024).toFixed(2)}GB)`);
    console.log(`\n▶️  شغّل: npm run chat\n`);
    return;
  }

  console.log(`📥 تحميل: ${modelName}`);
  console.log(`   من: ${modelInfo.url}`);
  console.log(`   إلى: ${destPath}`);
  console.log(`   الحجم: ${modelInfo.size}\n`);
  console.log(`   (هيأخذ وقت حسب سرعة النت...)\n`);

  try {
    await downloadFile(modelInfo.url, destPath);
    console.log(`✅ تم التحميل بنجاح!\n`);
    console.log(`▶️  الآن شغّل: npm run chat\n`);
  } catch (err) {
    console.error(`❌ فشل التحميل: ${err.message}`);
    console.log(`\nحاول تحمّله يدوياً من:\n${modelInfo.url}`);
    console.log(`واحطّه في مجلد: ${MODEL_DIR}/\n`);
  }
}

setup().catch(console.error);