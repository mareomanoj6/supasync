import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { PluginSettings } from './settings';

export class SupabaseManager {
  private client: SupabaseClient | null = null;
  private currentSession: Session | null = null;

  init(settings: PluginSettings) {
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      return;
    }
    this.client = createClient(settings.supabaseUrl, settings.supabaseAnonKey);

    if (settings.session) {
      this.currentSession = settings.session;
      this.client.setSession(settings.session);
    }
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  async refreshSession(session: Session) {
    const client = this.getClient();
    const { data, error } = await client.auth.refreshSession();

    if (error) throw error;
    this.currentSession = data.session;
    return data.session;
  }

  async initiateOAuth() {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'default',
      options: {
        redirectTo: 'http://localhost:3000/callback',
      },
    });

    if (error) throw error;
    return data.url;
  }

  async exchangeCodeForSession(code: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error) throw error;
    this.currentSession = data.session;
    return data.session;
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  async testConnection(): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase client not initialized. Please check your settings.');

    // Simple ping to the database
    const { error } = await client.from('files').select('path').limit(1);

    // We don't strictly check for error here because the table might not exist yet,
    // but a network failure or invalid key will trigger a specific error.
    if (error && (error.message.includes('invalid api key') || error.message.includes('Connection failed'))) {
      throw error;
    }
  }

  async upsertFile(path: string, content: string, checksum: string, deviceId: string) {
    const client = this.getClient();
    if (!client) return;

    const { error } = await client
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
    if (!client) return;

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
    const client = this.getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('files')
      .select('path, updated_at, checksum');

    if (error) throw error;
    return data || [];
  }

  async getTombstones() {
    const client = this.getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('tombstones')
      .select('path, deleted_at');

    if (error) throw error;
    return data || [];
  }

  async getIncrementalSync(since: string) {
    const client = this.getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('files')
      .select('path, updated_at, checksum, content')
      .gt('updated_at', since);

    if (error) throw error;
    return data || [];
  }

  async uploadBinary(path: string, buffer: ArrayBuffer): Promise<string> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase client not initialized');
    const fileName = `${Date.now()}-${path.replace(/\//g, '_')}`;

    const { data, error } = await client.storage
      .from('vault-attachments')
      .upload(fileName, buffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (error) throw error;

    // Since the bucket is now PRIVATE, we store the reference path, not a public URL.
    // We will generate a signed URL on-the-fly when downloading.
    return fileName;
  }

  async getSignedBinaryUrl(fileName: string): Promise<string> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase client not initialized');
    const { data, error } = await client.storage
      .from('vault-attachments')
      .createSignedUrl(fileName, 3600); // Valid for 1 hour

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Could not generate signed URL');

    return data.signedUrl;
  }
}

export const supabaseManager = new SupabaseManager();
