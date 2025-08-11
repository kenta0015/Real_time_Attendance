import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Group = { id: string; name: string };
type EventRow = {
  id: string; group_id: string; title: string; description: string | null;
  category: string | null; start_time: string; end_time: string | null;
  location_name: string | null; latitude: number | null; longitude: number | null;
  is_recurring?: boolean | null; recurrence_pattern?: string | null; created_by?: string | null;
};

export default function EventFormScreen() {
  const { id, groupId } = useLocalSearchParams<{ id?: string; groupId?: string }>();
  const { user, loading: authLoading } = useAuthStore();

  const [initialLoading, setInitialLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(
    typeof groupId === 'string' ? groupId : undefined
  );

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('General');
  const [start, setStart] = useState<string>(''); // ISO
  const [end, setEnd] = useState<string>('');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');

  // userが確定してから読み込み
  useEffect(() => {
    if (!authLoading && user) {
      loadGroups();
      if (id) loadEvent(id);
    }
  }, [authLoading, user?.id, id]);

  const loadGroups = async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('id,name')
      .eq('organizer_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    const list = (data ?? []) as Group[];
    setGroups(list);
    if (!selectedGroupId && list.length > 0) setSelectedGroupId(list[0].id);
  };

  const loadEvent = async (eid: string) => {
    setInitialLoading(true);
    const { data, error } = await supabase.from('events').select('*').eq('id', eid).single();
    if (error) {
      Alert.alert('Error', error.message);
      setInitialLoading(false);
      return;
    }
    const e = data as EventRow;
    setSelectedGroupId(e.group_id);
    setTitle(e.title ?? '');
    setDesc(e.description ?? '');
    setCategory(e.category ?? 'General');
    setStart(e.start_time ?? '');
    setEnd(e.end_time ?? '');
    setLocationName(e.location_name ?? '');
    setLat(e.latitude != null ? String(e.latitude) : '');
    setLng(e.longitude != null ? String(e.longitude) : '');
    setInitialLoading(false);
  };

  const pickCurrentLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Location permission is needed.'); return; }
    const loc = await Location.getCurrentPositionAsync({});
    setLat(String(loc.coords.latitude)); setLng(String(loc.coords.longitude));
  };

  const onSave = async () => {
    if (!user) return;
    if (!selectedGroupId) { Alert.alert('Validation', 'Please select group'); return; }
    if (!title.trim() || !start.trim()) {
      Alert.alert('Validation', 'Please enter title and start time (ISO: YYYY-MM-DDTHH:mm:ssZ)'); return;
    }

    const payload = {
      group_id: selectedGroupId,
      title,
      description: desc || null,
      category: category || 'General',
      start_time: start,
      end_time: end || start,
      location_name: locationName || '',
      latitude: lat ? Number(lat) : 0,
      longitude: lng ? Number(lng) : 0,
      is_recurring: false,
      recurrence_pattern: null,
      created_by: user.id,
    };

    setSaving(true);
    if (id) {
      const { error } = await supabase.from('events').update(payload).eq('id', id);
      if (error) Alert.alert('Error', JSON.stringify(error));
      else { Alert.alert('Saved', 'Event updated'); router.back(); }
    } else {
      // select返せないとき=RLSで見えない → エラー化するため select('*').single()
      const { error } = await supabase.from('events').insert(payload).select('*').single();
      if (error) Alert.alert('Error', JSON.stringify(error));
      else { Alert.alert('Created', 'Event created'); router.replace('/(tabs)/organize'); }
    }
    setSaving(false);
  };

  if (initialLoading || authLoading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{id ? 'Edit Event' : 'New Event'}</Text>

        <Text style={styles.label}>Group</Text>
        <View style={styles.selectLike}>
          <FlatGroupPicker value={selectedGroupId} options={groups} onChange={setSelectedGroupId} />
          {(!groups || groups.length === 0) && (<Text style={styles.hint}>No groups. Create one first.</Text>)}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title" />

        <Text style={styles.label}>Category</Text>
        <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="General" />

        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, { height: 100 }]} value={desc} onChangeText={setDesc} placeholder="Optional" multiline />

        <Text style={styles.label}>Start (ISO)</Text>
        <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="2025-08-31T10:00:00+10:00" />

        <Text style={styles.label}>End (ISO / Required)</Text>
        <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="2025-08-31T12:00:00+10:00" />

        <Text style={styles.label}>Location Name (Required)</Text>
        <TextInput style={styles.input} value={locationName} onChangeText={setLocationName} placeholder="Melbourne Central Station" />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Latitude (Required)</Text>
            <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="-37.8136" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Longitude (Required)</Text>
            <TextInput style={styles.input} value={lng} onChangeText={setLng} placeholder="144.9631" keyboardType="numeric" />
          </View>
        </View>

        <TouchableOpacity style={styles.grayBtn} onPress={pickCurrentLocation}>
          <Text style={styles.grayBtnText}>Use Current Location</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FlatGroupPicker({ value, options, onChange }:{ value?: string; options: Group[]; onChange: (id: string) => void; }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((g) => {
        const active = value === g.id;
        return (
          <TouchableOpacity key={g.id} onPress={() => onChange(g.id)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? '#C7D2FE' : '#EEF2FF' }}>
            <Text style={{ color: '#111827', fontWeight: '700' }}>{g.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#fff' },
  scrollBody: { padding: 16, paddingBottom: 80 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 14, color: '#374151', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, backgroundColor: '#F9FAFB' },
  selectLike: { paddingTop: 6 }, hint: { color: '#6B7280', marginTop: 6 },
  grayBtn: { marginTop: 12, backgroundColor: '#E5E7EB', paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  grayBtnText: { color: '#111827', fontWeight: '700' },
  saveBtn: { backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, marginTop: 16, alignItems:'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
