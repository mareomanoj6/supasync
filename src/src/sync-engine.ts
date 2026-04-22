import { Vault, TFile, TFolder, Notice, normalizePath } from 'obsidian';
import { SupabaseSync, SupabaseSyncSettings, VaultFileMeta } from './supabase-client';
import { hashFile } from './hash-utils';

export class SyncEngine {
    constructor(private vault: Vault, private supabase: SupabaseSync, private settings: SupabaseSyncSettings) {}

    /**
     * Push (Local -> Remote)
     */
    async push(): Promise<{uploaded: number, skipped: number, deleted: number}> {
        let uploaded = 0;
        let skipped = 0;
        let deleted = 0;

        const localFiles = this.vault.getFiles();
        const localManifest = new Map<string, string>();

        // 1. Build local manifest
        for (const file of localFiles) {
            const path = file.path;
            const hash = await hashFile(file, this.vault);
            localManifest.set(path, hash);
        }

        // 2. Fetch remote manifest
        const remoteManifest = await this.supabase.getRemoteManifest();
        const remoteMap = new Map<string, VaultFileMeta>();
        remoteManifest.forEach(m => remoteMap.set(m.file_path, m));

        // 3. Upload new/changed files
        for (const [path, hash] of localManifest) {
            const remote = remoteMap.get(path);
            const file = this.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) continue;

            if (!remote || remote.file_hash !== hash) {
                let buffer: ArrayBuffer;

                if (path.endsWith('.md')) {
                    const content = await this.vault.read(file);
                    buffer = new TextEncoder().encode(content).buffer;
                } else {
                    try {
                        buffer = await this.vault.readBinaryFile(path);
                    } catch (e) {
                        const content = await this.vault.read(file);
                        buffer = new TextEncoder().encode(content).buffer;
                    }
                }

                await this.supabase.uploadFile(path, buffer, hash);
                uploaded++;
            } else {
                skipped++;
            }
        }

        // 4. Delete remote files not in local manifest
        for (const [path] of remoteMap) {
            if (!localManifest.has(path)) {
                await this.supabase.deleteFile(path);
                deleted++;
            }
        }

        return { uploaded, skipped, deleted };
    }

    /**
     * Pull (Remote -> Local)
     * @param replaceAll If true, overwrite local files regardless of hash
     */
    async pull(replaceAll = false): Promise<{downloaded: number, conflicts: number, skipped: number}> {
        let downloaded = 0;
        let conflicts = 0;
        let skipped = 0;

        const remoteManifest = await this.supabase.getRemoteManifest();

        for (const remote of remoteManifest) {
            const path = remote.file_path;
            const localFile = this.vault.getAbstractFileByPath(path);

            if (localFile instanceof TFile) {
                const localHash = await hashFile(localFile, this.vault);
                if (localHash === remote.file_hash) {
                    skipped++;
                    continue;
                }

                if (replaceAll) {
                    await this.downloadAndWrite(remote);
                    downloaded++;
                } else {
                    // CONFLICT
                    await this.handleConflict(remote);
                    conflicts++;
                }
            } else {
                // Missing locally
                await this.downloadAndWrite(remote);
                downloaded++;
            }
        }

        return { downloaded, conflicts, skipped };
    }

    private async downloadAndWrite(remote: VaultFileMeta): Promise<void> {
        const arrayBuffer = await this.supabase.downloadFile(remote.storage_path);
        const path = remote.file_path;

        // Ensure folder exists
        const folderPath = path.substring(0, path.lastIndexOf('/'));
        if (folderPath && !this.vault.getAbstractFileByPath(folderPath)) {
            await this.vault.createFolder(folderPath);
        }

        if (path.endsWith('.md')) {
            const decoder = new TextDecoder();
            const content = decoder.decode(arrayBuffer);
            await this.vault.modify(path, content);
        } else {
            await this.vault.binaryWrite(path, arrayBuffer);
        }
    }

    private async handleConflict(remote: VaultFileMeta): Promise<void> {
        const timestamp = Date.now();
        const fileName = remote.file_path;
        const conflictDir = this.settings.conflictFolderName;
        const conflictPath = `${conflictDir}/${fileName}.conflict.${timestamp}.md`;

        // Ensure conflict folder exists
        if (!this.vault.getAbstractFileByPath(conflictDir)) {
            await this.vault.createFolder(conflictDir);
        }

        const arrayBuffer = await this.supabase.downloadFile(remote.storage_path);

        if (remote.file_path.endsWith('.md')) {
            const decoder = new TextDecoder();
            const content = decoder.decode(arrayBuffer);
            await this.vault.modify(conflictPath, content);
        } else {
            await this.vault.binaryWrite(conflictPath, arrayBuffer);
        }
    }
}
