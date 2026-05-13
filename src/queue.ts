import { PluginSettings } from './settings';

export interface QueueItem {
  op: 'upsert' | 'delete';
  path: string;
  content?: string;
  checksum?: string;
  updatedAt: string;
  retries: number;
}

export class OfflineQueue {
  private queue: QueueItem[] = [];
  private plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
    this.queue = this.plugin.loadData()?.offlineQueue || [];
  }

  async add(item: QueueItem) {
    this.queue.push(item);
    await this.save();
  }

  async save() {
    const data = this.plugin.loadData() || {};
    data.offlineQueue = this.queue;
    await this.plugin.saveData(data);
  }

  async flush(flushCallback: (item: QueueItem) => Promise<void>) {
    if (this.queue.length === 0) return;

    const itemsToProcess = [...this.queue];
    this.queue = [];
    await this.save();

    for (const item of itemsToProcess) {
      try {
        await flushCallback(item);
      } catch (e) {
        console.error(`SupaSync Queue: Failed to process ${item.path}, retrying...`, e);
        item.retries++;
        if (item.retries < 5) {
          this.queue.push(item);
        } else {
          console.warn(`SupaSync Queue: Dropping item ${item.path} after 5 retries.`);
        }
      }
    }
    await this.save();
  }

  get length(): number {
    return this.queue.length;
  }
}
