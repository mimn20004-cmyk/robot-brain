// ============================================================
//  MODEL.JS — محرك الذكاء الاصطناعي
//  بيشغّل الـ LLM جوه Node.js مباشرة بـ node-llama-cpp
// ============================================================

import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { buildSystemPrompt } from "./identity.js";
import { MemoryStore } from "./memory.js";
import path from "path";
import fs from "fs";

const MODEL_DIR = "./models";

// ── النماذج المدعومة مع توصية لجهازك ─────────────────────
export const RECOMMENDED_MODELS = {
  // الأفضل لجهازك (56GB RAM)
  "llama-3.1-8b-q4": {
    filename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    size: "4.9GB",
    quality: "ممتاز",
    ramNeeded: "8GB",
  },
  // أصغر للتجربة السريعة
  "llama-3.2-3b-q4": {
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    size: "2.0GB",
    quality: "كويس",
    ramNeeded: "4GB",
  },
};

// ============================================================
//  BrainEngine — المحرك الرئيسي
// ============================================================
export class BrainEngine {
  constructor() {
    this.llama   = null;
    this.model   = null;
    this.context = null;
    this.session = null;
    this.memory  = new MemoryStore();
    this.ready   = false;
  }

  // ── تهيئة المحرك وتحميل الموديل ──────────────────────────
  async init(modelName = "llama-3.1-8b-q4") {
    console.log("\n🔧 تهيئة العقل...\n");

    const modelInfo = RECOMMENDED_MODELS[modelName];
    if (!modelInfo) throw new Error(`موديل غير معروف: ${modelName}`);

    const modelPath = path.join(MODEL_DIR, modelInfo.filename);

    // تحقق إن الموديل موجود
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ الموديل مش موجود: ${modelPath}`);
      console.log(`\n📥 لتحميله، شغّل:\n`);
      console.log(`   node setup.js\n`);
      console.log(`   أو حمّله يدوياً من:\n   ${modelInfo.url}\n`);
      process.exit(1);
    }

    try {
      console.log(`📦 تحميل: ${modelInfo.filename}`);

      // تهيئة llama مع إعدادات محسّنة لجهازك
      this.llama = await getLlama({
        // gpu: "auto" — بيستخدم RTX 1050 لو أمكن، CPU لو لأ
        gpu: "auto",
      });

      // تحميل الموديل
      this.model = await this.llama.loadModel({
        modelPath,
        // نستخدم الـ GPU للـ layers اللي تناسب الـ 4GB VRAM
        // الباقي بيشتغل على الـ RAM
        gpuLayers: 0,
      });

      // إنشاء الـ context (الذاكرة القصيرة للمحادثة)
      this.context = await this.model.createContext({
        contextSize: 2048, // 4K tokens كافية
      });

      this.ready = true;
      console.log("✅ العقل جاهز!\n");

      // إظهار إحصائيات الذاكرة
      const stats = this.memory.stats();
      console.log(`📊 الذاكرة: ${stats.memories} ذكرى | ${stats.conversations} رسالة | ${stats.vocabulary} كلمة في القاموس\n`);

    } catch (err) {
      console.error("❌ خطأ في تحميل الموديل:", err.message);
      throw err;
    }
  }

  // ── الدالة الرئيسية: بعتلي سؤال، ارد عليه ────────────────
  async think(userMessage, options = {}) {
    if (!this.ready) throw new Error("العقل لم يتهيأ بعد — استدعِ init() أولاً");

    const {
      stream        = true,   // اطبع الرد وهو بيتولد
      rememberThis  = false,  // احفظ الإجابة في الذاكرة الطويلة
      onToken       = null,   // callback لكل token
    } = options;

    // 1. ابحث في الذاكرة عن معلومات ذات صلة
    const relevantMemories = this.memory.search(userMessage, 3);
    const memoryContext = relevantMemories.length > 0
      ? relevantMemories.map(m => `- ${m.text} (صلة: ${(m.score * 100).toFixed(0)}%)`).join("\n")
      : "";

    // 2. ابني الـ System Prompt مع الذاكرة
    const systemPrompt = buildSystemPrompt(memoryContext);

    // 3. احضر آخر المحادثات للسياق
    const recentConvos = this.memory.getRecentConversations(6);

    // 4. أنشئ session جديد مع الـ system prompt
    this.session = new LlamaChatSession({
      contextSequence: await this.context.getSequence(),
      systemPrompt,
    });

    // أعد تشغيل المحادثة السابقة في الـ session
    for (const msg of recentConvos) {
      if (msg.role === "user") {
        await this.session.prompt(msg.content, { maxTokens: 1 });
      }
    }

    // 5. احفظ رسالة المستخدم
    this.memory.saveConversation("user", userMessage);

    // 6. ولّد الرد
    let fullResponse = "";

    if (stream && onToken) {
      // Streaming mode — بيطبع token بـ token
      fullResponse = await this.session.prompt(userMessage, {
        maxTokens: 512,
        temperature: 0.7,
        topP: 0.9,
        onToken: (tokens) => {
          const text = this.model.detokenize(tokens);
          fullResponse += text;
          onToken(text);
        },
      });
    } else {
      // Normal mode — بيرجع الرد كامل
      fullResponse = await this.session.prompt(userMessage, {
        maxTokens: 512,
        temperature: 0.7,
        topP: 0.9,
      });
    }

    // 7. احفظ رد الروبوت في الذاكرة
    this.memory.saveConversation("assistant", fullResponse);

    // 8. لو طُلب الحفظ، احفظ في الذاكرة الطويلة
    if (rememberThis) {
      this.memory.remember(
        `[مستخدم]: ${userMessage}\n[ARIA]: ${fullResponse}`,
        { type: "conversation", importance: 2 }
      );
    }

    return fullResponse;
  }

  // ── علّم الروبوت معلومة جديدة ─────────────────────────────
  teach(fact, metadata = {}) {
    return this.memory.remember(fact, { type: "knowledge", importance: 3, ...metadata });
  }

  // ── إحصائيات ──────────────────────────────────────────────
  stats() {
    return {
      ready:  this.ready,
      memory: this.memory.stats(),
    };
  }
}