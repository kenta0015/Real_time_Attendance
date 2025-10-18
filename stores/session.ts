import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rta_guest_id";

function uuidv4() {
  // 依存なしの簡易UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getGuestId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const id = uuidv4();
  await AsyncStorage.setItem(KEY, id);
  return id;
}



