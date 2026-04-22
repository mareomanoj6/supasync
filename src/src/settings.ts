import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { SupabaseSync, SupabaseSyncSettings } from './supabase-client';

export class SyncSettingsTab extends PluginSettingTab {
    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const settings = this.plugin.settings;
        this.containerEl.empty();

        new Setting(this.containerEl)
            .setName('Project url')
            .setDesc('Your Supabase project URL (e.g. https://xyz.supabase.co)')
            .addText(text => text
                .setValue(settings.projectUrl)
                .onChange(async (value) => {
                    settings.projectUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName('Anon key')
            .setDesc('Your Supabase anon/public key')
            .addText(text => text
                .setValue(settings.anonKey)
                .onChange(async (value) => {
                    settings.anonKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName('Bucket name')
            .setDesc('The name of the Supabase Storage bucket')
            .addText(text => text
                .setValue(settings.bucketName)
                .onChange(async (value) => {
                    settings.bucketName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName('Conflict folder name')
            .setDesc('Folder where conflict files will be stored')
            .addText(text => text
                .setValue(settings.conflictFolderName)
                .onChange(async (value) => {
                    settings.conflictFolderName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName('Auto sync')
            .setDesc('Automatically push changes to Supabase')
            .addToggle(toggle => toggle
                .setValue(settings.autoSyncEnabled)
                .onChange(async (value) => {
                    settings.autoSyncEnabled = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAutoSync();
                }));

        new Setting(this.containerEl)
            .setName('Auto sync interval')
            .setDesc('Sync interval in minutes')
            .addText(text => text
                .setValue(settings.autoSyncIntervalMinutes.toString())
                .onChange(async (value) => {
                    settings.autoSyncIntervalMinutes = parseInt(value) || 15;
                    await this.plugin.saveSettings();
                    this.plugin.updateAutoSync();
                }));

        new Setting(this.containerEl)
            .setName('Device id')
            .setDesc('Unique identifier for this device')
            .addText(text => text
                .setValue(settings.deviceId)
                .setDisabled(true));

        new Setting(this.containerEl)
            .addButton(btn => btn
                .setButtonText('Test Connection')
                .onClick(async () => {
                    try {
                        if (!settings.projectUrl || !settings.anonKey) {
                            new Notice('Please enter Project URL and Anon Key first.');
                            return;
                        }
                        const supabase = new SupabaseSync(settings);
                        const success = await supabase.testConnection();
                        if (success) {
                            new Notice('Connection successful!');
                        } else {
                            new Notice('Connection failed. Please check your settings.');
                        }
                    } catch (e: any) {
                        new Notice(`Connection error: ${e.message}`);
                    }
                }));
    }
}
