import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Search, MapPin, Clock, Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';

interface Group {
  id: string;
  name: string;
  description: string | null;
  category: string;
  organizer_id: string;
  created_at: string;
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  category: string;
  start_time: string;
  end_time: string;
  location_name: string;
  latitude: number;
  longitude: number;
  group_id: string;
  groups: {
    name: string;
    category: string;
  };
}

export default function EventsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'groups' | 'events'>('groups');

  const { user } = useAuthStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([loadGroups(), loadEvents()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadGroups = async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .ilike('name', `%${searchQuery}%`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setGroups(data);
    }
  };

  const loadEvents = async () => {
    if (!user) return;

    // Get events from groups the user has joined
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        groups (
          name,
          category
        )
      `)
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (!error && data) {
      setEvents(data as Event[]);
    }
  };

  const joinGroup = async (groupId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
      });

    if (!error) {
      loadEvents(); // Refresh events after joining group
    }
  };

  const joinEvent = async (eventId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('event_attendees')
      .insert({
        event_id: eventId,
        user_id: user.id,
        status: 'registered',
      });

    if (!error) {
      router.push(`/event/${eventId}`);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.groups.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderGroup = ({ item }: { item: Group }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => joinGroup(item.id)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
      </View>
      {item.description && (
        <Text style={styles.cardDescription}>{item.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <View style={styles.cardInfo}>
          <Users size={16} color="#6B7280" />
          <Text style={styles.cardInfoText}>Tap to join group</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEvent = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => joinEvent(item.id)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>
      </View>
      <Text style={styles.groupName}>{item.groups.name}</Text>
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
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchContainer}>
          <Search size={20} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search groups and events..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
            onPress={() => setActiveTab('groups')}
          >
            <Text style={[styles.tabText, activeTab === 'groups' && styles.activeTabText]}>
              Groups
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'events' && styles.activeTab]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>
              My Events
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={activeTab === 'groups' ? filteredGroups : filteredEvents}
        renderItem={activeTab === 'groups' ? renderGroup : renderEvent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#4F46E5',
  },
  listContainer: {
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  groupName: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
    marginBottom: 8,
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