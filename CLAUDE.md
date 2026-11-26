# CLAUDE.md — radio-log

ラジオの「また聴きたい回」をストックする個人用 PWA。React + TypeScript + Vite、データは端末の IndexedDB のみ。
公開：https://satoshibjj.github.io/radio-log/ （`main` に push すると GitHub Actions が自動デプロイ）

## 最初に読むもの

- `docs/user-story-map.md` — 誰が何をするか、実装済み／バックログ、やらないと決めたこと
- `docs/system-requirements.md` — 画面・機能要求（FR-…）・データ設計（DR-…）・外部連携・非機能・意思決定の記録
- `README.md` — 利用者向けの概要

相談や変更の依頼では、上記の ID（例：FR-5-3、DR-2）や USM のストーリーで話すと早い。

## 守ること

- **無料・合法のみ**：有料サービス、独自ドメイン、API キーや秘密情報が必要な連携は入れない（公開リポジトリのため鍵を置けない）。
- **個人情報を入れない**：コード・テスト・ドキュメント・サンプルに実在の個人情報や聴取ログを含めない。例は「架空〜」で作る。
- **データは端末内のみ**：外部に送ってよいのは検索語だけ（docs/system-requirements.md 7 章）。
- **整合性**：回の保存・削除、インポートは 1 トランザクション。参照中の人物・番組は削除ブロック。
- **スキーマ変更**：`src/db/idb.ts` の `DB_VERSION` を上げて `upgrade()` に移行処理を追加し、バックアップの検証（`src/db/backup.ts`）も合わせる。既存のバックアップ JSON を壊さない。
- **UI 文言**：日本語。用語は「リピート帳」「また聴きたい回」「回を追加」「番組」「出演者」に統一。スマホ片手操作（タップ 44px 以上、主要操作は下部）。
- **利用者は主にスマホから操作**：手順を案内するときは GitHub の Web 画面やスマホでできる方法を優先する。

## 開発コマンド

```bash
npm install
npm run dev        # http://localhost:5173/radio-log/ （アイコン生成→Vite）
npm run build      # アイコン生成 → tsc --noEmit → vite build
npm run preview
```

## 変更したら

1. `npm run build` が通ること（または Actions が緑になること）を確認する。
2. 機能を足したり変えたりしたら、`docs/user-story-map.md`（状態・リリース）と `docs/system-requirements.md`（該当 FR/DR・意思決定の記録・最終更新日）を更新する。
3. コミットメッセージは変更内容が分かる英語の一文＋日本語の箇条書きでよい。
