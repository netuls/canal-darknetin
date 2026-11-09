// Função do Vercel: gera uma imagem vertical (9:16) a partir de um texto.
// 1º tenta o Gemini (usa a mesma GEMINI_API_KEY); se falhar, tenta o Pollinations (sem chave).
const MODELO_IMG = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const ESTILO = " Cinematic, dark and moody atmosphere, realistic photo style, dramatic lighting, vertical 9:16 composition, no text, no letters, no watermark, no recognizable real people.";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });
  const prompt = String((req.body || {}).prompt || "").trim().slice(0, 600);
  if (!prompt) return res.status(400).json({ erro: "prompt vazio" });
  const falhas = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_IMG}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + ESTILO }] }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } } })
      });
      if (r.ok) {
        const d = await r.json();
        const p = (d.candidates?.[0]?.content?.parts || []).find(x => x.inlineData || x.inline_data);
        const i = p && (p.inlineData || p.inline_data);
        if (i) { res.setHeader("Content-Type", i.mimeType || i.mime_type || "image/png"); res.setHeader("x-fonte", "gemini"); return res.status(200).send(Buffer.from(i.data, "base64")); }
        falhas.push("gemini: sem imagem na resposta");
      } else { console.error("Gemini img", r.status, await r.text()); falhas.push("gemini: " + r.status); }
    } catch (e) { console.error("Gemini img", e.message); falhas.push("gemini: " + (e.name === "TimeoutError" ? "demorou" : "erro")); }
  }

  try {
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt + ESTILO) + "?width=768&height=1366&nologo=true&model=flux&seed=" + Math.floor(Math.random() * 1e6);
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const tipo = r.headers.get("content-type") || "";
    if (r.ok && tipo.startsWith("image/")) { res.setHeader("Content-Type", tipo); res.setHeader("x-fonte", "pollinations"); return res.status(200).send(Buffer.from(await r.arrayBuffer())); }
    falhas.push("pollinations: " + r.status);
  } catch (e) { falhas.push("pollinations: " + (e.name === "TimeoutError" ? "demorou" : "erro")); }

  res.status(502).json({ erro: "não consegui gerar a imagem (" + falhas.join(" | ") + ")" });
};
