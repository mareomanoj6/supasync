import { Plugin, PluginSettingTab } from 'obsidian';
import { SupabaseSyncSettingsTab, PluginSettings, DEFAULT_SETTINGS } from './settings';
import { supabaseManager } from './supabase';
import { SyncEngine } from './sync-engine';

export default class SupaSyncPlugin extends Plugin {
  settings: PluginSettings;
  syncEngine: SyncEngine;

  async onload() {
    console.log('Loading Supabase Sync plugin...');

    this.settings = this.loadData() || { ...DEFAULT_SETTINGS };

    // Ensure deviceId exists
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.saveData(this.settings);
    }

    supabaseManager.init(this.settings);

    this.syncEngine = new SyncEngine(this);

    this.addSettingTab(new SupaSyncSettingsTab(this.app, this));

    this.registerEvent(
      this.app.workspace.onLayoutReady(() => {
        this.startSync();
      })
    );
  }

  onunload() {
    console.log('Unloading Supabase Sync plugin...');
    this.stopSync();
    supabaseManager.getClient().removeAllChannels();
  }

  async updateSupabaseClient() {
    supabaseManager.init(this.settings);
    if (this.settings.syncEnabled) {
      this.startSync();
    }
  }

  startSync() {
    this.syncEngine.start();
  }

  stopSync() {
    this.syncEngine.stop();
  }
}
