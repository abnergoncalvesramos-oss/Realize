// Servidor do worker. Roda o loop da fila E expõe uma porta HTTP,
// que é o que o Render exige de um web service.
//
// GET /health  -> 200 se o loop está vivo
// GET /stats   -> contagem da fila
// POST /tick   -> força uma rodada (útil para cron externo)

import http from "node:http";
import { tick, queueStats } from "./publish";

const PORT = Number(process.env.PORT) || 10000;
const TICK_MS = Number(process.env.TICK_MS) || 30_000;

let lastTickAt = 0;
let lastError: string | null = null;
let running = false;

async function runTick() {
  if (running) return;
  running = true;
  try {
    await tick();
    lastTickAt = Date.now();
    lastError = null;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    console.error("[tick]", lastError);
  } finally {
    running = false;
  }
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/health") {
    // Se o loop travou por mais de 3 ciclos, devolve 503 e o Render reinicia.
    const stale = lastTickAt > 0 && Date.now() - lastTickAt > TICK_MS * 3;
    return json(res, stale ? 503 : 200, {
      ok: !stale,
      lastTickAt: lastTickAt ? new Date(lastTickAt).toISOString() : null,
      lastError,
    });
  }

  if (path === "/stats") {
    try {
      return json(res, 200, await queueStats());
    } catch (e) {
      return json(res, 500, { error: String(e) });
    }
  }

  if (path === "/tick" && req.method === "POST") {
    // Protegido: só com o mesmo segredo do cron.
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${process.env.WORKER_SECRET}`) {
      return json(res, 401, { error: "não autorizado" });
    }
    await runTick();
    return json(res, 200, { ok: true, lastError });
  }

  return json(res, 404, { error: "rota não encontrada" });
});

server.listen(PORT, () => {
  console.log(`worker ouvindo na porta ${PORT}`);
});

// O loop interno. Se você preferir disparar por cron externo,
// defina TICK_MS=0 e use POST /tick.
if (TICK_MS > 0) {
  const loop = async () => {
    await runTick();
    setTimeout(loop, TICK_MS);
  };
  loop();
}

// Encerramento limpo: termina a rodada em andamento antes de sair.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`${sig} recebido, encerrando`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 15_000);
  });
}
