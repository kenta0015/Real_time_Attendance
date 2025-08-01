import { Tabs } from 'expo-router';
import { Users, Calendar } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';

export default function TabLayout() {
  const { profile } = useAuthStore();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ size, color }) => (
            <Calendar size={size} color={color} />
          ),
        }}
      />
      {profile?.role === 'organizer' && (
        <Tabs.Screen
          name="organize"
          options={{
            title: 'Organize',
            tabBarIcon: ({ size, color }) => (
              <Users size={size} color={color} />
            ),
          }}
        />
      )}
    </Tabs>
  );
}