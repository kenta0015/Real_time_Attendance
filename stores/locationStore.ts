import { create } from 'zustand';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { distance } from '@turf/turf';

interface LocationState {
  currentLocation: Location.LocationObject | null;
  locationPermission: Location.LocationPermissionResponse | null;
  isTracking: boolean;
  trackingEventId: string | null;
  attendanceStatus: 'registered' | 'present' | 'absent' | 'late' | null;
  
  requestLocationPermission: () => Promise<boolean>;
  startLocationTracking: (eventId: string, eventLat: number, eventLng: number) => Promise<void>;
  stopLocationTracking: () => void;
  updateAttendanceStatus: (eventId: string, eventLat: number, eventLng: number, eventStartTime: string) => Promise<void>;
}

const ATTENDANCE_RADIUS = 50; // 50 meters
const LATE_THRESHOLD = 15 * 60 * 1000; // 15 minutes in milliseconds

export const useLocationStore = create<LocationState>((set, get) => ({
  currentLocation: null,
  locationPermission: null,
  isTracking: false,
  trackingEventId: null,
  attendanceStatus: null,

  requestLocationPermission: async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const permission = { status } as Location.LocationPermissionResponse;
      set({ locationPermission: permission });
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  },

  startLocationTracking: async (eventId: string, eventLat: number, eventLng: number) => {
    const { requestLocationPermission } = get();
    
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      console.error('Location permission not granted');
      return;
    }

    set({ isTracking: true, trackingEventId: eventId });

    // Start location tracking with 1-minute intervals
    const locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 60000, // 1 minute
        distanceInterval: 10, // 10 meters
      },
      async (location) => {
        set({ currentLocation: location });
        
        // Update attendance status based on location
        const { updateAttendanceStatus } = get();
        const event = await supabase
          .from('events')
          .select('start_time')
          .eq('id', eventId)
          .single();
        
        if (event.data) {
          await updateAttendanceStatus(eventId, eventLat, eventLng, event.data.start_time);
        }
      }
    );

    // Store subscription for cleanup
    (get() as any).locationSubscription = locationSubscription;
  },

  stopLocationTracking: () => {
    const state = get() as any;
    if (state.locationSubscription) {
      state.locationSubscription.remove();
    }
    set({ 
      isTracking: false, 
      trackingEventId: null,
      attendanceStatus: null 
    });
  },

  updateAttendanceStatus: async (eventId: string, eventLat: number, eventLng: number, eventStartTime: string) => {
    const { currentLocation } = get();
    if (!currentLocation) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Calculate distance from event location
    const userPoint = [currentLocation.coords.longitude, currentLocation.coords.latitude];
    const eventPoint = [eventLng, eventLat];
    const distanceInMeters = distance(userPoint, eventPoint, { units: 'meters' });

    const now = new Date();
    const startTime = new Date(eventStartTime);
    const timeDiff = now.getTime() - startTime.getTime();
    
    let newStatus: 'present' | 'absent' | 'late' = 'absent';
    
    if (distanceInMeters <= ATTENDANCE_RADIUS) {
      // User is within attendance radius
      if (timeDiff > LATE_THRESHOLD) {
        newStatus = 'late';
      } else {
        newStatus = 'present';
      }
    } else {
      newStatus = 'absent';
    }

    // Update attendance status in database
    const { error } = await supabase
      .from('event_attendees')
      .upsert({
        event_id: eventId,
        user_id: user.id,
        status: newStatus,
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        last_location_update: now.toISOString(),
        checked_in_at: newStatus === 'present' || newStatus === 'late' ? now.toISOString() : null,
      });

    if (!error) {
      set({ attendanceStatus: newStatus });
    }
  },
}));