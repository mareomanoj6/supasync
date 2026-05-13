import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PluginSettings } from './settings';

export class SupabaseManager {
  private client: SupabaseClient | null = null;

  init(settings: PluginSettings) {
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      return;
    }
    this.client = createClient(settings.supabaseUrl, settings.supabaseAnonKey);
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase client not initialized. Please check your settings.');
    }
    return this.client;
  }

  async testConnection(): Promise<void> {
    const client = this.getClient();
    // Simple ping to the database
    const { error } = await client.from('files').select('path').limit(1);

    // We don't strictly check for error here because the table might not exist yet,
    // but a network failure or invalid key will trigger a specific error.
    if (error && (error.message.includes('invalid api key') || error.message.includes('Connection failed'))) {
      throw error;
    }
  }

  async upsertFile(path: string, content: string, checksum: string, deviceId: string) {
    const { error } = await this.getClient()
      .from('files')
      .upsert({
        path,
        content,
        checksum,
        device_id: deviceId,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  async deleteFile(path: string) {
    const client = this.getClient();

    // 1. Insert tombstone
    const { error: tError } = await client
      .from('tombstones')
      .upsert({
        path,
        deleted_at: new Date().toISOString()
      });

    if (tError) throw tError;

    // 2. Delete from files
    const { error: fError } = await client
      .from('files')
      .delete()
      .eq('path', path);

    if (fError) throw fError;
  }

  async getRemoteIndex() {
    const { data, error } = await this.getClient()
      .from('files')
      .select('path, updated_at, checksum');

    if (error) throw error;
    return data || [];
  }

  async getTombstones() {
    const { data, error } = await this.getClient()
      .from('tombstones')
      .select('path, deleted_at');

    if (error) throw error;
    return data || [];
  }

  async getIncrementalSync(since: string) {
    const { data, error } = await this.getClient()
      .from('files')
      .select('path, updated_at, checksum, content')
      .gt('updated_at', since);

    if (error) throw error;
    return data || [];
  }

  async uploadBinary(path: string, buffer: ArrayBuffer): Promise<string> {
    const client = this.getClient();
    const fileName = `${Date.now()}-${path.replace(/\//g, '_')}`;

    const { data, error } = await client.storage
      .from('vault-attachments')
      .upload(fileName, buffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = client.storage
      .from('vault-attachments')
      .getPublicUrl(fileName);

    return publicUrl;
  }
}

export const supabaseManager = new SupabaseManager();
