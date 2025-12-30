# あなたが追加で挙げた 4 点＋ PDF 項目の「審査に通す優先順位」

## 最優先（テスト中に直す価値が高い＝審査で“機能不全”に見える/データ不整合）

### 新規ユーザー登録後に Unmatched Route（画面遷移が壊れる）　　（DONE！！）

→ “普通に使えない”は一番危険。

### 新規 Attendee が、Organizer が作ったグループ全てに勝手に所属している　　（Done！！）

→ 仕様バグに見えるだけでなく、アクセス制御/プライバシー的にまずい印象になりやすい。

### チェックイン後、Organizer 側の Check-in list で名前が No name 　（DONE！！）

→ コア機能の信頼性に直撃（アカウント/プロフィールの必須データ欠落に見える）。

## 中優先（審査というより“Production access 申請・印象”に効きやすい）

### Play ストアのスクショ改善（機能が伝わる）

→ フィードバックを参考に

### ASO：説明文を具体化（何ができるアプリか明確に）

→ フィードバックを参考に

（この 2 つは「審査で必須」ではないけど、公開申請の“完成度”としては効きます）

## 低優先（後回しで OK）

1.プロフィール写真（体験向上だが、審査ブロッカーではない）

2.オンボーディング、Google Sign-in、パスワード表示切替
（あると良いが、今の局面で“やり直しリスク”を増やしてまで最優先ではない）

3.Attendee の Join a Group（History 画面）をモダールなどで出現にする（今のままだとグループが見えにくい、メインはグループの情報だけを見るようにしたい）

4.organizer 側で event を作るとき、時間、場所への記入が不便

5.ログイン画面の整理と（余計な項目が結構ある）パスワードを打つとき、Show Password などの欄を作り、ユーザーがパスワードの打ち間違いなどを確認できるようにする



## Screenshots

**Organizer – event dashboard & history**

![Organizer event history](screenshots/01-organizer-history.png)

**Organizer – create geofenced event**

![Create event](screenshots/02-create-event.png)

**Organizer – show rotating QR code for check-in**

![Show QR code](screenshots/03-show-qr.png)

**Attendee – event detail with GPS check-in**

![Attendee event detail](screenshots/04-attendee-event-detail.png)

**Attendee – personal attendance history**

![Attendee history](screenshots/05-attendee-history.png)
