import { pool } from '@/lib/db';

// Serve a imagem do post guardada em ig_media.image_data (bytea). As URLs do CDN do
// Instagram expiram em horas/dias; servir do banco resolve de vez. Cache longo: a imagem
// de um post é imutável.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await pool.query<{ image_data: Buffer | null; image_mime: string | null }>(
    'SELECT image_data, image_mime FROM ig_media WHERE id = $1',
    [id],
  );
  const row = res.rows[0];
  if (!row?.image_data) {
    return new Response('Not found', { status: 404 });
  }
  const body = new Uint8Array(row.image_data);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': row.image_mime ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
