import { App, TFile, TAbstractFile, Notice, normalizePath } from 'obsidian';
import { Platform } from 'obsidian';
import { supabaseManager } from './supabase';
import { PlatformHelper } from './platform';
import { md5Checksum, isBinaryFile, arrayBufferToBase64 } from './utils';
import { OfflineQueue, QueueItem } from './queue';
import { PluginSettings } from './settings';

export class SyncEngine {
  private plugin: any;
  private queue: OfflineQueue;
  private lastSyncTimestamp: string = new Date().toISOString();
  private pendingRemoteWrites = new Set<string>();
  private statusBarItem: any;

  constructor(plugin: any) {
    this.plugin = plugin;
    this.queue = new OfflineQueue(plugin);
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.updateStatus('Synced');
  }

  updateStatus(status: 'Synced' | 'Syncing...' | 'Sync error' | 'Sync off' | 'Reconnecting', detail?: string) {
    const map: Record<string, string> = {
      'Synced': '☁ Synced',
      'Syncing...': '↑↓ Syncing...',
      'Sync error': '✗ Sync error',
      'Sync off': '⏸ Sync off',
      'Reconnecting': '↻ Reconnecting',
    };
    this.statusBarItem.setText(map[status]);
    if (detail) {
      this.statusBarItem.onClick(() => new Notice(detail));
    }
  }

  async start() {
    if (!this.plugin.settings.syncEnabled) {
      this.updateStatus('Sync off');
      return;
    }

    this.updateStatus('Syncing...');
    try {
      await this.initialReconciliation();
      await this.setupRealtimeListener();
      await this.setupLocalListener();
      await this.queue.flush((item) => this.processQueueItem(item));
      this.updateStatus('Synced');
    } catch (e) {
      console.error('SupaSync Engine: Start error', e);
      this.updateStatus('Sync error', (e as Error).message);
    }
  }

  async stop() {
    const client = supabaseManager.getClient();
    if (client) {
      client.removeAllChannels();
    }
    this.updateStatus('Sync off');
  }

  private async initialReconciliation() {
    if (Platform.isMobile) {
      await new Promise(r => setTimeout(r, 2000));
    }

    const remoteFiles = await supabaseManager.getRemoteIndex();
    const localFiles = this.plugin.app.vault.getFiles();

    const batchSize = PlatformHelper.getMaxBatchSize();
    const excludePatterns = this.plugin.settings.excludePatterns.split(',').map((p: string) => normalizePath(p.trim()));

    const filterFile = (path: string) => {
      return excludePatterns.some((pattern: string) => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$');
        return regex.test(path);
      });
    };

    for (let i = 0; i < localFiles.length; i += batchSize) {
      const batch = localFiles.slice(i, i + batchSize);
      for (const file of batch) {
        if (filterFile(file.path)) continue;

        const remote = remoteFiles.find(rf => rf.path === file.path);
        if (!remote) {
          await this.pushLocalToRemote(file);
        } else if (remote.updated_at > file.stat.mtime) {
          await this.pullRemoteToLocal(remote);
        } else if (remote.updated_at === file.stat.mtime && remote.checksum !== await this.getChecksum(file)) {
          await this.handleConflict(file, remote);
        }
      }
      if (Platform.isMobile) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Pull missing remotes
    const localPaths = new Set(localFiles.map(f => f.path));
    for (const remote of remoteFiles) {
      if (!localPaths.has(remote.path)) {
        await this.pullRemoteToLocal(remote);
      }
    }

    // Process tombstones
    const tombstones = await supabaseManager.getTombstones();
    for (const tomb of tombstones) {
      await this.deleteLocalFile(tomb.path);
    }
  }

  private async setupRealtimeListener() {
    const client = supabaseManager.getClient();
    const config = PlatformHelper.getRealtimeConfig();

    const channel = client.channel('vault-sync', {
      config: { broadcast: { self: false }, presence: { user: { id: 'user' } } }
    });

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, (payload) => {
        this.handleRemoteChange('files', payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tombstones' }, (payload) => {
        this.handleRemoteChange('tombstones', payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateStatus('Synced');
        } else if (status === 'CHANNEL_ERROR') {
          this.updateStatus('Sync error', 'Realtime channel error');
        } else {
          this.updateStatus('Reconnecting');
        }
      });

    this.plugin.registerDomEvent(document, 'visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        if (channel.status() !== 'SUBSCRIBED') {
          await channel.subscribe();
        }
        await this.incrementalSync();
        await this.queue.flush((item) => this.processQueueItem(item));
      }
    });
  }

  private async setupLocalListener() {
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (file) => this.handleLocalChange('create', file)),
      this.plugin.app.vault.on('modify', (file) => this.handleLocalChange('modify', file)),
      this.plugin.app.vault.on('delete', (file) => this.handleLocalChange('delete', file)),
      this.plugin.app.vault.on('rename', (file, oldPath) => this.handleLocalChange('rename', file, oldPath))
    );
  }

  private async handleLocalChange(type: string, file: TAbstractFile, oldPath?: string) {
    if (!(file instanceof TFile)) return;
    const path = file.path;
    if (this.pendingRemoteWrites.has(path)) return;
    if (this.isExcluded(path)) return;

    const debounce = PlatformHelper.getDebounceMs(this.plugin.settings.debounceMs);

    // Simple debounce logic via timeout map
    if (type === 'modify') {
      if ((this as any).debounceTimers?.[path]) clearTimeout((this as any).debounceTimers[path]);
      (this as any).debounceTimers = (this as any).debounceTimers || {};
      (this as any).debounceTimers[path] = setTimeout(() => this.processLocalChange(type, file), debounce);
      return;
    }
    await this.processLocalChange(type, file, oldPath);
  }

  private async processLocalChange(type: string, file: TFile, oldPath?: string) {
    const path = file.path;
    try {
      if (type === 'delete') {
        await supabaseManager.deleteFile(path);
      } else if (type === 'rename' && oldPath) {
        await supabaseManager.deleteFile(oldPath);
        await this.pushLocalToRemote(file);
      } else {
        await this.pushLocalToRemote(file);
      }
    } catch (e) {
      await this.queue.add({
        op: type === 'delete' ? 'delete' : 'upsert',
        path,
        updatedAt: new Date().toISOString(),
        retries: 0
      });
    }
  }

  private async pushLocalToRemote(file: TFile) {
    const path = file.path;
    this.pendingRemoteWrites.add(path);
    try {
      const extension = file.extension;
      if (isBinaryFile(extension)) {
        const buffer = await this.plugin.app.vault.adapter.readBinary(path);
        const url = await supabaseManager.uploadBinary(path, buffer);
        const content = `STORAGE:${url}`;
        const checksum = await this.getChecksum(file, content);
        await supabaseManager.upsertFile(path, content, checksum, this.plugin.settings.deviceId);
      } else {
        const content = await this.plugin.app.vault.read(path);
        const checksum = md5Checksum(content);
        await supabaseManager.upsertFile(path, content, checksum, this.plugin.settings.deviceId);
      }
    } finally {
      this.pendingRemoteWrites.delete(path);
    }
  }

  private async pullRemoteToLocal(remote: any) {
    const path = remote.path;
    this.pendingRemoteWrites.add(path);
    try {
      if (remote.content && remote.content.startsWith('STORAGE:')) {
        const fileName = remote.content.replace('STORAGE:', '');
        const url = await supabaseManager.getSignedBinaryUrl(fileName);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        await this.plugin.app.vault.adapter.writeBinary(path, buffer);
      } else {
        await this.plugin.app.vault.modify(path, remote.content || '');
      }
    } finally {
      this.pendingRemoteWrites.delete(path);
    }
  }

  private async handleRemoteChange(table: string, payload: any) {
    const { path, content } = payload.new_record;
    if (this.pendingRemoteWrites.has(path)) return;

    this.pendingRemoteWrites.add(path);
    try {
      if (table === 'tombstones') {
        await this.deleteLocalFile(path);
      } else {
        await this.pullRemoteToLocal({ path, content });
      }
    } finally {
      this.pendingRemoteWrites.delete(path);
    }
  }

  private async deleteLocalFile(path: string) {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file) {
      await this.plugin.app.vault.trash(path, true);
    }
  }

  private async handleConflict(file: TFile, remote: any) {
    const conflictPath = `${file.path}.conflict.md`;
    const content = await this.plugin.app.vault.read(file.path);
    await this.plugin.app.vault.create(conflictPath, content);
    await this.pullRemoteToLocal(remote);
  }

  private async incrementalSync() {
    const updates = await supabaseManager.getIncrementalSync(this.lastSyncTimestamp);
    for (const update of updates) {
      await this.pullRemoteToLocal(update);
    }
    this.lastSyncTimestamp = new Date().toISOString();
  }

  private async processQueueItem(item: QueueItem) {
    if (item.op === 'delete') {
      await supabaseManager.deleteFile(item.path);
    } else {
      const file = this.plugin.app.vault.getAbstractFileByPath(item.path);
      if (file instanceof TFile) {
        await this.pushLocalToRemote(file);
      }
    }
  }

  private async getChecksum(file: TFile, overrideContent?: string) {
    const content = overrideContent || await this.plugin.app.vault.read(file.path);
    return md5Checksum(content);
  }

  private isExcluded(path: string): boolean {
    const patterns = this.plugin.settings.excludePatterns.split(',').map((p: string) => p.trim());
    return patterns.some((pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$');
      return regex.test(path);
    });
  }
}
