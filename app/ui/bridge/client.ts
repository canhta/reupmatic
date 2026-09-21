export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Capabilities {
  ffmpeg: boolean;
  pysubs2: boolean;
  ocr: boolean;
  inpainting: boolean;
}

export async function unwrap<T>(request: Promise<Reply<T>>): Promise<T> {
  const reply = await request;
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
