import { Link } from 'react-router-dom';

/** かんたん使い方ガイド（ホーム画面に埋め込み） */
export function GuideContent() {
  return (
    <>

      <ol className="guide-steps">
        <li className="card guide-step">
          <span className="guide-num">1</span>
          <div>
            <h2>番組を登録する（最初だけ）</h2>
            <p>
              下の<strong>「番組」</strong>→「＋新規」で番組名を入れると候補が出るので選び、放送局をタップします。YouTube なら動画の URL を貼るとチャンネル名を入力でき、配信元は「YouTube」などをタップします。いつもの出演者も入れておくと、次から自動で入ります。
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
              真ん中の赤い<strong>「＋ 回を追加」</strong>から、番組と放送・配信日を選び、なぜまた聴きたいかをメモします。radiko・Spotify・YouTube などのリンクを貼っておくと、あとで1タップで開けます（日付・リンクはどちらも任意）。
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

      <h3 className="guide-sub">下のボタンの意味</h3>
      <dl className="card guide-tabs">
        <dt>ホーム</dt>
        <dd>この画面。使い方・最近の回・バックアップ</dd>
        <dt>リピート帳</dt>
        <dd>追加した「また聴きたい回」の一覧（絞り込み・並び替え・おまかせ）</dd>
        <dt>＋ 回を追加</dt>
        <dd>また聴きたい回を1件追加</dd>
        <dt>番組</dt>
        <dd>記録するときに選ぶ番組の一覧</dd>
        <dt>出演者</dt>
        <dd>パーソナリティ・ゲストの名簿</dd>
      </dl>

      <h3 className="guide-sub">よくある質問</h3>
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
          <summary>番組名の候補に出てこない番組がある</summary>
          <p>
            番組名を入力すると出る候補は、<strong>Apple Podcasts にある番組だけ</strong>が候補に出ます。radiko でしか聴けない番組や、Spotify 独占配信の番組（オールナイトニッポンの一部など）は Spotify で聴けても出てこないので、番組名を手入力してください。一度登録すれば、次からは選ぶだけで済みます。
          </p>
        </details>
        <details className="card">
          <summary>同じ番組の別の週を追加できる？</summary>
          <p>できます。放送日が違えば別の回として保存されます。同じ番組・同じ放送日のときだけ確認が出ます（日付なしの回は確認しません）。</p>
        </details>
        <details className="card">
          <summary>YouTube の動画や配信のアーカイブも記録できる？</summary>
          <p>
            できます。チャンネルを「番組」として登録し（配信元は「YouTube」など）、回を追加するときに動画の URL を貼ります。「YouTube から題名を取得」を押すと題名がリンクの表示名に入ります（押した時だけ、貼った URL を YouTube に送ります）。日付が分からなければ「日付なし」で保存でき、リピート帳の最後にまとまります。
          </p>
        </details>
        <details className="card">
          <summary>radiko のリンクが開けなくなった</summary>
          <p>radiko のタイムフリーは放送後おおむね1週間で聴けなくなります。聴けなくなっても記録はそのまま残ります。Podcast や YouTube で配信されていれば、そのリンクを追加しておくと便利です。</p>
        </details>
        <details className="card">
          <summary>データはどこに保存される？</summary>
          <p>
            この端末のブラウザの中だけです。外部には送られません（候補検索の言葉と、題名を取得するときの YouTube の URL だけは各サービスに送られます）。機種変更やブラウザのデータ削除に備えて、ときどきホームの<strong>「データのバックアップ」</strong>→「バックアップを送る」で、メール（自分宛て）・LINE の Keep・Google ドライブなどに保管してください。14日たつとリピート帳でお知らせします。
          </p>
        </details>
        <details className="card">
          <summary>機種変更したら？</summary>
          <p>
            古いスマホでホームの「データのバックアップ」→「バックアップを送る」で自分宛てなどに送り、新しいスマホでそのファイルを保存してから、同じ画面の「バックアップファイルを選択」で読み込みます。
          </p>
        </details>
        <details className="card">
          <summary>ホーム画面に追加するには？</summary>
          <p>iPhone は Safari の共有ボタン →「ホーム画面に追加」、Android は Chrome のメニュー →「ホーム画面に追加」。電波がなくても使えます。</p>
        </details>
      </div>

    </>
  );
}
