import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { Platform } from 'obsidian';
import { supabaseManager } from './supabase';

export interface PluginSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  deviceId: string;
  syncEnabled: boolean;
  excludePatterns: string;
  debounceMs: number;
  session?: any;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  deviceId: '',
  syncEnabled: false,
  excludePatterns: '.obsidian/*,*.canvas',
  debounceMs: 2500,
};

export class SupaSyncSettingsTab extends PluginSettingTab {
  plugin: any; // The plugin instance

  constructor(app: App, plugin: any) {
    super(app);
    this.plugin = plugin;
    this.plugin.settings = this.plugin.loadData() || { ...DEFAULT_SETTINGS };
  }

  display(): void {
    const { settings } = this.plugin;

    const sUrl = new Setting('supabaseUrl')
      .setName('Supabase url')
      .setDesc('Your Supabase project URL (https://xxx.supabase.co)')
      .addText(text => text
        .setPlaceholder('https://your-project.supabase.co')
        .setValue(settings.supabaseUrl)
        .onChange(async (value) => {
          settings.supabaseUrl = value;
          await this.plugin.saveData(settings);
          this.plugin.updateSupabaseClient();
        }));

    const sKey = new Setting('supabaseAnonKey')
      .setName('Anon key')
      .setDesc('Your Supabase anonymous API key')
      .addText(text => text
        .setPlaceholder('Enter your anon key')
        .setValue(settings.supabaseAnonKey)
        .onChange(async (value) => {
          settings.supabaseAnonKey = value;
          await this.plugin.saveData(settings);
          this.plugin.updateSupabaseClient();
        }));

    const sEnabled = new Setting('syncEnabled')
      .setName('Sync enabled')
      .setDesc('Enable automatic synchronization between vault and Supabase')
      .addToggle(toggle => toggle
        .setValue(settings.syncEnabled)
        .onChange(async (value) => {
          settings.syncEnabled = value;
          await this.plugin.saveData(settings);
          if (value) {
            this.plugin.startSync();
          } else {
            this.plugin.stopSync();
          }
        }));

    const sExclude = new Setting('excludePatterns')
      .setName('Exclude patterns')
      .setDesc('Comma-separated globs of files to ignore')
      .addText(text => text
        .setValue(settings.excludePatterns)
        .onChange(async (value) => {
          settings.excludePatterns = value;
          await this.plugin.saveData(settings);
        }));

    const sDebounce = new Setting('debounceMs')
      .setName('Debounce delay (ms)')
      .setDesc('Delay before syncing local changes to remote')
      .addText(text => text
        .setValue(settings.debounceMs.toString())
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          settings.debounceMs = isNaN(num) ? 2500 : num;
          await this.plugin.saveData(settings);
        }));

    const sTest = new Setting('testConnection')
      .setName('Connection test')
      .addButton(btn => btn
        .setButtonText('Test connection')
        .setCid('test-conn')
        .setWarning()
        .onClick(async () => {
          try {
            await supabaseManager.testConnection();
            new Notice('Supabase connection successful!');
          } catch (e: any) {
            new Notice('Connection failed: ' + (e.message || 'Unknown error'));
          }
        }));

    const sAuth = new Setting('auth')
      .setName('Authentication')
      .setDesc('Secure your vault with Supabase Auth (Required for RLS)')
      .addButton(btn => btn
        .setButtonText('Login with OAuth')
        .onClick(async () => {
          try {
            const url = await supabaseManager.initiateOAuth();
            if (url) {
              window.open(url, '_blank');
              new Notice('Login window opened. Please copy the code from the redirect page.');
            }
          } catch (e: any) {
            new Notice('OAuth error: ' + e.message);
          }
        }));

    const sVerify = new Setting('verifyAuth')
      .setName('Verify login code')
      .addText(text => text
        .setPlaceholder('Paste the code from the browser here')
        .onChange(async (value) => {
          if (value.length < 5) return;
          try {
            const session = await supabaseManager.exchangeCodeForSession(value);
            settings.session = session;
            await this.plugin.saveData(settings);
            new Notice('Authentication successful!');
          } catch (e: any) {
            new Notice('Verification failed: ' + e.message);
          }
        }));

    this.containerEl.addChild(sUrl.setting);
    this.containerEl.addChild(sKey.setting);
    this.containerEl.addChild(sEnabled.setting);
    this.containerEl.addChild(sExclude.setting);
    this.containerEl.addChild(sDebounce.setting);
    this.containerEl.addChild(sTest.setting);
    this.containerEl.addChild(sAuth.setting);
    this.containerEl.addChild(sVerify.setting);

    if (Platform.isMobile) {
      const mobileInfo = this.containerEl.createEl('div', { cls: 'supabase-sync-banner' });
      mobileInfo.text('On iOS/Android, sync runs while the app is open. Changes made on other devices will appear next time you open this app.');
    }

    const securityWarning = this.containerEl.createEl('div', { cls: 'supabase-sync-security-warning' });
    securityWarning.text('⚠️ data.json contains your API key. Do not commit it to version control.');
  }
}
