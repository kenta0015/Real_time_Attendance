// app/attend/scan.tsx
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Platform } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

type TokenKind = "join" | "checkin";

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseScannedPayload(rawInput: string): { kind: TokenKind; token: string } | null {
  const raw = String(rawInput ?? "").trim();

  // URL form
  try {
    const u = new URL(raw);
    const tokenParam = u.searchParams.get("token");
    const token = tokenParam ? safeDecode(tokenParam) : null;
    if (token) {
      const parts = token.split("|");
      if (parts.length === 5) return { kind: "checkin", token };
      return { kind: "join", token };
    }
  } catch {
    // not a URL
  }

  // Raw token
  if (raw.startsWith("v1|")) {
    const parts = raw.split("|");
    if (parts.length === 5) return { kind: "checkin", token: raw };
    return { kind: "join", token: raw };
  }

  // Encoded raw token
  if (raw.includes("%7C") || raw.includes("%7c")) {
    const decoded = safeDecode(raw);
    if (decoded.startsWith("v1|")) {
      const parts = decoded.split("|");
      if (parts.length === 5) return { kind: "checkin", token: decoded };
      return { kind: "join", token: decoded };
    }
  }

  return null;
}

export default function AttendScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    if (!permission || permission.status !== "granted") {
      requestPermission().catch(() => {});
    }
  }, [permission, requestPermission]);

  const handleScanned = useCallback(
    (result: any) => {
      if (!isScanning) return;
      setIsScanning(false);

      const data = String(result?.data ?? "");
      const parsed = parseScannedPayload(data);

      if (!parsed) {
        Alert.alert(
          "Invalid QR",
          "This QR is not supported. Expecting a join or check-in token.",
          [
            { text: "Scan Again", onPress: () => setIsScanning(true) },
            { text: "Close", style: "cancel", onPress: () => router.back() },
          ]
        );
        return;
      }

      if (parsed.kind === "checkin") {
        router.push({ pathname: "/attend/checkin", params: { token: parsed.token } });
        return;
      }

      router.push({ pathname: "/join", params: { token: parsed.token } });
    },
    [isScanning, router]
  );

  if (!permission || permission.status === "undetermined") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.msg}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.msg}>Please grant camera permission in system settings and reopen this screen.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.header}>Scan Event QR</Text>
      <View style={styles.scannerBox}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={isScanning ? handleScanned : undefined}
        />
      </View>

      <Text style={styles.tip}>
        Point the camera at the event QR.{"\n"}
        {Platform.OS === "android" ? "If nothing happens, move closer or brighten the screen." : "If nothing happens, move closer or increase brightness."}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => router.back()}>
          <Text style={[styles.btnText, styles.btnOutlineText]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => setIsScanning(true)}>
          <Text style={styles.btnText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const BOX = 280;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  scannerBox: {
    width: BOX,
    height: BOX,
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#2563EB",
    backgroundColor: "#000",
  },
  tip: { textAlign: "center", marginTop: 12, color: "#4B5563" },
  row: { flexDirection: "row", gap: 12, justifyContent: "center", marginTop: 16 },
  btn: { backgroundColor: "#2563EB", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: "center" },
  btnText: { color: "white", fontWeight: "700" },
  btnOutline: { backgroundColor: "transparent", borderWidth: 2, borderColor: "#2563EB" },
  btnOutlineText: { color: "#2563EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  msg: { color: "#4B5563", marginTop: 8, textAlign: "center" },
});
