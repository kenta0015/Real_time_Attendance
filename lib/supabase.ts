// ポリフィル（URL/UUID）を最速で読み込む：supabase より前
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";

import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON!;

export const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});
