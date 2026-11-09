// Função do Vercel: gera o roteiro de um Short com IA (Google Gemini, plano gratuito).
// Variáveis de ambiente no Vercel: GEMINI_API_KEY e APP_SENHA
// Se o modelo sair do ar, veja o nome atual em aistudio.google.com e troque aqui.
// Tenta cada modelo em ordem; se um não responder em 20 s ou não existir, passa para o próximo.
const MODELOS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ erro: "GEMINI_API_KEY não configurada no Vercel" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const { tema = "", assunto = "", duracao = 45, tom = "misterioso", modo = "", titulo = "", texto = "" } = req.body || {};
  const dur = Math.min(Math.max(Number(duracao) || 45, 15), 60);
  const palavras = Math.round(dur * 2.3);
  let prompt = `Crie o roteiro narrado de um YouTube Short (vertical) de canal dark, em português do Brasil.
Tema do canal: ${String(tema).slice(0, 100)}
Assunto específico: ${String(assunto).slice(0, 300) || "escolha um assunto pouco conhecido e intrigante dentro do tema"}
Tom: ${String(tom).slice(0, 50)}
Duração: cerca de ${dur} segundos (~${palavras} palavras no total).

Regras:
- O primeiro parágrafo é um gancho forte que prende nos 3 primeiros segundos.
- Termine com um fecho curto que gere curiosidade ou comentário.
- Divida em 6 a 9 parágrafos curtos (1 a 2 frases). Cada parágrafo vai receber uma imagem.
- Só fatos plausíveis e verificáveis; não invente dados.
- Para cada parágrafo, inclua "imagem": um prompt em inglês para gerar a foto (cinematográfica, vertical 9:16, sem texto na imagem, sem pessoas reais identificáveis). Esse prompt deve descrever só o visual neutro da cena (lugar, objetos, clima, época) e NUNCA conter nomes de grupos políticos, regimes, símbolos, guerras, armas, sangue, corpos ou personagens reais, porque os geradores de imagem bloqueiam esses termos (ex.: em vez de "navio nazista dos anos 1930", escreva "old 1930s steam research vessel in rough sea, black and white archival photo look").
- "descricao": descrição para o YouTube em português: 1ª linha com o gancho (aparece antes do "ver mais"), 2 a 3 frases sobre o vídeo sem entregar o final, uma pergunta para gerar comentários e, no fim, 5 a 8 hashtags relevantes incluindo #shorts.
Responda APENAS com JSON, sem markdown: {"titulo":"...","descricao":"...","paragrafos":[{"texto":"...","imagem":"..."}]}`;
  if (modo === "descricao") prompt = `Escreva a descrição de um YouTube Short em português do Brasil, a partir do título e da narração abaixo.
Formato: 1ª linha com o gancho (aparece antes do "ver mais"), 2 a 3 frases sobre o vídeo sem entregar o final, uma pergunta para gerar comentários e, no fim, 5 a 8 hashtags relevantes incluindo #shorts. Use só o que está na narração.
Título: ${String(titulo).slice(0, 150)}
Narração: ${String(texto).slice(0, 3000)}
Responda APENAS com JSON, sem markdown: {"descricao":"..."}`;

  const chamar = (modelo, thinking) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3000, ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } })
  });
  const falhas = [], inicio = Date.now(), esperar = ms => new Promise(r => setTimeout(r, ms));
  for (const modelo of MODELOS) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      if (Date.now() - inicio > 45000) break;
      try {
        let r = await chamar(modelo, true);
        if (r.status === 400) r = await chamar(modelo, false);
        if (!r.ok) {
          console.error("Gemini", modelo, r.status, await r.text()); falhas.push(modelo + ": " + r.status);
          if (r.status === 429 || r.status === 403 || r.status === 401) return res.status(502).json({ erro: "Gemini recusou (" + r.status + "): limite grátis atingido ou chave inválida. Espere 1 minuto e tente de novo." });
          if (r.status === 503 && tentativa === 1) { await esperar(2000); continue; } // sobrecarga: tenta de novo
          break; // outro erro: próximo modelo
        }
        const d = await r.json();
        const txt = (d.candidates?.[0]?.content?.parts || []).map(c => c.text || "").join("");
        return res.status(200).json(JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)));
      } catch (e) {
        console.error("Gemini", modelo, e.name, e.message);
        falhas.push(modelo + ": " + (e.name === "TimeoutError" ? "sem resposta" : "resposta inválida"));
        break;
      }
    }
  }
  res.status(502).json({ erro: "O Gemini está sobrecarregado agora (" + falhas.join(" | ") + "). Tente de novo em 1 minuto." });
};
