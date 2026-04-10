// ============================================================
//  INDEX.JS — نقطة الدخول الرئيسية
//  بيربط كل المكونات مع بعض
// ============================================================

import { BrainEngine } from "./core/model.js";

async function demo() {
  console.log("\n🤖 ARIA Brain — Demo\n");

  const brain = new BrainEngine();
  await brain.init();

  // علّمه معلومات
  brain.teach("اسمي محمد وأنا من القاهرة");
  brain.teach("أنا بشتغل على مشروع روبوت ذكي بـ Node.js");
  brain.teach("بطلي المفضل هو نيكولا تيسلا");

  // اسأله
  const response = await brain.think("مين أنا وإيه اللي بشتغل عليه؟");
  console.log("\nARIA:", response, "\n");
}

demo().catch(console.error);