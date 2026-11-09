// Função do Vercel: gera o roteiro de um Short com IA (Google Gemini, plano gratuito).
// Variáveis de ambiente no Vercel: GEMINI_API_KEY e APP_SENHA
// Se o modelo sair do ar, veja o nome atual em aistudio.google.com e troque aqui.
// Tenta cada modelo em ordem; se um não responder em 20 s ou não existir, passa para o próximo.
const MODELOS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"].filter(Boolean);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ erro: "GEMINI_API_KEY não configurada no Vercel" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const { tema = "", assunto = "", duracao = 45, tom = "misterioso" } = req.body || {};
  const dur = Math.min(Math.max(Number(duracao) || 45, 15), 60);
  const palavras = Math.round(dur * 2.3);
  const prompt = `Crie o roteiro narrado de um YouTube Short (vertical) de canal dark, em português do Brasil.
Tema do canal: ${String(tema).slice(0, 100)}
Assunto específico: ${String(assunto).slice(0, 300) || "escolha um assunto pouco conhecido e intrigante dentro do tema"}
Tom: ${String(tom).slice(0, 50)}
Duração: cerca de ${dur} segundos (~${palavras} palavras no total).

Regras:
- O primeiro parágrafo é um gancho forte que prende nos 3 primeiros segundos.
- Termine com um fecho curto que gere curiosidade ou comentário.
- Divida em 6 a 9 parágrafos curtos (1 a 2 frases). Cada parágrafo vai receber uma imagem.
- Só fatos plausíveis e verificáveis; não invente dados.
- Para cada parágrafo, inclua "imagem": um prompt em inglês para gerar a foto (cinematográfica, vertical 9:16, sem texto na imagem, sem pessoas reais identificáveis).
Responda APENAS com JSON, sem markdown: {"titulo":"...","paragrafos":[{"texto":"...","imagem":"..."}]}`;

  const chamar = (modelo, thinking) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3000, ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } })
  });
  const falhas = [];
  for (const modelo of MODELOS) {
    try {
      let r = await chamar(modelo, true);
      if (r.status === 400) r = await chamar(modelo, false);
      if (!r.ok) { const t = await r.text(); console.error("Gemini", modelo, r.status, t); falhas.push(modelo + ": " + r.status); if (r.status === 429 || r.status === 403 || r.status === 401) break; continue; }
      const d = await r.json();
      const txt = (d.candidates?.[0]?.content?.parts || []).map(c => c.text || "").join("");
      const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      return res.status(200).json(json);
    } catch (e) {
      console.error("Gemini", modelo, e.name, e.message);
      falhas.push(modelo + ": " + (e.name === "TimeoutError" ? "sem resposta em 20s" : "resposta inválida"));
    }
  }
  res.status(502).json({ erro: "IA indisponível agora (" + falhas.join(" | ") + "). Veja se a chave é do aistudio.google.com e tente de novo." });
};
