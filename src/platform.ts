import { Platform } from 'obsidian';

export const isDesktop = Platform.isDesktop;
export const isMobile = Platform.isMobile;
export const isIosApp = Platform.isIosApp;
export const isMacApp = Platform.isMacApp;

export interface RealtimeClientOptions {
  timeout: number;
  heartbeatIntervalMs: number;
}

export class PlatformHelper {
  static getRealtimeConfig(): Partial<RealtimeClientOptions> {
    if (isMobile) {
      return { timeout: 30000, heartbeatIntervalMs: 20000 };
    }
    return { timeout: 15000, heartbeatIntervalMs: 10000 };
  }

  static shouldDeferHeavySync(): boolean {
    return isMobile;
  }

  static getDebounceMs(userSetting: number): number {
    if (isMobile) {
      return Math.max(userSetting, 4000);
    }
    return userSetting;
  }

  static canUseBackgroundSync(): boolean {
    return false; // Obsidian mobile does not expose background execution
  }

  static getMaxBatchSize(): number {
    return isMobile ? 20 : 50;
  }
}
