// Função do Vercel: recebe um texto e devolve o áudio (MP3) gerado pela Fish Audio.
// Variáveis de ambiente no Vercel: FISH_API_KEY e APP_SENHA
const MODELO = "s2.1-pro-free"; // com crédito na conta, troque por "s2.1-pro"

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  const key = process.env.FISH_API_KEY;
  if (!key) return res.status(500).json({ erro: "FISH_API_KEY não configurada no Vercel" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const { texto, voz, velocidade = 1 } = req.body || {};
  if (!texto || typeof texto !== "string" || texto.length > 1000) return res.status(400).json({ erro: "texto inválido (máx. 1000 caracteres)" });
  if (!voz || !/^[a-f0-9]{32}$/.test(voz)) return res.status(400).json({ erro: "ID de voz inválido" });

  try {
    const r = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", "model": MODELO },
      body: JSON.stringify({
        text: texto, reference_id: voz, format: "mp3", mp3_bitrate: 128, latency: "normal", normalize: true,
        prosody: { speed: Math.min(Math.max(Number(velocidade) || 1, 0.5), 2) }
      })
    });
    if (!r.ok) { console.error("Fish Audio", r.status, await r.text()); return res.status(502).json({ erro: "Fish Audio respondeu " + r.status }); }
    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: "falha ao gerar a narração" });
  }
};
