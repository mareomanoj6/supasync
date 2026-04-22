import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface VaultFileMeta {
    id: string;
    device_id: string;
    file_path: string;
    file_hash: string;
    last_modified: number;
    storage_path: string;
    created_at?: string;
    updated_at?: string;
}

export interface SupabaseSyncSettings {
    projectUrl: string;
    anonKey: string;
    bucketName: string;
    deviceId: string;
    autoSyncEnabled: boolean;
    autoSyncIntervalMinutes: number;
    conflictFolderName: string;
}

export class SupabaseSync {
    private client: SupabaseClient;
    private settings: SupabaseSyncSettings;

    constructor(settings: SupabaseSyncSettings) {
        this.settings = settings;
        this.client = createClient(settings.projectUrl, settings.anonKey);
    }

    /**
     * Upload a single file buffer to storage + upsert metadata row.
     */
    async uploadFile(relativePath: string, content: ArrayBuffer, hash: string): Promise<void> {
        const storagePath = `${this.settings.deviceId}/${relativePath}`;

        // Upload to Storage
        const { error: storageError } = await this.client.storage
            .from(this.settings.bucketName)
            .upload(storagePath, content, {
                upsert: true,
                contentType: 'text/markdown'
            });

        if (storageError) throw storageError;

        // Upsert metadata row
        const { error: dbError } = await this.client
            .from('vault_files')
            .upsert({
                device_id: this.settings.deviceId,
                file_path: relativePath,
                file_hash: hash,
                last_modified: Date.now(),
                storage_path: storagePath
            }, { onConflict: 'device_id,file_path' });

        if (dbError) throw dbError;
    }

    /**
     * Download a single file from storage.
     */
    async downloadFile(storagePath: string): Promise<ArrayBuffer> {
        const { data, error } = await this.client.storage
            .from(this.settings.bucketName)
            .download(storagePath);

        if (error) throw error;
        if (!data) throw new Error('File not found in storage');

        // Convert Blob to ArrayBuffer
        return await data.arrayBuffer();
    }

    /**
     * Fetch all metadata rows for this device.
     */
    async getRemoteManifest(): Promise<VaultFileMeta[]> {
        const { data, error } = await this.client
            .from('vault_files')
            .select('*')
            .eq('device_id', this.settings.deviceId);

        if (error) throw error;
        return data as VaultFileMeta[];
    }

    /**
     * Delete a file from storage + remove metadata row.
     */
    async deleteFile(relativePath: string): Promise<void> {
        const storagePath = `${this.settings.deviceId}/${relativePath}`;

        // Delete from Storage
        const { error: storageError } = await this.client.storage
            .from(this.settings.bucketName)
            .remove([storagePath]);

        if (storageError) throw storageError;

        // Delete from Metadata table
        const { error: dbError } = await this.client
            .from('vault_files')
            .delete()
            .eq('device_id', this.settings.deviceId)
            .eq('file_path', relativePath);

        if (dbError) throw dbError;
    }

    /**
     * Test that bucket is reachable.
     */
    async testConnection(): Promise<boolean> {
        try {
            const { data, error } = await this.client.storage
                .from(this.settings.bucketName)
                .list();

            if (error) return false;
            return !!data;
        } catch {
            return false;
        }
    }
}
