import { getFlags } from '@/lib/db';

export async function GET() {
  if (!process.env.POSTGRES_URL) {
    return Response.json({});
  }
  const flags = await getFlags();
  return Response.json(flags);
}
