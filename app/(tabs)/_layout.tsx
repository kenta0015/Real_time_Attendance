import React from 'react';
import { Tabs } from 'expo-router';
import { Users, Calendar } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';

export default function TabLayout() {
  const { profile, loading, setRole } = useAuthStore();
  const role = profile?.role; // 'organizer' | 'attendee' | undefined

  if (loading) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // dev用ロールトグル（__DEV__ のときだけ表示）
  const headerRight = () => {
    if (!__DEV__) return null;
    const next = role === 'organizer' ? 'attendee' : 'organizer';
    return (
      <Pressable
        onPress={() => setRole(next as any)}
        style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor:'#EEF2FF', borderRadius: 8 }}
      >
        <Text style={{ color:'#3730A3', fontWeight:'600' }}>
          Role: {role ?? 'unknown'} (→ {next})
        </Text>
      </Pressable>
    );
  };

  return (
    <Tabs
      screenOptions={{
        headerTitleStyle: { fontSize: 18 },
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: '#FFFFFF' },
        headerRight,
      }}
    >
      {/* My Events（共通） */}
      <Tabs.Screen
        name="events"
        options={{
          title: 'My Events',
          tabBarIcon: ({ size, color }) => <Calendar size={size} color={color} />,
        }}
      />

      {/* Group（主催者のみ） */}
      {role === 'organizer' && (
        <Tabs.Screen
          name="organize"
          options={{
            title: 'Group',
            tabBarIcon: ({ size, color }) => <Users size={size} color={color} />,
          }}
        />
      )}
    </Tabs>
  );
}
