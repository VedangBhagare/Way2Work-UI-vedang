import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import config from '../../config';

const initialForm = {
  job_title: '',
  job_type: null as string | null,
  employer_name: '',
  street_address: '',
  city: '',
  province: '',
  postal_code: '',
  latitude: '',
  longitude: '',
  number_of_positions: '1',
  employer_email: '',
  employer_contact: '',
  job_description: '',
};

type User = { user_id: string; email: string; username: string };

export default function Jobs() {
  const { token } = useLocalSearchParams();
  const [user, setUser] = useState<User>({ user_id: '', email: '', username: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [tab, setTab] = useState<'create' | 'myjobs' | 'alljobs'>('alljobs');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  const handleChange = (name: string, value: string | null) => {
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = async () => {
    if (!showForm) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required.');
          return;
        }
        const location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;

        setForm({
          ...initialForm,
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        });
        setRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } catch (err) {
        Alert.alert("Location Error", "Could not get location.");
        setForm(initialForm);
      }
    } else {
      setForm(initialForm);
      setRegion(null);
    }
    setShowForm(prev => !prev);
    setEditingJobId(null);
  };

  // Fetch only jobs created by user
  const fetchMyJobs = async (uid: string) => {
    try {
      const res = await axios.get(`${config.API_BASE_URL}/api/jobs/user/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyJobs(res.data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch jobs.');
    }
  };

  // Fetch internal + external jobs and merge
  const fetchAllJobs = async () => {
    try {
      // 1) Ensure we have location permission + current coords
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to show nearby jobs.');
        // Even if denied, still show internal jobs
      }

      let lat: number | undefined;
      let lon: number | undefined;

      try {
        const currentLocation = await Location.getCurrentPositionAsync({});
        lat = currentLocation.coords.latitude;
        lon = currentLocation.coords.longitude;
      } catch {
        // If we fail to get location, we’ll still show internal jobs
      }

      // 2) Load radius (default 50 if not set)
      const saved = Number(await AsyncStorage.getItem('job_radius_km'));
      const radiusKm = Number.isFinite(saved) && saved > 0 ? saved : 50;

      // 3) Fetch INTERNAL jobs
      const internalRes = await axios.get(`${config.API_BASE_URL}/api/jobs`);
      const internal = Array.isArray(internalRes.data) ? internalRes.data : [];

      // 4) Fetch EXTERNAL jobs (Adzuna) via your backend proxy (if we have coords)
      let external: any[] = [];
      if (typeof lat === 'number' && typeof lon === 'number') {
        try {
          const url = `${config.API_BASE_URL}/api/jobs/external/nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}`;
          const externalRes = await axios.get(url);
          external = Array.isArray(externalRes.data) ? externalRes.data : [];
        } catch (e) {
          // If external fails, we still show internal
          console.log('External jobs fetch failed:', e?.response?.data || e?.message);
        }
      }

      // 5) Merge & de-dupe (prefer external first)
      const seen = new Set<string>();
      const mergeKey = (j: any) => String(j._id || j.job_id || `${j.job_title}-${j.employer_name}-${j.latitude}-${j.longitude}`);

      const merged: any[] = [];
      for (const j of [...external, ...internal]) {
        const key = mergeKey(j);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(j);
        }
      }

      setAllJobs(merged);
    } catch (error) {
      console.log('fetchAllJobs error', error);
      Alert.alert('Error', 'Failed to fetch all jobs.');
    }
  };

  const handleSubmit = async () => {
    const payload = {
      ...form,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      number_of_positions: parseInt(form.number_of_positions),
      job_location: {
        street_address: form.street_address,
        city: form.city,
        province: form.province,
        postal_code: form.postal_code,
      },
      created_by: {
        user_id: user.user_id,
        email: user.email,
      },
    };

    try {
      if (editingJobId) {
        await axios.put(`${config.API_BASE_URL}/api/jobs/${editingJobId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert('Updated', 'Job updated successfully.');
      } else {
        await axios.post(`${config.API_BASE_URL}/api/jobs`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert('Created', 'Job created successfully.');
      }
      resetForm();
      fetchMyJobs(user.user_id);
      fetchAllJobs();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Job operation failed');
    }
  };

  const handleEdit = (job: any) => {
    setForm({
      ...job,
      street_address: job.job_location?.street_address || '',
      city: job.job_location?.city || '',
      province: job.job_location?.province || '',
      postal_code: job.job_location?.postal_code || '',
      latitude: job.latitude?.toString?.() || String(job.latitude || ''),
      longitude: job.longitude?.toString?.() || String(job.longitude || ''),
      number_of_positions: String(job.number_of_positions || '1'),
    });

    if (job.latitude && job.longitude) {
      setRegion({
        latitude: Number(job.latitude),
        longitude: Number(job.longitude),
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } else {
      setRegion(null);
    }

    setEditingJobId(job.job_id || job._id || null);
    setShowForm(true);
  };

  const handleDelete = async (job_id: string) => {
    Alert.alert("Confirm Delete", "Are you sure?", [
      { text: "Cancel" },
      {
        text: "Delete",
        onPress: async () => {
          try {
            await axios.delete(`${config.API_BASE_URL}/api/jobs/${job_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            Alert.alert("Deleted", "Job deleted.");
            fetchMyJobs(user.user_id);
            fetchAllJobs();
          } catch (err) {
            Alert.alert("Error", "Failed to delete job.");
          }
        }
      }
    ]);
  };

  useEffect(() => {
    const getUser = async () => {
      if (!token) return Alert.alert("Token Missing", "No token found");

      try {
        const res = await axios.get(`${config.API_BASE_URL}/api/auth/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = {
          user_id: res.data.user_id,
          email: res.data.email,
          username: res.data.username,
        };
        setUser(userData);
        fetchMyJobs(userData.user_id);
        await fetchAllJobs(); // includes external jobs now
      } catch (error) {
        Alert.alert("Error", "Could not fetch user info");
      }
    };

    getUser();
  }, [token]);

  const onMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setForm(prev => ({
      ...prev,
      latitude: latitude.toString(),
      longitude: longitude.toString()
    }));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hi {user.username || 'User'} 👋</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
        <TouchableOpacity style={[styles.tabButton, tab === 'alljobs' && styles.activeTab]} onPress={() => { setTab('alljobs'); setShowForm(false); setSelectedJob(null); }}>
          <Text style={styles.tabButtonText}>All Jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === 'myjobs' && styles.activeTab]} onPress={() => { setTab('myjobs'); setShowForm(false); setSelectedJob(null); }}>
          <Text style={styles.tabButtonText}>My Jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === 'create' && styles.activeTab]} onPress={() => { setTab('create'); setShowForm(true); setSelectedJob(null); }}>
          <Text style={styles.tabButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Job Creation Form */}
      {showForm && tab === 'create' && (
        <View style={styles.form}>
          <TextInput placeholder="Job Title" style={styles.input} value={form.job_title} onChangeText={val => handleChange('job_title', val)} />
          <View style={styles.input}>
            <Picker selectedValue={form.job_type} onValueChange={val => handleChange('job_type', val)}>
              <Picker.Item label="Select Job Type" value={null} />
              <Picker.Item label="Full-Time" value="Full-time" />
              <Picker.Item label="Part-Time" value="Part-time" />
              <Picker.Item label="Contract" value="Contract" />
              <Picker.Item label="Internship" value="Internship" />
              <Picker.Item label="Temporary" value="Temporary" />
              <Picker.Item label="Remote" value="Remote" />
            </Picker>
          </View>
          <TextInput placeholder="Employer Name" style={styles.input} value={form.employer_name} onChangeText={val => handleChange('employer_name', val)} />
          <TextInput placeholder="Street Address" style={styles.input} value={form.street_address} onChangeText={val => handleChange('street_address', val)} />
          <TextInput placeholder="City" style={styles.input} value={form.city} onChangeText={val => handleChange('city', val)} />
          <TextInput placeholder="Province" style={styles.input} value={form.province} onChangeText={val => handleChange('province', val)} />
          <TextInput placeholder="Postal Code" style={styles.input} value={form.postal_code} onChangeText={val => handleChange('postal_code', val)} />
          <TextInput placeholder="Number of Positions" style={styles.input} keyboardType="numeric" value={form.number_of_positions} onChangeText={val => handleChange('number_of_positions', val)} />
          <TextInput placeholder="Employer Email" style={styles.input} value={form.employer_email} onChangeText={val => handleChange('employer_email', val)} />
          <TextInput placeholder="Employer Contact" style={styles.input} value={form.employer_contact} onChangeText={val => handleChange('employer_contact', val)} />
          <TextInput placeholder="Job Description" style={styles.input} multiline numberOfLines={4} value={form.job_description} onChangeText={val => handleChange('job_description', val)} />

          {region && (
            <View style={{ marginVertical: 10 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>📍 Tap map to select job location:</Text>
              <MapView style={styles.map} region={region} onPress={onMapPress}>
                {form.latitude && form.longitude && (
                  <Marker coordinate={{
                    latitude: parseFloat(form.latitude),
                    longitude: parseFloat(form.longitude)
                  }} />
                )}
              </MapView>
            </View>
          )}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>{editingJobId ? '💾 Save Changes' : '📤 Submit Job'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Show Job Details (selectedJob) */}
      {selectedJob && (
        <View style={styles.detailsBox}>
          <Text style={styles.detailsTitle}>{selectedJob.job_title}</Text>
          <Text style={styles.detailsSubtitle}>
            {selectedJob.job_type} at {selectedJob.employer_name}
          </Text>
          <Text>
            📍 {selectedJob.job_location?.street_address},{' '}
            {selectedJob.job_location?.city},{' '}
            {selectedJob.job_location?.province}{' '}
            {selectedJob.job_location?.postal_code}
          </Text>
          <Text style={{ marginTop: 8 }}>📝 {selectedJob.job_description}</Text>
          <Text style={{ marginTop: 8 }}>📧 {selectedJob.employer_email}</Text>
          <Text>📞 {selectedJob.employer_contact}</Text>
          <Text>👥 Positions: {selectedJob.number_of_positions}</Text>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedJob(null)}
          >
            <Text style={styles.closeButtonText}>Close Details</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* All Jobs Tab */}
      {tab === 'alljobs' && (
        <View>
          <Text style={styles.subHeader}>All Jobs</Text>
          {allJobs.map((job) => (
            <TouchableOpacity
              key={job.job_id || job._id}
              style={styles.jobCard}
              onPress={() => setSelectedJob(job)}
            >
              <Text style={{ fontWeight: 'bold' }}>{job.job_title}</Text>
              <Text>{job.job_type} • {job.city || job.job_location?.city}</Text>
            </TouchableOpacity>
          ))}
          {allJobs.length === 0 && (
            <Text style={{ color: '#888', marginTop: 6 }}>
              No jobs found. Try increasing your radius in Profile.
            </Text>
          )}
        </View>
      )}

      {/* My Jobs Tab */}
      {tab === 'myjobs' && (
        <View>
          <Text style={styles.subHeader}>My Jobs</Text>
          {myJobs.map((job) => (
            <TouchableOpacity
              key={job.job_id || job._id}
              style={styles.jobCard}
              onPress={() => setSelectedJob(job)}
            >
              <Text style={{ fontWeight: 'bold' }}>{job.job_title}</Text>
              <Text>{job.job_type} • {job.city || job.job_location?.city}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <TouchableOpacity onPress={() => handleEdit(job)}>
                  <Text style={{ color: '#1E90FF', fontWeight: '600' }}>Edit</Text>
                </TouchableOpacity>
                {/* Only delete internal jobs that have a job_id */}
                {!!job.job_id && (
                  <TouchableOpacity onPress={() => handleDelete(job.job_id)}>
                    <Text style={{ color: 'red', fontWeight: '600' }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}
          {myJobs.length === 0 && (
            <Text style={{ color: '#888', marginTop: 6 }}>
              You haven’t created any jobs yet.
            </Text>
          )}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  subHeader: { fontSize: 17, fontWeight: 'bold', marginVertical: 6, color: '#1E90FF' },
  tabButton: {
    backgroundColor: '#f3f3f3',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 17,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  activeTab: { backgroundColor: '#1E90FF', borderColor: '#1E90FF' },
  tabButtonText: { fontSize: 15, color: '#333', fontWeight: '500' },
  form: { marginTop: 15, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: '#1E90FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  map: {
    width: '100%',
    height: 200,
    marginVertical: 10,
  },
  jobCard: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 10,
    padding: 15,
    marginVertical: 10,
    backgroundColor: '#f9f9f9',
  },
  detailsBox: {
    backgroundColor: '#eef0f2',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
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
