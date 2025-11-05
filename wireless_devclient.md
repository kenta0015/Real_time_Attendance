# Android Development Client Runbook (Physical Device, No Emulator)

> Assumption: The development client (your custom build) is **already installed** on the Android device.

---

## 0) Connect the device (choose one)

### A. Wireless debugging (recommended)

1. On device: **Settings → Developer options → Wireless debugging → Pair device with pairing code**  
   Note the **IP:PAIR_PORT**, **pairing code**, and **IP:PORT** (for connection).

2. On PC (PowerShell):

```powershell
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb kill-server; & $adb start-server
& $adb pair 192.168.xxx.xxx:xxxx
& $adb connect 192.168.xxx.xxx:xxxx (IP adress&portを使う)
& $adb devices -l  # should show: your-device  device
```

### B. USB

- On device: **Developer options → USB debugging ON**  
  Revoke USB debugging authorizations once → reconnect USB → **Allow** the RSA prompt.
- Notification shade: set USB mode to **File transfer (MTP)**.
- Windows **Device Manager**: if ADB shows a warning, install **Google USB Driver** or your vendor’s driver.
- Verify:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

---

## 1) Start Metro (development server)

```powershell
cd "C:\Users\User\Downloads\Real_time_attendance\rta-zero_restored"
npx expo start --dev-client --tunnel
```

- Keep this terminal running. The QR/connection URL shown here will be used by the dev client.

---

## 2) Connect the Dev Client to Metro

- In the Dev Client, **Scan the QR** shown in the Metro terminal, **or**
- Choose **Enter URL manually** and paste the connection URL printed by Metro (`--tunnel` is most reliable on mixed networks).

Once connected, the app will load from your local server.

---

## 3) Open specific screens via Deep Link (now targets the device)

```powershell
# Make sure ADB sees your device
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l

# (Optional) pin the first connected device as the default for CLI tools
$serial = (& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices | Select-String "device$" | % { ($_ -split "\s+")[0] } | Select -First 1)
$env:ANDROID_SERIAL = $serial

# Deep links
npx uri-scheme open "rta://join" --android
or
& $adb -s $serial shell am start -a android.intent.action.VIEW -d "rta://join"
npx uri-scheme open "rta://organize/location-test" --android
```

---

---

## If it still opens an emulator

- ADB does not detect your device. Re-run **Section 0** (Wireless debugging or USB), then repeat **Sections 1–4**.
