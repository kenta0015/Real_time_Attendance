export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: 'attendee' | 'organizer';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: 'attendee' | 'organizer';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: 'attendee' | 'organizer';
          created_at?: string;
          updated_at?: string;
        };
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category: string;
          organizer_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category: string;
          organizer_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          category?: string;
          organizer_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          description: string | null;
          category: string;
          start_time: string;
          end_time: string;
          location_name: string;
          latitude: number;
          longitude: number;
          is_recurring: boolean;
          recurrence_pattern: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          title: string;
          description?: string | null;
          category: string;
          start_time: string;
          end_time: string;
          location_name: string;
          latitude: number;
          longitude: number;
          is_recurring?: boolean;
          recurrence_pattern?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          start_time?: string;
          end_time?: string;
          location_name?: string;
          latitude?: number;
          longitude?: number;
          is_recurring?: boolean;
          recurrence_pattern?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      event_attendees: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          status: 'registered' | 'present' | 'absent' | 'late';
          checked_in_at: string | null;
          last_location_update: string | null;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          status?: 'registered' | 'present' | 'absent' | 'late';
          checked_in_at?: string | null;
          last_location_update?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          status?: 'registered' | 'present' | 'absent' | 'late';
          checked_in_at?: string | null;
          last_location_update?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      event_comments: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          message?: string;
          created_at?: string;
        };
      };
    };
  };
}