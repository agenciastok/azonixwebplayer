function plain(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  return plain("O vídeo abre direto no servidor de conteúdo.", 400);
}
