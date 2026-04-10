// ============================================================
//  SERVER.JS — الباك اند
//  Express server بيربط الـ Frontend بالـ AI Engine
// ============================================================

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { BrainEngine } from "./core/model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── تهيئة الـ AI ───────────────────────────────────────────
const brain = new BrainEngine();
let aiReady = false;

console.log("\n🚀 بدء تشغيل ARIA Server...");

brain.init("llama-3.1-8b-q4")
  .then(() => {
    aiReady = true;
    console.log("✅ AI جاهز على http://localhost:" + PORT);
  })
  .catch(err => {
    console.error("❌ فشل تحميل الـ AI:", err.message);
  });

// ============================================================
//  API Routes
// ============================================================

// ── GET /api/status — حالة الـ AI ─────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    ready:  aiReady,
    stats:  aiReady ? brain.stats() : null,
    name:   "ARIA",
    version:"0.1.0",
  });
});

// ── POST /api/chat — إرسال رسالة والرد عليها (Streaming) ──
app.post("/api/chat", async (req, res) => {
  if (!aiReady) {
    return res.status(503).json({ error: "AI لم يتهيأ بعد، انتظر قليلاً..." });
  }

  const { message, remember = false } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: "الرسالة فارغة" });
  }

  // Streaming response بـ SSE
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  try {
    await brain.think(message, {
      stream:       true,
      rememberThis: remember,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── POST /api/teach — علّم الـ AI معلومة جديدة ────────────
app.post("/api/teach", (req, res) => {
  if (!aiReady) return res.status(503).json({ error: "AI غير جاهز" });

  const { fact, metadata = {} } = req.body;
  if (!fact?.trim()) return res.status(400).json({ error: "المعلومة فارغة" });

  const memory = brain.teach(fact, metadata);
  res.json({ success: true, memory });
});

// ── GET /api/memory — إحصائيات الذاكرة ───────────────────
app.get("/api/memory", (req, res) => {
  if (!aiReady) return res.status(503).json({ error: "AI غير جاهز" });
  res.json(brain.stats());
});

// ── DELETE /api/memory — مسح الذاكرة ─────────────────────
app.delete("/api/memory", (req, res) => {
  if (!aiReady) return res.status(503).json({ error: "AI غير جاهز" });
  brain.memory.clear();
  res.json({ success: true });
});

// ── POST /api/search — بحث في الذاكرة ────────────────────
app.post("/api/search", (req, res) => {
  if (!aiReady) return res.status(503).json({ error: "AI غير جاهز" });
  const { query, topK = 3 } = req.body;
  const results = brain.memory.search(query, topK);
  res.json({ results });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌐 الموقع على: http://localhost:${PORT}\n`);
});