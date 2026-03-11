const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const axios = require("axios");

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.text || "";
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const context = req.body.context || {};

    if (!userMessage) {
      return res.json({ reply: "Please write a message." });
    }

    let systemPrompt = `You are an English speaking tutor for students at American Business School (ABS).

Rules:
- Always answer in English
- Correct pronunciation and grammar naturally
- Encourage the student to repeat sentences
- Keep answers short and focused
- Ask one follow-up question to keep the conversation going
- Be warm, encouraging and professional

If the student writes in Spanish, respond in English but briefly acknowledge their Spanish.`;

    if (context.modulo || context.tema) {
      systemPrompt += `\n\nCurrent context: Module ${context.modulo || "unknown"}, Topic: ${context.tema || "general"}.`;
    }

    const messages = [{ role: "system", content: systemPrompt }];

    const validHistory = history
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-10);

    messages.push(...validHistory);
    messages.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages,
      max_tokens: 150
    });

    const aiReply = completion?.choices?.[0]?.message?.content;

    if (!aiReply) {
      return res.json({ reply: "Sorry, I couldn't generate a response. Please try again." });
    }

    res.json({ reply: aiReply });

  } catch (error) {
    console.error("ERROR GROQ:", error.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index_abs_pro_version.html");
});


// ===============================
// VOZ IA (ELEVENLABS)
// ===============================

app.post("/api/voice", async (req, res) => {
  try {
    const text = req.body.text;

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "No text provided" });
    }

    // Limpiar texto: solo caracteres ASCII para ElevenLabs
    const textoLimpio = text
      .replace(/[^\x00-\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 400);

    if (!textoLimpio) {
      return res.status(400).json({ error: "Text empty after cleaning" });
    }

    console.log(`[ElevenLabs] Requesting TTS for: "${textoLimpio.substring(0, 60)}..."`);

    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        text: textoLimpio,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        responseType: "arraybuffer",
        timeout: 15000  // 15 segundos max
      }
    );

    if (!response.data || response.data.byteLength === 0) {
      throw new Error("ElevenLabs returned empty audio");
    }

    console.log(`[ElevenLabs] Audio OK - ${response.data.byteLength} bytes`);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.data.byteLength,
      "Cache-Control": "no-cache"
    });

    res.send(Buffer.from(response.data));

  } catch (error) {
    // Log detallado para debugging
    if (error.response) {
      const errMsg = Buffer.from(error.response.data).toString("utf-8");
      console.error("[ElevenLabs ERROR]", error.response.status, errMsg);
      res.status(error.response.status).json({
        error: "ElevenLabs error",
        status: error.response.status,
        detail: errMsg
      });
    } else {
      console.error("[ElevenLabs ERROR]", error.message);
      res.status(500).json({ error: error.message });
    }
  }
});


// INICIAR SERVIDOR
app.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
  console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "✅ configurada" : "❌ FALTA"}`);
  console.log(`ELEVEN_API_KEY: ${process.env.ELEVEN_API_KEY ? "✅ configurada" : "❌ FALTA"}`);
});
