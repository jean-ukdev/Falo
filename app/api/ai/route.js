// Um único endpoint que faz tudo: conversa + correção, falar (TTS) e transcrever voz (Whisper).
// A chave da OpenAI fica só aqui no servidor — o navegador nunca a vê.

export const runtime = "nodejs";

export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "OPENAI_API_KEY ausente. Adicione nas Environment Variables da Vercel." },
      { status: 500 }
    );
  }

  const contentType = req.headers.get("content-type") || "";

  // ---- 1) Áudio gravado no navegador -> Whisper (transcrição) ----
  if (contentType.includes("multipart/form-data")) {
    let form;
    try { form = await req.formData(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
    const file = form.get("audio");
    if (!file) return Response.json({ error: "missing_audio" }, { status: 400 });
    try {
      const fd = new FormData();
      fd.append("file", file, "speech.webm");
      fd.append("model", "whisper-1");
      fd.append("language", "en"); // prática de inglês; remova para detectar automaticamente
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!r.ok) return Response.json({ error: "whisper_error", detail: await r.text() }, { status: 502 });
      const data = await r.json();
      return Response.json({ text: data.text || "" });
    } catch (e) {
      return Response.json({ error: "network_error" }, { status: 502 });
    }
  }

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }

  // ---- 2) Falar -> OpenAI TTS (áudio MP3, funciona em qualquer navegador) ----
  if (body.action === "tts") {
    if (!body.text) return new Response("missing_text", { status: 400 });
    try {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "tts-1", voice: body.voice || "nova", input: body.text, response_format: "mp3" }),
      });
      if (!r.ok) return new Response(await r.text(), { status: 502 });
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response("network_error", { status: 502 });
    }
  }

  // ---- 3) Padrão: chat (tutor) ou role-play (simulações) ----
  const { mode = "tutor", messages = [], level = "B1", goal = "Conversação", scenarioRole = "", opener = "" } = body;

  let system;
  let useJson = false;
  if (mode === "role") {
    system =
      `You are role-playing as ${scenarioRole}. Stay fully in character and never break character or mention being an AI. ` +
      `The user is a Brazilian practicing conversational English (CEFR level ${level}), so speak naturally but keep it understandable. ` +
      `You already greeted them with: "${opener}". Reply in English only, 1-3 sentences, and always move the scene forward with a question or prompt that invites the user to respond.`;
  } else {
    useJson = true;
    system =
      `You are Lumi, a warm, upbeat, patient English tutor for Brazilian learners. ` +
      `The student's CEFR level is ${level} and their goal is "${goal}". Adapt your English to their level. ` +
      `Keep replies short (1-3 sentences), natural, and always end with a friendly follow-up question.\n` +
      `Reply with ONLY a JSON object with this exact shape:\n` +
      `{"reply":"your English reply","translation":"a natural Brazilian Portuguese translation of reply",` +
      `"correction":{"hasError":true or false,"original":"the student's sentence if it had an error else empty",` +
      `"corrected":"the corrected sentence else empty",` +
      `"explanation":"a short, friendly explanation in Brazilian Portuguese of the mistake else empty"}}\n` +
      `Only flag real, meaningful errors (grammar, word choice, verb tense). Ignore capitalization and punctuation. ` +
      `If the message is fine, set hasError to false.`;
  }

  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.7,
    max_tokens: 600,
  };
  if (useJson) payload.response_format = { type: "json_object" };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return Response.json({ error: "openai_error", detail: await r.text() }, { status: 502 });
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    if (mode === "role") return Response.json({ reply: content.trim() });
    try { return Response.json(JSON.parse(content)); }
    catch { return Response.json({ reply: content.trim(), translation: "", correction: { hasError: false } }); }
  } catch (e) {
    return Response.json({ error: "network_error" }, { status: 502 });
  }
}
