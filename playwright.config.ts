import { defineConfig } from '@playwright/test';

/**
 * E2E テスト（GitHub Actions でデプロイ前に実行）
 * - 既定：`npm run build` 済みの dist を `vite preview` で配信してテスト
 * - E2E_BASE_URL を指定すると、そのURLに対してテスト（サーバーは起動しない）
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? 'http://localhost:4173/radio-log/';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    baseURL,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    // Service Worker のキャッシュがテストに影響しないように
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
