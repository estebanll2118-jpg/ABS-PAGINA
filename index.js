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
    const userMessage = req.body.message;

    const completion = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
You are ABS Assistant, the official AI tutor of American Business School Pereira.
You help students practice English speaking.
Keep answers short and natural.
Always ask a follow-up question to continue the conversation.
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

app.listen(port, () => {
  console.log("Servidor activo en http://localhost:3000");
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

    const response = await fetch(
  "https://api.elevenlabs.io/v1/text-to-speech/ErXwobaYiN019PkySvjV",
  {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVEN_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_turbo_v2"
    })
  }
);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Error ElevenLabs:", errorText);
      return res.status(500).send("Error con ElevenLabs");
    }

    const audioBuffer = await response.arrayBuffer();

    res.set({
      "Content-Type": "audio/mpeg"
    });

    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error("Error en voz IA:", error);
    res.status(500).send("Error del servidor");
  }

});


// INICIAR SERVIDOR
app.listen(port, () => {
  console.log("Servidor activo en http://localhost:3000");
});