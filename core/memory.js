// ============================================================
//  MEMORY.JS — قاعدة البيانات الشعاعية (Vector Database)
//  مبنية من الصفر بدون أي مكتبة خارجية
//
//  كيف تشتغل؟
//  ─────────────────────────────────────────────────────────
//  كل "ذكرى" بتتحول لـ vector (مصفوفة أرقام تمثّل معناها)
//  لما بتسأل، بنحوّل سؤالك لـ vector ونشوف أقرب ذكريات
//  "القُرب" بنحسبه بـ Cosine Similarity
// ============================================================

import fs from "fs";
import path from "path";

const MEMORY_FILE = "./data/vectors/memory.json";
const CONVO_FILE  = "./data/vectors/conversations.json";

// ── مساعد: تأكد إن الملفات موجودة ────────────────────────
function ensureFiles() {
  const dir = "./data/vectors";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, "[]");
  if (!fs.existsSync(CONVO_FILE))  fs.writeFileSync(CONVO_FILE,  "[]");
}

// ============================================================
//  TF-IDF Vectorizer — بنحوّل النص لأرقام بدون ML
//  ─────────────────────────────────────────────────────────
//  TF  = كم مرة ظهرت الكلمة في الجملة دي
//  IDF = كم الكلمة نادرة في كل الذاكرة (نادرة = أهم)
// ============================================================
class TFIDFVectorizer {
  constructor() {
    this.vocabulary = new Map(); // كلمة → رقم index
    this.idf = new Map();        // كلمة → قيمة IDF
    this.docCount = 0;
  }

  // تنظيف النص وتقطيعه لكلمات
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, " ") // عربي + انجليزي + أرقام
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  // بناء الـ vocabulary من كل الذكريات
  fit(documents) {
    this.docCount = documents.length;
    const docFreq = new Map();

    documents.forEach(doc => {
      const tokens = new Set(this.tokenize(doc));
      tokens.forEach(token => {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      });
    });

    // احسب IDF لكل كلمة
    docFreq.forEach((freq, token) => {
      this.idf.set(token, Math.log((this.docCount + 1) / (freq + 1)) + 1);
    });
  }

  // حوّل جملة لـ vector
  transform(text) {
    const tokens = this.tokenize(text);
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

    const vector = new Array(this.vocabulary.size).fill(0);
    tf.forEach((count, token) => {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        const tfScore  = count / tokens.length;
        const idfScore = this.idf.get(token) || 1;
        vector[idx] = tfScore * idfScore;
      }
    });

    return this.normalize(vector);
  }

  // Normalize عشان Cosine Similarity يشتغل صح
  normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }
}

// ============================================================
//  Cosine Similarity — بنحسب القُرب بين vectorين
//  النتيجة بين 0 و 1 — كلما كانت أقرب لـ 1 كلما كانوا متشابهين
// ============================================================
function cosineSimilarity(vecA, vecB) {
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += vecA[i] * vecB[i];
  return dot; // already normalized
}

// ============================================================
//  MemoryStore — قاعدة الذاكرة الكاملة
// ============================================================
export class MemoryStore {
  constructor() {
    ensureFiles();
    this.memories      = [];   // الذكريات الطويلة الأمد
    this.conversations = [];   // سجل المحادثات
    this.vectorizer    = new TFIDFVectorizer();
    this.load();
  }

  // ── تحميل من الملف ────────────────────────────────────────
  load() {
    try {
      this.memories      = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      this.conversations = JSON.parse(fs.readFileSync(CONVO_FILE,  "utf8"));

      // أعد بناء الـ vectorizer من الذكريات المحفوظة
      if (this.memories.length > 0) {
        this.vectorizer.fit(this.memories.map(m => m.text));
        this.memories.forEach(m => {
          m.vector = this.vectorizer.transform(m.text);
        });
      }

      console.log(`🧠 تم تحميل ${this.memories.length} ذكرى و ${this.conversations.length} محادثة`);
    } catch {
      console.log("🧠 ذاكرة جديدة — لا توجد بيانات سابقة");
    }
  }

  // ── حفظ للملف ─────────────────────────────────────────────
  save() {
    // احفظ بدون الـ vectors (بنعيد بناءها عند التحميل)
    const toSave = this.memories.map(({ vector, ...rest }) => rest);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(toSave, null, 2));
    fs.writeFileSync(CONVO_FILE,  JSON.stringify(this.conversations, null, 2));
  }

  // ── إضافة ذكرى جديدة ──────────────────────────────────────
  remember(text, metadata = {}) {
    const memory = {
      id:        Date.now(),
      text,
      metadata:  { ...metadata, timestamp: new Date().toISOString() },
      importance: metadata.importance || 1,
    };

    this.memories.push(memory);

    // أعد بناء الـ vectorizer مع الذكرى الجديدة
    this.vectorizer.fit(this.memories.map(m => m.text));
    this.memories.forEach(m => {
      m.vector = this.vectorizer.transform(m.text);
    });

    this.save();
    console.log(`💾 تم حفظ: "${text.substring(0, 50)}..."`);
    return memory;
  }

  // ── البحث عن أقرب الذكريات للسؤال ────────────────────────
  search(query, topK = 3) {
    if (this.memories.length === 0) return [];

    const queryVector = this.vectorizer.transform(query);

    const scored = this.memories
      .map(memory => ({
        ...memory,
        score: cosineSimilarity(queryVector, memory.vector || []),
      }))
      .filter(m => m.score > 0.05) // فلتر الذكريات غير ذات الصلة
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  // ── حفظ محادثة ────────────────────────────────────────────
  saveConversation(role, content) {
    this.conversations.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // احتفظ بآخر 50 رسالة بس في الذاكرة
    if (this.conversations.length > 50) {
      this.conversations = this.conversations.slice(-50);
    }

    this.save();
  }

  // ── آخر N رسائل للسياق ────────────────────────────────────
  getRecentConversations(n = 6) {
    return this.conversations.slice(-n);
  }

  // ── إحصائيات الذاكرة ──────────────────────────────────────
  stats() {
    return {
      memories:      this.memories.length,
      conversations: this.conversations.length,
      vocabulary:    this.vectorizer.vocabulary.size,
    };
  }

  // ── مسح كل الذاكرة ────────────────────────────────────────
  clear() {
    this.memories      = [];
    this.conversations = [];
    this.vectorizer    = new TFIDFVectorizer();
    this.save();
    console.log("🗑️ تم مسح الذاكرة");
  }
}