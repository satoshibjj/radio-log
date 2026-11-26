# Radio Log — リピートしたいラジオ回ログ

また聴き返したいラジオの放送回だけを厳選してストックする、個人用の PWA です。
放送日順・番組別・出演者別（AND 絞り込み）で見返せます。

公開URL: https://satoshibjj.github.io/radio-log/

- **サーバー不要**：データはブラウザの IndexedDB（この端末内）にのみ保存されます。外部送信はしません。
- **オフライン対応**：ホーム画面に追加するとアプリとして起動でき、電波がなくても使えます。
- **並び替え**：リピート帳は 新しい順／古い順／番組ごと（見出し付き）／追加した順。
- **入力補助（任意）**：番組名は iTunes Search API（Apple Podcasts にある番組のみ。radiko のみ・Spotify 独占配信の番組等は手入力）、人名は Wikipedia から候補を検索できます（無料・APIキー不要）。番組名は入力に合わせて自動で候補表示（検索語のみ送信）、人名はボタンを押した時だけ検索します。記録データは送信しません。放送局は主要局のチップからワンタップで選べます。
- **見返す楽しみ**：🎲「おまかせ1本」でランダムに1回を選出、詳細画面から1回分、リピート帳から表示中の上位5件をシェア用PNG画像（1080×1350）にして保存・共有できます。
- **ホーム**：アプリの紹介・すぐやる操作（追加／おまかせ）・最近の回・使い方ガイド・バックアップをまとめた入口画面。
- **バックアップ**：ホームの「データのバックアップ」→「バックアップを送る」でスマホの共有画面から Gmail（自分宛て）・LINE Keep・Google ドライブ等へ保管。14日バックアップしていないとリピート帳でお知らせします。復元は同画面からファイル（.json / .txt）を読み込み（置き換え）。

## 設計ドキュメント

- [ユーザーストーリーマップ](docs/user-story-map.md) — 誰が何をするか、実装済み／バックログ、やらないと決めたこと
- [システム要求仕様](docs/system-requirements.md) — 画面・機能要求・データ設計・外部連携・非機能要求・意思決定の記録
- [CLAUDE.md](CLAUDE.md) — Claude と開発を続けるときの前提・ルール

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
  pages/     HomePage（ホーム）/ S1 LogListPage（リピート帳）/ S2 ProgramListPage / S3 ProgramDetailPage / S4 ProgramFormPage
             S5 LogFormPage / S6 LogDetailPage / S7 DataPage（バックアップ）/ PersonsPage（出演者）
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
