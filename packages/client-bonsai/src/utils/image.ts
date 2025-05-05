import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TEMP_IMAGE_DIR = path.join(process.cwd(), 'temp', 'images');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_IMAGE_DIR)) {
  fs.mkdirSync(TEMP_IMAGE_DIR, { recursive: true });
}

export interface SavedImage {
  url: string;
  filepath: string;
}

export async function saveBase64Image(base64Data: string): Promise<SavedImage> {
  // Extract MIME type and base64 data
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 image format');
  }

  const mimeType = matches[1];
  const base64Image = matches[2];
  const buffer = Buffer.from(base64Image, 'base64');

  // Map MIME types to file extensions
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  };

  const extension = mimeToExt[mimeType] || 'png'; // Default to png if unknown type
  const filename = `${uuidv4()}.${extension}`;
  const filepath = path.join(TEMP_IMAGE_DIR, filename);

  // Save file
  await fs.promises.writeFile(filepath, buffer);

  // Return both URL and filepath
  return {
    url: `/images/${filename}`,
    filepath
  };
}

export function isBase64Image(str: string): boolean {
  return str.startsWith('data:image/') || /^[A-Za-z0-9+/=]+$/.test(str);
}