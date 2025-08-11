import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

interface Group {
  id: string;
  name: string;
  description: string | null;
  category: string;
  organizer_id: string;
  created_at: string;
}

interface Props {
  group: Group;
  onJoined?: () => void;
}

export default function GroupCard({ group, onJoined }: Props) {
  const { user } = useAuthStore();

  const joinGroup = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
      });

    if (error) {
      console.log('Join group failed:', error.message);
    } else {
      console.log('Joined group:', group.name);
      onJoined?.();
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={joinGroup}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{group.name}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{group.category}</Text>
        </View>
      </View>
      {group.description && (
        <Text style={styles.cardDescription}>{group.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.cardInfo}>
          <Users size={16} color="#6B7280" />
          <Text style={styles.cardInfoText}>Tap to join group</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  categoryBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  cardFooter: {
    gap: 8,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardInfoText: {
    fontSize: 14,
    color: '#6B7280',
  },
});
