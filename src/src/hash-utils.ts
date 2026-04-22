import { TFile, Vault } from 'obsidian';

/**
 * Computes the SHA-256 hash of an ArrayBuffer.
 * @param content The file content as an ArrayBuffer.
 * @returns The hex string representation of the hash.
 */
async function sha256(content: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', content);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the SHA-256 hash of an Obsidian TFile.
 * @param file The TFile to hash.
 * @param vault The vault instance.
 * @returns The hex string representation of the hash.
 */
export async function hashFile(file: TFile, vault: Vault): Promise<string> {
    let data: ArrayBuffer;

    if (file.path.endsWith('.md')) {
        const content = await vault.read(file);
        const encoder = new TextEncoder();
        data = encoder.encode(content).buffer;
    } else {
        try {
            data = await vault.adapter.readBinaryFile(file.path);
        } catch (e) {
            // Fallback for environments where adapter.readBinaryFile fails
            const content = await vault.read(file);
            const encoder = new TextEncoder();
            data = encoder.encode(content).buffer;
        }
    }

    return await sha256(data);
}
