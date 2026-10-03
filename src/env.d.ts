declare const __WIKSTER_BUILD__: { sha: string; at: number } | undefined;

interface Window {
  WiksterIcon?: { setIcon(id: string): void };
  __wikster?: Record<string, unknown>;
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: any;
  wiksterSteam?: any;
  wiksterBack?: () => boolean;
  wiksterPushToken?: (token: string) => void;
  wiksterStoreReady?: (json: string) => void;
  wiksterPurchase?: (json: string) => void;
  wiksterAdDone?: (json: string) => void;
  __wiksterErrors?: boolean;
  WiksterBack?: any;
  WiksterHaptics?: any;
  WiksterShare?: any;
  WiksterPush?: any;
  WiksterCrash?: any;
  WiksterBilling?: any;
  WiksterAds?: any;
}
