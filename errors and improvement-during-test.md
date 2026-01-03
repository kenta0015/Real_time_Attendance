#　注意！！　 geoffence 機能に影響がありそうな変更は行わない！！もしくはブランチを分けて作業する ⚠️

## dev 機能を本番で出さないように

- サインインページの Dev っぽい表示
- history 画面
- profile 画面
- organize 画面

-Attendee 側でイベントの open details を開いた先の Dev 項目

##　不具合

- QR コードが読めない
- organizer がイベントを作るとき、時刻の入れ方が 2026-01-01T07:46:09 585Z などと打たないといけないので非常に不便（現在の時刻なら Use current local を押すと現在時刻が自動で表示されるという補完があるが）また、ロケーションを設定する際も軽度や緯度を打ち込まないといけないので、非常に面倒（こちらも(use current location で現在の地点のみは簡単に補完できるが)）

## 要改善

-イベント内の live(organizer)→Check-in Rank 名称変更
-Checkin list を open detail→check in list ではなく　 open detail bottun と横並びにさせる
-organize page の manage group をもう少し目立たせる
-password の打ち込みに show pass word などの’項目を作り、自分が打っているパスワードが正しいかどうか見れるようにする
-profile に写真を載せられるように → この写真を check in list にも反映できるようにする（現在 名前のみ ⇨ アップデート:小さめ顔写真 ➕ 名前。その欄を押すとその人のプロフィールが見えるように）
