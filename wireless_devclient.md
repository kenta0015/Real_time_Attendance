Wireless接続（ADB over Wi-Fi）

前提：PCと端末は同じWi-Fi。端末は Settings → System → Developer options → Wireless debugging を ON。

端末で Wireless debugging を開き、最初に出る「Allow wireless debugging on this network」は Allow。

Pair device with pairing code を押して、
　画面に出た Pairing code と IP:Port(ペアリング用) を控える。

PC（PowerShell）で実行：

$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb start-server
& $adb pair <PAIR_IP:PAIR_PORT> <PAIRING_CODE>

　→ “Successfully paired …” が出ればOK。4) 同じ画面の IP address & Port（※ペアリング用とは別のポート）を使って接続：

& $adb connect <DEVICE_IP:PORT>
& $adb devices    # device と表示されれば接続完了
$SER="<DEVICE_IP:PORT>" # 以降のショートカット

🔧トラブル時

「wireless unsuccess」：Wireless debugging をOFF→ON、再ペアリング。

「more than one device/emulator」：コマンドに -s $SER を付ける。

ADB不調：& $adb kill-server → & $adb start-server。

接続が切れやすい：端末の Stay awake（充電中スリープしない） をONに。

Dev Client（開発ビルド）で起動する

上の Wireless 接続を済ませる（またはUSB）。

プロジェクトで実行：

$env:EXPO_NO_ANDROID_EMULATOR="1" # 実機だけにする（任意）
npx expo run:android -d # 初回はビルドに時間がかかります

　→ 端末で開いた “RTA Dev” が Metro に繋がり、JS変更は即時リロード。3) 自作スキームで画面を開く（例）：

& $adb -s $SER shell am start -a android.intent.action.VIEW -d "rta://home"
& $adb -s $SER shell am start -a android.intent.action.VIEW -d "rta://join?token=TEST123"

（または npx uri-scheme open "rta://home" --android）

💡ビルドが不安定なとき

cd android; .\gradlew clean; cd ..

ポート衝突は CLI の質問で別ポートを選べばOK。

Dev Client と Expo Go と 本番ビルド の違い

Expo Go

既成の汎用アプリ。使えるネイティブモジュールが限定。

JSだけで動く検証が速い。自作URLスキームや多くのネイティブ連携は不可。

Dev Client（開発ビルド / expo run:\*）

あなたのネイティブ依存（app.json の plugins/permissions など）を組み込んだ専用アプリ。

Metro に接続してホットリロード、デバッグメニューも使える。

ネイティブを変えた時だけ再ビルドが必要（時間がかかるのはこのとき）。

本番ビルド（Release APK/AAB）

JSはバンドルされオフラインで動作、デバッグ機能なし、パフォーマンス最適化。

ストア提出/配布用。動作確認は --variant release などで。

よく使うチートシート

# ADB

& $adb devices
& $adb connect <ip:port>
& $adb kill-server; & $adb start-server

# 深いリンクで起動

& $adb -s $SER shell am start -a android.intent.action.VIEW -d "rta://organize"

# Expo

npx expo run:android -d
cd android; .\gradlew clean; cd ..

これで再接続・再起動・ディープリンクまで一通り自走できます。
