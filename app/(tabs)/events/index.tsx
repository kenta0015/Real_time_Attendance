import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { MapPin, Clock, Users } from 'lucide-react-native';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { Event, Group } from '@/types';

export default function EventsScreen() {
  const { user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'events' | 'groups'>('events');
  const [events, setEvents] = useState<Event[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadGroupMemberships();
    }
  }, [user?.id]);

  const loadGroupMemberships = async () => {
    if (!user?.id) return;

    const { data: groupMemberData, error: groupError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (groupError || !groupMemberData) return;

    const groupIds = groupMemberData.map((gm) => gm.group_id);

    // Fetch Events
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (!eventsError && eventsData) {
      const filteredEvents = eventsData.filter((event) =>
        groupIds.includes(event.group_id)
      );
      setEvents(filteredEvents);
    }

    // Fetch Groups
    const { data: groupsData, error: groupFetchError } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds);

    if (!groupFetchError && groupsData) {
      setGroups(groupsData);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroupMemberships();
    setRefreshing(false);
  };

  const renderEventItem = ({ item }: { item: Event }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
      </View>
      {item.description && (
        <Text style={styles.cardDescription}>{item.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.cardInfo}>
          <Clock size={16} color="#6B7280" />
          <Text style={styles.cardInfoText}>
            {format(new Date(item.start_time), 'MMM d, h:mm a')}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <MapPin size={16} color="#6B7280" />
          <Text style={styles.cardInfoText}>{item.location_name}</Text>
        </View>
      </View>
    </View>
  );

  const renderGroupItem = ({ item }: { item: Group }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      {item.description && (
        <Text style={styles.cardDescription}>{item.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.cardInfo}>
          <Users size={16} color="#6B7280" />
          <Text style={styles.cardInfoText}>{item.category}</Text>
        </View>
      </View>
    </View>
  );

  const renderTabButtons = () => (
    <View style={styles.tabButtons}>
      <TouchableOpacity
        style={[
          styles.tabButton,
          selectedTab === 'groups' && styles.tabButtonActive,
        ]}
        onPress={() => setSelectedTab('groups')}
      >
        <Text
          style={[
            styles.tabButtonText,
            selectedTab === 'groups' && styles.tabButtonTextActive,
          ]}
        >
          Groups
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tabButton,
          selectedTab === 'events' && styles.tabButtonActive,
        ]}
        onPress={() => setSelectedTab('events')}
      >
        <Text
          style={[
            styles.tabButtonText,
            selectedTab === 'events' && styles.tabButtonTextActive,
          ]}
        >
          Events
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📅 My Events</Text>
      {renderTabButtons()}

      {selectedTab === 'events' ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No events found for your groups.
            </Text>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No groups found.</Text>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  tabButtons: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#EEF2FF',
  },
  tabButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#4F46E5',
  },
  listContainer: {
    paddingBottom: 24,
  },
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
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
