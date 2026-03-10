const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static(__dirname)); // <--- AQUÍ VA LA LÍNEA NUEVA

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

    if (!userMessage) {
      return res.json({
        reply: "Please write a message."
      });
    }

    const completion = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
You are an English speaking tutor for students learning English.

Rules:
- Always answer in English
- Correct pronunciation and grammar naturally
- Encourage the student to repeat sentences
- Keep answers short
- Ask a follow-up question

If the student writes in Spanish, respond in English anyway.
`
        },
        { role: "user", content: userMessage }
      ],
      max_tokens: 120
    });

   const aiReply = completion?.choices?.[0]?.message?.content;

if(!aiReply){
    return res.json({
        reply: "Sorry, I couldn't generate a response. Please try again."
    });
}

res.json({
    reply: aiReply
});

  } catch (error) {

    console.error("ERROR GROQ:", error);

    res.status(500).json({
      error: "Algo salió mal"
    });

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

   const response = await axios.post(
  "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        text: text,
        model_id: "eleven_turbo_v2"
      },
      {
        headers: {
  "xi-api-key": process.env.ELEVEN_API_KEY,
  "Content-Type": "application/json"
},
        responseType: "arraybuffer"
      }
    );

    const audioBuffer = response.data;

    res.set({
      "Content-Type": "audio/mpeg"
    });

    res.send(audioBuffer);

  } catch (error) {

    console.log("Error en voz IA:", error.response?.data?.toString());

    res.status(500).send("Error del servidor");

  }

});


// INICIAR SERVIDOR
app.listen(port, () => {
  console.log("Servidor activo en http://localhost:3000");

});










