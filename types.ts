// types.ts

export interface Event {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  start_time: string; // ISO8601形式などの日時文字列
  end_time: string;
  group_id: string;
}

export interface GroupMembership {
  id: string;
  user_id: string;
  group_id: string;
  created_at?: string; // 任意で追加、Supabaseの自動生成カラム対応
}

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  organizer_id: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  // 他に必要なカラムがあれば追加
}
