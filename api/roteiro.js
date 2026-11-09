// Função do Vercel: gera o roteiro de um Short com IA (Claude).
// Variáveis de ambiente no Vercel: ANTHROPIC_API_KEY e APP_SENHA
const MODELO = "claude-sonnet-5-5";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erro: "ANTHROPIC_API_KEY não configurada no Vercel" });
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

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) { console.error("Anthropic", r.status, await r.text()); return res.status(502).json({ erro: "IA respondeu " + r.status }); }
    const d = await r.json();
    const txt = d.content.map(c => c.text || "").join("");
    const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    res.status(200).json(json);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: "falha ao gerar o roteiro" });
  }
};
