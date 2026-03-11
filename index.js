const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// ===============================
// BASE DE DATOS (archivo JSON)
// ===============================

const DB_PATH = path.join(__dirname, "usuarios.json");

function leerDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}), "utf-8");
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    } catch {
        return {};
    }
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function generarToken() {
    return crypto.randomBytes(32).toString("hex");
}

// Normaliza el nombre como clave única
function claveNombre(nombre) {
    return nombre.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
}


// ===============================
// CHAT IA (GROQ)
// ===============================

const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

app.post("/api/chat", async (req, res) => {
    try {
        const userMessage = req.body.message || req.body.text || "";
        const history = Array.isArray(req.body.history) ? req.body.history : [];
        const context = req.body.context || {};

        if (!userMessage) return res.json({ reply: "Please write a message." });

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
        const validHistory = history.filter(m => m.role === "user" || m.role === "assistant").slice(-10);
        messages.push(...validHistory);
        messages.push({ role: "user", content: userMessage });

        const completion = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages,
            max_tokens: 150
        });

        const aiReply = completion?.choices?.[0]?.message?.content;
        if (!aiReply) return res.json({ reply: "Sorry, I couldn't generate a response. Please try again." });

        res.json({ reply: aiReply });

    } catch (error) {
        console.error("ERROR GROQ:", error.message);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});


// ===============================
// AUTH — LOGIN / REGISTRO
// ===============================

app.post("/api/login", (req, res) => {
    const { nombre, password } = req.body;

    if (!nombre || !password) {
        return res.status(400).json({ error: "Nombre y contraseña son requeridos." });
    }

    const palabras = nombre.trim().split(/\s+/).filter(p => p.length > 0);
    if (palabras.length < 2) {
        return res.status(400).json({ error: "Ingresa tu nombre completo (nombres y apellidos)." });
    }

    if (password.length < 4) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres." });
    }

    const db = leerDB();
    const clave = claveNombre(nombre);
    const passHash = hashPassword(password);

    if (db[clave]) {
        // Usuario existente — verificar contraseña
        if (db[clave].passwordHash !== passHash) {
            return res.status(401).json({ error: "Contraseña incorrecta. Intenta de nuevo." });
        }

        // Generar nuevo token de sesión
        const token = generarToken();
        db[clave].token = token;
        db[clave].ultimoAcceso = new Date().toISOString();
        guardarDB(db);

        console.log(`✅ Login: ${nombre}`);
        return res.json({
            nombre: db[clave].nombre,
            token,
            completados: db[clave].completados || [],
            esNuevo: false
        });

    } else {
        // Usuario nuevo — crear cuenta
        const token = generarToken();
        db[clave] = {
            nombre: nombre.trim(),
            passwordHash: passHash,
            token,
            completados: [],
            creadoEn: new Date().toISOString(),
            ultimoAcceso: new Date().toISOString()
        };
        guardarDB(db);

        console.log(`🆕 Nuevo usuario: ${nombre}`);
        return res.json({
            nombre: nombre.trim(),
            token,
            completados: [],
            esNuevo: true
        });
    }
});


// ===============================
// AUTH — VALIDAR SESIÓN (auto-login)
// ===============================

app.post("/api/session", (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token requerido." });

    const db = leerDB();
    const usuario = Object.values(db).find(u => u.token === token);

    if (!usuario) {
        return res.status(401).json({ error: "Sesión expirada. Ingresa de nuevo." });
    }

    // Renovar último acceso
    const clave = claveNombre(usuario.nombre);
    db[clave].ultimoAcceso = new Date().toISOString();
    guardarDB(db);

    res.json({
        nombre: usuario.nombre,
        completados: usuario.completados || []
    });
});


// ===============================
// PROGRESO — GUARDAR
// ===============================

app.post("/api/progreso", (req, res) => {
    const { token, completados } = req.body;
    if (!token) return res.status(400).json({ error: "Token requerido." });

    const db = leerDB();
    const clave = Object.keys(db).find(k => db[k].token === token);

    if (!clave) return res.status(401).json({ error: "Sesión inválida." });

    db[clave].completados = Array.isArray(completados) ? completados : [];
    db[clave].ultimoAcceso = new Date().toISOString();
    guardarDB(db);

    res.json({ ok: true });
});


// ===============================
// PROGRESO — RESET
// ===============================

app.post("/api/progreso/reset", (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token requerido." });

    const db = leerDB();
    const clave = Object.keys(db).find(k => db[k].token === token);

    if (!clave) return res.status(401).json({ error: "Sesión inválida." });

    db[clave].completados = [];
    guardarDB(db);

    res.json({ ok: true });
});


// ===============================
// VOZ IA (ELEVENLABS)
// ===============================

app.post("/api/voice", async (req, res) => {
    try {
        let text = req.body.text;
        if (!text || text.trim() === "") return res.status(400).json({ error: "No text provided" });

        const textoLimpio = text
            .replace(/[^\x00-\x7F]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 400);

        if (!textoLimpio) return res.status(400).json({ error: "Text empty after cleaning" });

        console.log(`[ElevenLabs] Requesting TTS: "${textoLimpio.substring(0, 60)}..."`);

        const response = await axios.post(
            "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
            {
                text: textoLimpio,
                model_id: "eleven_turbo_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            {
                headers: {
                    "xi-api-key": process.env.ELEVEN_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg"
                },
                responseType: "arraybuffer",
                timeout: 15000
            }
        );

        if (!response.data || response.data.byteLength === 0) throw new Error("Empty audio");

        res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": response.data.byteLength,
            "Cache-Control": "no-cache"
        });
        res.send(Buffer.from(response.data));

    } catch (error) {
        const errMsg = error.response?.data ? Buffer.from(error.response.data).toString("utf-8") : error.message;
        console.error("[ElevenLabs ERROR]", errMsg);
        res.status(500).json({ error: error.message });
    }
});


// ===============================
// SERVIR HTML
// ===============================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index_abs_pro_version.html");
});


// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(port, () => {
    console.log(`✅ Servidor activo en http://localhost:${port}`);
    console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "✅" : "❌ FALTA"}`);
    console.log(`ELEVEN_API_KEY: ${process.env.ELEVEN_API_KEY ? "✅" : "❌ FALTA"}`);
    // Crear DB si no existe
    leerDB();
    console.log(`Base de datos: ${DB_PATH}`);
});
