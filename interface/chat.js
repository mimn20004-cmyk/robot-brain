// ============================================================
//  CHAT.JS — واجهة المحادثة في الـ Terminal
//  بتتكلم مع الروبوت مباشرة من الـ command line
// ============================================================

import readline from "readline";
import { BrainEngine } from "../core/model.js";

// ── ألوان للـ terminal ─────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  red:    "\x1b[31m",
  white:  "\x1b[37m",
};

function print(text) { process.stdout.write(text); }
function println(text = "") { console.log(text); }

// ── واجهة الـ terminal ─────────────────────────────────────
const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

const ask = (prompt) =>
  new Promise((resolve) => rl.question(prompt, resolve));

// ── شاشة الترحيب ──────────────────────────────────────────
function showWelcome() {
  println();
  println(`${C.cyan}${C.bold}╔════════════════════════════════════════╗${C.reset}`);
  println(`${C.cyan}${C.bold}║          🤖  ARIA  Brain v0.1          ║${C.reset}`);
  println(`${C.cyan}${C.bold}║     عقل مبني من الصفر بـ Node.js      ║${C.reset}`);
  println(`${C.cyan}${C.bold}╚════════════════════════════════════════╝${C.reset}`);
  println();
  println(`${C.dim}الأوامر الخاصة:${C.reset}`);
  println(`${C.yellow}  !علّم <معلومة>${C.reset}  — علّم الروبوت معلومة جديدة`);
  println(`${C.yellow}  !احفظ${C.reset}          — احفظ آخر محادثة في الذاكرة`);
  println(`${C.yellow}  !ذاكرة${C.reset}         — اعرض إحصائيات الذاكرة`);
  println(`${C.yellow}  !امسح${C.reset}          — امسح كل الذاكرة`);
  println(`${C.yellow}  !خروج${C.reset}          — أغلق البرنامج`);
  println();
}

// ── البرنامج الرئيسي ──────────────────────────────────────
async function main() {
  showWelcome();

  const brain = new BrainEngine();

  // تهيئة الموديل
  try {
    await brain.init("llama-3.1-8b-q4");
  } catch (err) {
    println(`\n${C.red}❌ فشل تحميل الموديل${C.reset}`);
    println(`${C.dim}شغّل: node setup.js لتحميل الموديل أولاً${C.reset}\n`);
    rl.close();
    return;
  }

  println(`${C.green}✅ ARIA جاهزة للمحادثة!${C.reset}`);
  println(`${C.dim}─────────────────────────────────────────${C.reset}\n`);

  let lastResponse = "";
  let rememberNext = false;

  // ── حلقة المحادثة ─────────────────────────────────────────
  while (true) {
    const userInput = await ask(`${C.bold}${C.blue}أنت:${C.reset} `);
    const input = userInput.trim();

    if (!input) continue;

    // ── أوامر خاصة ────────────────────────────────────────
    if (input.startsWith("!")) {

      // تعليم معلومة جديدة
      if (input.startsWith("!علّم ") || input.startsWith("!علم ")) {
        const fact = input.replace(/^!علّم |^!علم /, "").trim();
        if (fact) {
          brain.teach(fact);
          println(`\n${C.green}✅ تم الحفظ: "${fact}"${C.reset}\n`);
        }
        continue;
      }

      // احفظ آخر محادثة
      if (input === "!احفظ") {
        rememberNext = true;
        println(`\n${C.yellow}📌 المحادثة القادمة ستُحفظ في الذاكرة الطويلة${C.reset}\n`);
        continue;
      }

      // إحصائيات الذاكرة
      if (input === "!ذاكرة") {
        const stats = brain.stats();
        println(`\n${C.cyan}📊 إحصائيات الذاكرة:${C.reset}`);
        println(`   ذكريات محفوظة: ${C.bold}${stats.memory.memories}${C.reset}`);
        println(`   سجل المحادثات: ${C.bold}${stats.memory.conversations}${C.reset}`);
        println(`   حجم القاموس:   ${C.bold}${stats.memory.vocabulary} كلمة${C.reset}\n`);
        continue;
      }

      // مسح الذاكرة
      if (input === "!امسح") {
        const confirm = await ask(`${C.red}هل أنت متأكد؟ (نعم/لا): ${C.reset}`);
        if (confirm.trim() === "نعم") {
          brain.memory.clear();
          println(`${C.red}🗑️ تم مسح الذاكرة${C.reset}\n`);
        } else {
          println(`${C.dim}تم الإلغاء${C.reset}\n`);
        }
        continue;
      }

      // خروج
      if (input === "!خروج" || input === "!exit") {
        println(`\n${C.cyan}وداعاً! 👋${C.reset}\n`);
        rl.close();
        break;
      }

      println(`${C.red}أمر غير معروف${C.reset}\n`);
      continue;
    }

    // ── رد الروبوت بـ Streaming ────────────────────────────
    println();
    print(`${C.bold}${C.cyan}ARIA:${C.reset} `);

    try {
      lastResponse = await brain.think(input, {
        stream:       true,
        rememberThis: rememberNext,
        onToken: (token) => {
          print(`${C.white}${token}${C.reset}`);
        },
      });

      println("\n");
      rememberNext = false;

    } catch (err) {
      println(`\n${C.red}❌ خطأ: ${err.message}${C.reset}\n`);
    }
  }
}

main().catch(console.error);