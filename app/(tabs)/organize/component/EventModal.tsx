// app/(tabs)/organize/component/EventModal.tsx
import React from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { styles } from "../styles";

type Mode = "create" | "edit";

type Props = {
  visible: boolean;
  mode: Mode;
  eTitle: string; setETitle: (v: string) => void;
  eCategory: string; setECategory: (v: string) => void;
  eStart: string; setEStart: (v: string) => void;
  eEnd: string; setEEnd: (v: string) => void;
  eLocationName: string; setELocationName: (v: string) => void;
  eLat: string; setELat: (v: string) => void;
  eLng: string; setELng: (v: string) => void;
  eDesc: string; setEDesc: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

// === helpers ===
// Return ISO string for a *local* wall-clock time (y,m,d,hh,mm) regardless of timezone.
function isoAtLocal(y: number, m: number, d: number, hh: number, mm: number) {
  const dtLocal = new Date(y, m, d, hh, mm, 0, 0);
  const utc = new Date(dtLocal.getTime() - dtLocal.getTimezoneOffset() * 60000);
  return utc.toISOString();
}
function nowIsoPlus(minutes: number) {
  const t = new Date(Date.now() + minutes * 60 * 1000);
  return t.toISOString();
}
function todayParts() {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate(), hh: n.getHours(), mm: n.getMinutes() };
}
function addDays(y: number, m: number, d: number, add: number) {
  const t = new Date(y, m, d);
  t.setDate(t.getDate() + add);
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}

export default function EventModal(props: Props) {
  const {
    visible, mode,
    eTitle, setETitle,
    eCategory, setECategory,
    eStart, setEStart,
    eEnd, setEEnd,
    eLocationName, setELocationName,
    eLat, setELat,
    eLng, setELng,
    eDesc, setEDesc,
    onCancel, onSave,
  } = props;

  // Presets — always future, correct for timezone
  const applyNow1h = () => {
    setEStart(nowIsoPlus(5));   // 5分後
    setEEnd(nowIsoPlus(65));    // +60分
  };

  const applyTonight = () => {
    const { y, m, d, hh } = todayParts();
    // 今日19時、過ぎていれば明日19-20時
    const base = hh >= 19 ? addDays(y, m, d, 1) : { y, m, d };
    const startISO = isoAtLocal(base.y, base.m, base.d, 19, 0);
    const endISO   = isoAtLocal(base.y, base.m, base.d, 20, 0);
    setEStart(startISO);
    setEEnd(endISO);
  };

  const applyTomorrowMorning = () => {
    const { y, m, d } = todayParts();
    const tmr = addDays(y, m, d, 1);
    const startISO = isoAtLocal(tmr.y, tmr.m, tmr.d, 9, 0);
    const endISO   = isoAtLocal(tmr.y, tmr.m, tmr.d, 10, 0);
    setEStart(startISO);
    setEEnd(endISO);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{mode === "create" ? "Create Event" : "Edit Event"}</Text>

          {/* Quick presets */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <TouchableOpacity style={styles.outlineBtn} onPress={applyNow1h}>
              <Text style={styles.outlineBtnText}>Now +1h</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={applyTonight}>
              <Text style={styles.outlineBtnText}>Tonight 19–20</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={applyTomorrowMorning}>
              <Text style={styles.outlineBtnText}>Tomorrow 9–10</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={eTitle} onChangeText={setETitle} placeholder="e.g., Saturday Park Run" />

            <Text style={styles.label}>Category</Text>
            <TextInput style={styles.input} value={eCategory} onChangeText={setECategory} placeholder="e.g., Running" />

            <Text style={styles.label}>Start Time (ISO)</Text>
            <TextInput style={styles.input} value={eStart} onChangeText={setEStart} placeholder="YYYY-MM-DDTHH:mm:ssZ" />

            <Text style={styles.label}>End Time (ISO)</Text>
            <TextInput style={styles.input} value={eEnd} onChangeText={setEEnd} placeholder="YYYY-MM-DDTHH:mm:ssZ" />

            <Text style={styles.label}>Location Name</Text>
            <TextInput style={styles.input} value={eLocationName} onChangeText={setELocationName} placeholder="e.g., Albert Park" />

            <Text style={styles.label}>Latitude</Text>
            <TextInput style={styles.input} value={eLat} onChangeText={setELat} keyboardType="numeric" placeholder="-37.8460" />

            <Text style={styles.label}>Longitude</Text>
            <TextInput style={styles.input} value={eLng} onChangeText={setELng} keyboardType="numeric" placeholder="144.9780" />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              value={eDesc}
              onChangeText={setEDesc}
              placeholder="Event details..."
              multiline
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.outlineBtn} onPress={onCancel}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
