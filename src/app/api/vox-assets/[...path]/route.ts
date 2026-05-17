import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const VOX_BASE = process.env.VOX_BASE_DIR || 'C:\\Users\\user\\developsecond\\game-assets\\vox';

function contentTypeFor(ext: string): string {
  switch (ext) {
    case '.json': return 'application/json';
    case '.vox': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: parts } = await context.params;
    if (!parts || parts.length === 0) {
      return NextResponse.json({ error: 'Empty path' }, { status: 400 });
    }

    const base = path.resolve(VOX_BASE);
    const abs = path.resolve(base, ...parts);

    if (abs !== base && !abs.startsWith(base + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const data = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const body = new Uint8Array(data);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(ext),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
