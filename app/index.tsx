// app/index.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import AuthScreen from '@/components/AuthScreen';

const DEV_SKIP_AUTH =
  (process.env.EXPO_PUBLIC_DEV_SKIP_AUTH || '').toString().trim() === '1';

export default function IndexScreen() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    // 通常初期化（セッション取得・onAuthStateChange）
    initialize();
  }, []);

  // 開発用フラグ: サインイン省略してタブへ
  if (DEV_SKIP_AUTH) {
    return <Redirect href="/(tabs)/events" />;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/events" />;
  }

  return <AuthScreen />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});
