import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

type Group = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  organizer_id: string;
  created_at: string;
};

export default function GroupFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!id);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (id) loadGroup(id);
  }, [id]);

  const loadGroup = async (gid: string) => {
    setInitialLoading(true);
    const { data, error } = await supabase.from('groups').select('*').eq('id', gid).single();
    if (error) {
      Alert.alert('Error', error.message);
      setInitialLoading(false);
      return;
    }
    const g = data as Group;
    setName(g.name ?? '');
    setCategory(g.category ?? 'General');
    setDescription(g.description ?? '');
    setInitialLoading(false);
  };

  const onSubmit = async () => {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert('Validation', 'Please enter group name');
      return;
    }

    setLoading(true);
    if (id) {
      const { error } = await supabase
        .from('groups')
        .update({ name, category, description })
        .eq('id', id);
      if (error) Alert.alert('Error', error.message);
      else {
        Alert.alert('Saved', 'Group updated');
        router.back();
      }
    } else {
      const { error } = await supabase.from('groups').insert({
        name,
        category,
        description: description || null,
        organizer_id: user.id,
      });
      if (error) Alert.alert('Error', error.message);
      else {
        Alert.alert('Created', 'Group created');
        router.replace('/(tabs)/organize');
      }
    }
    setLoading(false);
  };

  if (initialLoading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" /></View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{id ? 'Edit Group' : 'New Group'}</Text>

      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Weekend Runners"
      />

      <Text style={styles.label}>Category</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="e.g., Sports"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, { height: 100 }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
        multiline
      />

      <TouchableOpacity style={styles.saveBtn} onPress={onSubmit} disabled={loading}>
        <Text style={styles.saveBtnText}>{loading ? 'Saving...' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#fff' },
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },

  label: { fontSize: 14, color: '#374151', marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
    backgroundColor: '#F9FAFB',
  },

  saveBtn: { backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, marginTop: 20, alignItems:'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
