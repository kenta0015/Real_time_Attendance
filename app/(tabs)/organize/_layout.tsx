import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { View, ActivityIndicator } from 'react-native';

export default function OrganizerLayout() {
  const { loading, profile } = useAuthStore();
  const role = profile?.role;

  useEffect(() => {
    if (!loading && role !== 'organizer') {
      router.replace('/(tabs)/events');
    }
  }, [loading, role]);

  if (loading || role !== 'organizer') {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontSize: 18 },
      }}
    />
  );
}
