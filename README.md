# Radio Log — リピートしたいラジオ回ログ

また聴き返したいラジオの放送回だけを厳選してストックする、個人用の PWA です。
放送日順・番組別・出演者別（AND 絞り込み）で見返せます。

公開URL: https://musclestrong1.github.io/radio-log/

- **サーバー不要**：データはブラウザの IndexedDB（この端末内）にのみ保存されます。外部送信はしません。
- **オフライン対応**：ホーム画面に追加するとアプリとして起動でき、電波がなくても使えます。
- **入力補助（任意）**：番組名は iTunes Search API、人名は Wikipedia から候補を検索できます（無料・APIキー不要）。検索ボタンを押した時だけ検索語を送信し、記録データは送信しません。放送局は主要局のチップからワンタップで選べます。
- **見返す楽しみ**：🎲「おまかせ1本」でランダムに1回を選出、詳細画面からシェア用PNG画像（1080×1350）を作成・共有できます。
- **使い方ガイド**：アプリ内の「？使い方」からいつでも確認できます。
- **バックアップ**：「データ」画面から JSON エクスポート／インポート（置き換え）ができます。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173/radio-log/
npm run build    # 型チェック + 本番ビルド（dist/）
npm run preview  # ビルド結果の確認（Service Worker も動作）
```

## 技術構成

- React 19 + TypeScript + Vite / `vite-plugin-pwa`
- ルーティング：`HashRouter`（GitHub Pages のサブパス配信で 404 を回避）
- IndexedDB：型安全な自前ラッパー（`src/db/idb.ts`）、DB 名 `radio_log_db`

```
src/
  db/        types.ts（型）/ idb.ts（DB接続・トランザクション）/ repo.ts（CRUD・整合性）/ backup.ts（JSON入出力）
  state/     DataContext.tsx（全データのスナップショットと再読込）
  components/ Layout, PersonPicker, PersonListEditor, LogCard, UiProvider（確認ダイアログ・トースト）, UpdateBanner
  pages/     S1 LogListPage（リピート帳）/ S2 ProgramListPage / S3 ProgramDetailPage / S4 ProgramFormPage
             S5 LogFormPage / S6 LogDetailPage / S7 DataPage（その他）/ PersonsPage（出演者）/ GuidePage
  lib/       shareImage.ts（Canvas でシェア画像描画）/ external.ts（iTunes・Wikipedia 検索）/ suggest.ts など
```

### データ整合性

- リピート回の保存・削除は `episodeLogs` と `episodeAppearances` を同一トランザクションで処理
- 参照されている人物（番組の基本パーソナリティ／出演）は削除をブロックし、参照元を表示
- リピート回が残っている番組は削除をブロック
- インポートは全ストアの消去と投入を 1 トランザクションで実行（失敗時は元データを保持）

## デプロイ

`main` への push で GitHub Actions（`.github/workflows/deploy.yml`）がビルドし、GitHub Pages に公開します。
初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。

## プライバシー

このリポジトリには個人の聴取データは含まれていません。エクスポートしたバックアップ（`radio-log-backup-*.json`）は `.gitignore` 済みです。
