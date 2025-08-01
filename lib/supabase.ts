import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';

// Check if we're using placeholder values
const isUsingPlaceholders = supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder');

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    // Disable requests when using placeholder values
    fetch: isUsingPlaceholders ? 
      () => Promise.reject(new Error('Supabase not configured. Please set up your Supabase credentials.')) :
      undefined,
  },
});

// Export a flag to check if Supabase is properly configured
export const isSupabaseConfigured = !isUsingPlaceholders;