import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Role = Profile['role']; // 'attendee' | 'organizer'

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Role
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;

  // Phase 0.2: dev用ロール切替（実体はSupabase更新）
  setRole: (role: Role) => Promise<{ error: string | null }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const user = session.user;
      // プロファイル取得
      const { data: prof, error: selErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // 無い or role欠落 → upsert（Phase 0.1）
      if (!prof || !prof.role) {
        const upsertPayload: Database['public']['Tables']['profiles']['Insert'] = {
          id: user.id,
          email: user.email ?? '',
          full_name: user.user_metadata?.full_name ?? null,
          role: 'attendee', // デフォルト
        };
        const { data: upserted, error: upErr } = await supabase
          .from('profiles')
          .upsert(upsertPayload)
          .select('*')
          .single();

        set({ user, profile: upserted ?? null, loading: false });
      } else {
        set({ user, profile: prof, loading: false });
      }
    } else {
      set({ user: null, profile: null, loading: false });
    }

    // リスナーでセッション変化を反映
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        set({ user: session.user, profile });
      } else {
        set({ user: null, profile: null });
      }
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // ログイン直後もプロフィールを確実化
    await get().initialize();
    return { error: null };
    },

  signUp: async (email, password, fullName, role) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message };

    const user = data.user;
    if (user) {
      const insPayload: Database['public']['Tables']['profiles']['Insert'] = {
        id: user.id,
        email,
        full_name: fullName ?? null,
        role: role || 'attendee',
      };
      await supabase.from('profiles').upsert(insPayload);
    }

    await get().initialize();
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  setRole: async (role) => {
    const { user } = get();
    if (!user) return { error: 'Not signed in' };

    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) return { error: error.message };

    set({ profile: data });
    return { error: null };
  },
}));
