import { Plugin, PluginSettingTab, Notice, MenuItem } from 'obsidian';
import { SupabaseSync, SupabaseSyncSettings } from './supabase-client';
import { SyncEngine } from './sync-engine';
import { SyncSettingsTab } from './settings';

interface SupasyncSettings extends SupabaseSyncSettings {}

const DEFAULT_SETTINGS: SupasyncSettings = {
    projectUrl: '',
    anonKey: '',
    bucketName: '',
    deviceId: '',
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 15,
    conflictFolderName: 'conflicts'
};

export default class SupasyncPlugin extends Plugin {
    settings: SupasyncSettings;
    private _syncEngine: SyncEngine | null = null;

    get syncEngine(): SyncEngine {
        if (this._syncEngine) return this._syncEngine;

        if (!this.settings.projectUrl || !this.settings.anonKey) {
            throw new Error('Supabase Project URL and Anon Key are required in settings.');
        }

        const supabase = new SupabaseSync(this.settings);
        this._syncEngine = new SyncEngine(this.app.vault, supabase, this.settings);
        return this._syncEngine;
    }

    async onload() {
        await this.loadSettings();

        // Generate Device ID if missing
        if (!this.settings.deviceId) {
            this.settings.deviceId = crypto.randomUUID();
            await this.saveSettings();
        }

        // Add ribbon icons
        this.addRibbonIcon('cloud', 'Push to Supabase', () => this.pushVault());
        this.addRibbonIcon('arrow-down', 'Pull from Supabase', () => this.pullVault());

        // Register commands
        this.addCommand({
            id: 'push-vault',
            name: 'Push Vault to Supabase',
            callback: () => this.pushVault(),
        });

        this.addCommand({
            id: 'pull-vault-merge',
            name: 'Pull Vault (Hash Check)',
            callback: () => this.pullVault(false),
        });

        this.addCommand({
            id: 'pull-vault-replace',
            name: 'Pull Vault (Replace All)',
            callback: () => this.pullVault(true),
        });

        this.addCommand({
            id: 'open-settings',
            name: 'Open Sync Settings',
            callback: () => {
                this.app.workspace.trigger('settings', 'supasync');
            },
        });

        // Register settings tab
        this.addSettingTab(new SyncSettingsTab(this.app, this));

        this.updateAutoSync();
    }

    async pushVault() {
        try {
            const engine = this.syncEngine;
            new Notice('Syncing... (Pushing)');
            const result = await engine.push();
            new Notice(`Sync complete. ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.deleted} deleted.`);
        } catch (e: any) {
            new Notice(`Sync error: ${e.message}`);
            console.error(e);
        }
    }

    async pullVault(replaceAll = false) {
        try {
            const engine = this.syncEngine;
            new Notice('Syncing... (Pulling)');
            const result = await engine.pull(replaceAll);
            new Notice(`Sync complete. ${result.downloaded} downloaded, ${result.conflicts} conflicts, ${result.skipped} skipped.`);
        } catch (e: any) {
            new Notice(`Sync error: ${e.message}`);
            console.error(e);
        }
    }

    updateAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }

        if (this.settings.autoSyncEnabled) {
            this.autoSyncInterval = setInterval(() => {
                this.pushVault();
            }, this.settings.autoSyncIntervalMinutes * 60 * 1000);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async onunload() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
    }
}
