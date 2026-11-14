// Função do Vercel: busca um clipe vertical grátis no Pexels e devolve o MP4.
// Variáveis de ambiente no Vercel: PEXELS_API_KEY (grátis em pexels.com/api) e APP_SENHA
// A Vercel limita a resposta de uma função a ~4,5 MB, então só devolvemos clipes pequenos.
const MAX_BYTES = 4200000;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!process.env.PEXELS_API_KEY) return res.status(500).json({ erro: "PEXELS_API_KEY não configurada no Vercel" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const busca = String((req.body || {}).busca || "").replace(/[^\p{L}\p{N} ]/gu, " ").trim().slice(0, 80);
  const pular = new Set((Array.isArray((req.body || {}).pular) ? req.body.pular : []).map(String));
  if (!busca) return res.status(400).json({ erro: "busca vazia" });

  const pesquisar = async q => {
    const r = await fetch("https://api.pexels.com/videos/search?orientation=portrait&size=medium&per_page=20&query=" + encodeURIComponent(q), {
      headers: { Authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) { const e = new Error("Pexels respondeu " + r.status); e.status = r.status; throw e; }
    return (await r.json()).videos || [];
  };

  try {
    // tenta a busca completa; se nada servir, tenta só as 2 primeiras palavras
    const consultas = [busca, busca.split(/\s+/).slice(0, 2).join(" ")].filter((q, i, a) => q && a.indexOf(q) === i);
    const inicio = Date.now();
    for (const q of consultas) {
      const vids = (await pesquisar(q)).filter(v => !pular.has(String(v.id)) && v.duration >= 3 && v.duration <= 25);
      for (const v of vids.slice(0, 8)) {
        // arquivos MP4 verticais, do maior para o menor (até 1080 px), e usa o primeiro que couber no limite
        const arqs = (v.video_files || []).filter(f => f.file_type === "video/mp4" && f.link && f.height >= f.width && f.width >= 360 && f.width <= 1080)
          .sort((a, b) => b.width - a.width).slice(0, 3);
        for (const f of arqs) {
          if (Date.now() - inicio > 45000) break;
          try {
            const r = await fetch(f.link, { signal: AbortSignal.timeout(20000) });
            if (!r.ok) continue;
            const tam = Number(r.headers.get("content-length")) || 0;
            if (tam > MAX_BYTES) { try { await r.body.cancel(); } catch {} continue; }
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length > MAX_BYTES) continue;
            res.setHeader("Content-Type", "video/mp4");
            res.setHeader("x-video-id", String(v.id));
            res.setHeader("Access-Control-Expose-Headers", "x-video-id");
            return res.status(200).send(buf);
          } catch (e) { console.error("Pexels download", e.message); }
        }
      }
    }
    res.status(404).json({ erro: `não achei um clipe vertical pequeno para "${busca}". Troque a busca (em inglês funciona melhor) ou envie o vídeo manualmente.` });
  } catch (e) {
    console.error("Pexels", e.message);
    if (e.status === 401 || e.status === 403) return res.status(502).json({ erro: "Pexels recusou a chave (confira a PEXELS_API_KEY)." });
    if (e.status === 429) return res.status(502).json({ erro: "limite do Pexels atingido, espere um pouco e tente de novo." });
    res.status(502).json({ erro: "falha ao falar com o Pexels: " + e.message });
  }
};
