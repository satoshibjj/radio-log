import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';

/** かんたん使い方ガイド */
export function GuidePage() {
  return (
    <>
      <PageHeader title="使い方ガイド" kicker="HOW TO" back />

      <section className="card guide-intro">
        <p>
          <strong>「また聴きたい！」と思った放送回だけを集めておく</strong>アプリです。全部の放送を記録する必要はありません。
        </p>
      </section>

      <ol className="guide-steps">
        <li className="card guide-step">
          <span className="guide-num">1</span>
          <div>
            <h2>番組を登録する（最初だけ）</h2>
            <p>
              下の<strong>「番組」</strong>→「＋新規」で番組名と放送局を入れます。いつもの出演者も入れておくと、次から自動で入ります。
            </p>
            <Link to="/programs/new" className="btn btn-small">
              番組を登録する
            </Link>
          </div>
        </li>
        <li className="card guide-step">
          <span className="guide-num">2</span>
          <div>
            <h2>また聴きたい回を追加する</h2>
            <p>
              真ん中の赤い<strong>「＋ 回を追加」</strong>から、番組と放送日を選び、なぜまた聴きたいかをメモします。
            </p>
          </div>
        </li>
        <li className="card guide-step">
          <span className="guide-num">3</span>
          <div>
            <h2>あとで見返す</h2>
            <p>
              <strong>「リピート帳」</strong>に日付順で並びます。出演者で絞り込んだり、🎲「おまかせ1本」で今日聴く回を決めたり、シェア画像にもできます。
            </p>
          </div>
        </li>
      </ol>

      <h2 className="section-title">下のボタンの意味</h2>
      <dl className="card guide-tabs">
        <dt>リピート帳</dt>
        <dd>追加した「また聴きたい回」の一覧（ホーム）</dd>
        <dt>番組</dt>
        <dd>記録するときに選ぶ番組の一覧</dd>
        <dt>＋ 回を追加</dt>
        <dd>また聴きたい回を1件追加</dd>
        <dt>出演者</dt>
        <dd>パーソナリティ・ゲストの名簿</dd>
        <dt>その他</dt>
        <dd>バックアップ（保存・復元）と、この使い方</dd>
      </dl>

      <h2 className="section-title">よくある質問</h2>
      <div className="guide-faq">
        <details className="card">
          <summary>番組や出演者を登録すると「お気に入り」になる？</summary>
          <p>
            なりません。「番組」と「出演者」は、回を追加するときに選ぶための<strong>名簿</strong>です。お気に入りとして残るのは、リピート帳に追加した放送回だけです。
          </p>
        </details>
        <details className="card">
          <summary>出演者が勝手に増えたのはなぜ？</summary>
          <p>
            回を追加するときに新しい名前を入力すると、次回から選べるように出演者の名簿にも追加されます。不要なら「出演者」から編集・削除できます（使われている人は削除できません）。
          </p>
        </details>
        <details className="card">
          <summary>番組の検索で出てこない番組がある</summary>
          <p>
            番組登録の「Podcast/番組を検索」は、<strong>Podcast で配信されている番組だけ</strong>が候補に出ます。radiko でしか聴けない番組などは出てこないので、番組名を手入力してください。一度登録すれば、次からは選ぶだけで済みます。
          </p>
        </details>
        <details className="card">
          <summary>同じ番組の別の週を追加できる？</summary>
          <p>できます。放送日が違えば別の回として保存されます。同じ番組・同じ放送日のときだけ確認が出ます。</p>
        </details>
        <details className="card">
          <summary>データはどこに保存される？</summary>
          <p>
            この端末のブラウザの中だけです。外部には送られません。機種変更やブラウザのデータ削除に備えて、ときどき「その他」→「JSONをダウンロード」で保存してください。
          </p>
        </details>
        <details className="card">
          <summary>ホーム画面に追加するには？</summary>
          <p>iPhone は Safari の共有ボタン →「ホーム画面に追加」、Android は Chrome のメニュー →「ホーム画面に追加」。電波がなくても使えます。</p>
        </details>
      </div>

      <div className="form-actions">
        <Link to="/" className="btn btn-primary btn-block btn-large">
          リピート帳へ
        </Link>
      </div>
    </>
  );
}
