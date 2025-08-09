import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import haversine from 'haversine-distance';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import config from '../../config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* ------------------------- ID + open helpers ------------------------- */
const normalizeId = (val: any): string | null => {
  if (val == null) return null;
  if (Array.isArray(val)) return val.length ? String(val[0]) : null; // expo-router can send string[]
  return String(val);
};

const getStableId = (job: any): string | null =>
  normalizeId(job?._id ?? job?.job_id ?? job?.id);

const findJobById = (list: any[], targetId: string | null) => {
  if (!targetId) return null;
  return list.find((j) => getStableId(j) === targetId) || null;
};

const openJob = (
  job: any,
  setSelectedJob: (j: any) => void,
  setMapRegion: (r: any) => void
) => {
  if (!job) return;
  setSelectedJob(job);
  if (job.latitude != null && job.longitude != null) {
    setMapRegion({
      latitude: job.latitude,
      longitude: job.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  }
};

export default function Home() {
  const { token, openJobId } = useLocalSearchParams();
  const [username, setUsername] = useState('User');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<any | null>(null);
  const [mapRegion, setMapRegion] = useState<any | null>(null);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(2);

  const notifiedRef = React.useRef<Set<string>>(new Set());
  const latestJobsRef = React.useRef<any[]>([]);
  const latestLocationRef = React.useRef<any | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  useEffect(() => {
    latestJobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    latestLocationRef.current = location;
  }, [location]);

  const apiBaseUrl = config.API_BASE_URL;

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) {
      alert('Push notifications require a physical device');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('Permission denied for push notifications');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await AsyncStorage.setItem('push_token', tokenData.data);
    console.log('📬 Expo Push Token:', tokenData.data);
  };

  const initLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return null;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      setMapRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      return currentLocation;
    } catch (err) {
      console.error('Location error:', err);
      return null;
    }
  };

  const notifyNearbyJobs = async (jobsList: any[], userLocation: any, radiusKM: number) => {
    console.log('notifyNearbyJobs START', { radiusKM, jobsCount: jobsList?.length });
    if (!userLocation || !Array.isArray(jobsList)) return;

    for (let job of jobsList) {
      if (!job?.latitude || !job?.longitude) continue;

      const distanceKm =
        haversine(
          { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude },
          { latitude: job.latitude, longitude: job.longitude }
        ) / 1000;

      const id = getStableId(job);
      if (!id) continue;

      if (distanceKm <= radiusKM && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `📢 ${job.job_title}`,
            body: `${job.job_type} at ${job.employer_name}`,
            data: { jobId: id }, // stable id only; list already in memory per your note
            sound: 'default',
          },
          trigger: { seconds: 2 },
        });
      }
    }
  };

  const fetchData = async (userLocation: any) => {
    if (!token) {
      Alert.alert('Unauthorized', 'No token found in route. Please log in.');
      return;
    }

    try {
      setLoading(true);

      const userRes = await fetch(`${apiBaseUrl}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await userRes.json();
      if (userRes.ok) setUsername(userData.username);

      const latest = Number(await AsyncStorage.getItem('job_radius_km')) || radiusKm;
      const lat = userLocation?.coords?.latitude;
      const lon = userLocation?.coords?.longitude;

      const jobRes = await fetch(
        `${apiBaseUrl}/api/jobs/external/nearby?lat=${lat}&lon=${lon}&radius=${latest}`
      );
      const jobData = await jobRes.json();

      if (Array.isArray(jobData)) {
        setJobs(jobData);

        // If we already have a pending id, try to resolve immediately
        if (pendingJobId) {
          const match = findJobById(jobData, pendingJobId);
          if (match) {
            openJob(match, setSelectedJob, setMapRegion);
            setPendingJobId(null);
          }
        }

        if (userLocation) {
          const latestR = Number(await AsyncStorage.getItem('job_radius_km')) || radiusKm;
          await notifyNearbyJobs(jobData, userLocation, latestR);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    notifiedRef.current.clear();
    const currentLocation = await initLocation();
    if (currentLocation) {
      await fetchData(currentLocation);
    } else {
      setRefreshing(false);
    }
  };

  /* -------------------- Handle taps (fg/bg/cold start) -------------------- */
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data: any = resp?.notification?.request?.content?.data || {};
      const id = normalizeId(data?.jobId);

      // Try to open immediately from current list
      if (id && latestJobsRef.current?.length) {
        const match = findJobById(latestJobsRef.current, id);
        if (match) {
          openJob(match, setSelectedJob, setMapRegion);
          setPendingJobId(null);
          return;
        }
      }

      // Fallback: set pending + ensure data present
      if (id) setPendingJobId(id);
      (async () => {
        const loc = latestLocationRef.current ?? (await initLocation());
        if (loc) await fetchData(loc);
      })();
    });

    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      const data: any = last?.notification?.request?.content?.data || {};
      const id = normalizeId(data?.jobId);
      if (!id) return;

      if (latestJobsRef.current?.length) {
        const match = findJobById(latestJobsRef.current, id);
        if (match) {
          openJob(match, setSelectedJob, setMapRegion);
          setPendingJobId(null);
          return;
        }
      }

      setPendingJobId(id);
      const loc = latestLocationRef.current ?? (await initLocation());
      if (loc) await fetchData(loc);
    })();

    return () => sub.remove();
  }, []);

  /* ---------- If openJobId param arrives (from layout), do the same ---------- */
  useEffect(() => {
    const norm = normalizeId(openJobId);
    if (!norm) return;

    setPendingJobId(norm);

    // If jobs already loaded, open now
    if (latestJobsRef.current?.length) {
      const match = findJobById(latestJobsRef.current, norm);
      if (match) {
        openJob(match, setSelectedJob, setMapRegion);
        setPendingJobId(null);
        return;
      }
    }

    // Else fetch to populate, then resolver will run
    (async () => {
      try {
        notifiedRef.current.clear();
        const loc = latestLocationRef.current ?? (await initLocation());
        if (loc) await fetchData(loc);
      } catch {}
    })();
  }, [openJobId]);

  // Resolve pending jobId once jobs are loaded
  useEffect(() => {
    if (!pendingJobId || !jobs.length) return;
    const match = findJobById(jobs, pendingJobId);
    if (match) {
      openJob(match, setSelectedJob, setMapRegion);
      setPendingJobId(null);
    }
  }, [pendingJobId, jobs]);

  // 📡 Listen for radius changes globally
  useEffect(() => {
    let isMounted = true;

    (async () => {
      const saved = Number(await AsyncStorage.getItem('job_radius_km')) || 2;
      if (isMounted) setRadiusKm(saved);
    })();

    const sub = DeviceEventEmitter.addListener('jobRadiusChanged', async (v) => {
      console.log('HEARD jobRadiusChanged', v);
      const newRadius = Number(v) || 2;
      setRadiusKm(newRadius);
      notifiedRef.current.clear();

      const jobsToUse = latestJobsRef.current;
      const locToUse = latestLocationRef.current ?? (await initLocation());

      if (jobsToUse?.length && locToUse) {
        await notifyNearbyJobs(jobsToUse, locToUse, newRadius);
      } else if (locToUse) {
        await fetchData(locToUse);
        const refreshedJobs = latestJobsRef.current;
        if (refreshedJobs?.length) {
          await notifyNearbyJobs(refreshedJobs, locToUse, newRadius);
        }
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

  // 📍 Watch location & init on focus
  useFocusEffect(
    useCallback(() => {
      let locationWatchSub: any;

      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          locationWatchSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 250,
              timeInterval: 60000,
            },
            async (pos) => {
              setLocation(pos);
              setMapRegion((r: any) => ({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                latitudeDelta: r?.latitudeDelta ?? 0.05,
                longitudeDelta: r?.longitudeDelta ?? 0.05,
              }));
              if (latestJobsRef.current?.length) {
                const latestR = Number(await AsyncStorage.getItem('job_radius_km')) || radiusKm;
                await notifyNearbyJobs(latestJobsRef.current, pos, latestR);
              }
            }
          );
        }
      })();

      if (!hasInitialized) {
        setHasInitialized(true);
        registerForPushNotificationsAsync();
        handleRefresh();
      }

      return () => {
        locationWatchSub?.remove?.();
      };
    }, [token, hasInitialized])
  );

  const filteredJobs = jobs.filter(
    (job) =>
      job.job_title?.toLowerCase().includes(searchText.toLowerCase()) ||
      job.employer_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      (job.job_location?.city || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Hi {username} 👋</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search"
        placeholderTextColor="#999"
        value={searchText}
        onChangeText={setSearchText}
      />

      {mapRegion && (
        <MapView
          style={styles.map}
          region={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {location && (
            <Marker
              coordinate={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }}
              title="You"
              pinColor="blue"
            />
          )}
          {selectedJob && (
            <Marker
              coordinate={{
                latitude: selectedJob.latitude,
                longitude: selectedJob.longitude,
              }}
              title={selectedJob.job_title}
              description={selectedJob.job_location?.city}
              pinColor="red"
            />
          )}
        </MapView>
      )}

      {selectedJob && (
        <ScrollView
          style={styles.detailsBox}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.detailsTitle}>{selectedJob.job_title}</Text>
          <Text style={styles.detailsSubtitle}>
            {selectedJob.job_type} at {selectedJob.employer_name}
          </Text>
          <Text>
            📍 {selectedJob.job_location?.street_address}{' '}
            {selectedJob.job_location?.city}{' '}
            {selectedJob.job_location?.province}{' '}
            {selectedJob.job_location?.postal_code}
          </Text>
          <Text style={{ marginTop: 8 }}>📝 {selectedJob.job_description}</Text>
          <Text style={{ marginTop: 8 }}>📧 {selectedJob.employer_email}</Text>
          <Text>📞 {selectedJob.employer_contact}</Text>
          <Text>👥 Positions: {selectedJob.number_of_positions}</Text>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              setSelectedJob(null);
              if (location) {
                setMapRegion({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                });
              }
            }}
          >
            <Text style={styles.closeButtonText}>Close Details</Text>
          </TouchableOpacity>
        </ScrollView>
      )}


      <ScrollView
        style={styles.jobsContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#888" style={{ marginTop: 20 }} />
        ) : (
          filteredJobs.map((job, index) => (
            <TouchableOpacity
              key={index}
              style={styles.jobCard}
              onPress={() => {
                openJob(job, setSelectedJob, setMapRegion);
              }}
            >
              <Text style={styles.jobTitle}>{job.job_title}</Text>
              <Text style={styles.jobCompany}>{job.employer_name}</Text>
              <Text style={styles.jobDistance}>
                {job.job_location?.city || 'Unknown'}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { fontSize: 26, fontWeight: 'bold', marginBottom: 10 },
  map: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 15,
  },
  searchInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 8,
    fontSize: 16,
    marginBottom: 15,
  },
  jobsContainer: { flex: 1 },
  jobCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  jobTitle: { fontSize: 16, fontWeight: 'bold' },
  jobCompany: { fontSize: 14, color: '#666' },
  jobDistance: { fontSize: 14, color: '#999' },
  detailsBox: {
    backgroundColor: '#eef0f2',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    maxHeight:300,
  },
  detailsTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  detailsSubtitle: { fontSize: 14, color: '#444', marginBottom: 10 },
  closeButton: {
    marginTop: 12,
    backgroundColor: '#d9534f',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
