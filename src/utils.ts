import md5 from 'blueimp-md5';

/**
 * Safe arrayBufferToBase64 implementation for iOS WebKit.
 * Processes in 8192-byte chunks to avoid call stack overflow.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;

  for (let i = 0; i < len; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }

  return btoa(binary);
}

export function md5Checksum(content: string): string {
  return md5(content);
}

export function isBinaryFile(extension: string): boolean {
  const binaryExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
    'pdf', 'zip', 'bin', 'exe', 'dll', 'dylib',
    'so', 'mp3', 'wav', 'mp4', 'm4a', 'mov'
  ]);
  return binaryExtensions.has(extension.toLowerCase());
}
