import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button, DeviceEventEmitter, Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import config from '../../config';

export default function Profile() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  

  const [user, setUser] = useState({ username: '', email: '' });
  const [editMode, setEditMode] = useState(false);
  const [updatedUser, setUpdatedUser] = useState({ username: '', email: '', password: '' });

  const [radiusModalVisible, setRadiusModalVisible] = useState(false);
  const [newRadius, setNewRadius] = useState('');
  const [savedRadius, setSavedRadius] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return Alert.alert('Error', 'Missing auth token');
    axios
      .get(`${config.API_BASE_URL}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => {
        setUser({ username: res.data.username, email: res.data.email });
        setUpdatedUser({ username: res.data.username, email: res.data.email, password: '' });

        AsyncStorage.getItem('job_radius_km').then((value) => {
          if (value)
            setSavedRadius(value);
        });
      })
      .catch(() => Alert.alert('Error', 'Could not load profile'));
  }, [token]);

  const cancelEdit = () => {
    
    setUpdatedUser({ username: user.username, email: user.email, password: '' });
    setEditMode(false);
  }

  const handleLogout = () => {
    router.replace('/login');
  };

const handleUpdate = async () => {
  try {
    const payload: any = {
      username: updatedUser.username,
      email: updatedUser.email,
    };
    if (updatedUser.password) payload.password = updatedUser.password;

    const res = await axios.put(`${config.API_BASE_URL}/api/auth/user/update`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // If success:
    setUser({ username: res.data.username, email: res.data.email });
    setEditMode(false);
    setUpdatedUser({ username: res.data.username, email: res.data.email, password: '' });
    Alert.alert('Updated', 'Account updated successfully');
  } catch (err: any) {
    console.log('Update error response:', err.response?.data);
    Alert.alert('Error', err.response?.data?.message || 'Update failed');
  }
};


  const handleRadiusChange = () => {
    setRadiusModalVisible(true);
  };

  const saveRadius = async () => {
    if (!newRadius || isNaN(Number(newRadius))) {
      Alert.alert('Invalid input', 'Please enter a valid number');
      return;
    }

    try {
      await AsyncStorage.setItem('job_radius_km', newRadius);
      console.log('EMIT jobRadiusChanged', Number(newRadius));
      DeviceEventEmitter.emit('jobRadiusChanged', Number(newRadius)); // Notify other parts of the app
      setSavedRadius(newRadius);
      Alert.alert('Success', `Notification radius set to ${newRadius} KM`);
      setRadiusModalVisible(false);
      setNewRadius('');
    } catch (err) {
      Alert.alert('Error', 'Failed to save radius');
    }
  };

  const initial = user.username ? user.username[0].toUpperCase() : '?';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user.username}</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.infoSection}>
        {editMode ? (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              value={updatedUser.username}
              onChangeText={val => setUpdatedUser(prev => ({ ...prev, username: val }))}
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={updatedUser.email}
              onChangeText={val => setUpdatedUser(prev => ({ ...prev, email: val }))}
            />
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="New Password"
              secureTextEntry
              value={updatedUser.password}
              onChangeText={val => setUpdatedUser(prev => ({ ...prev, password: val }))}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>My Account</Text>
              <TouchableOpacity onPress={() => setEditMode(true)}>
                <Text style={{ color: '#007AFF', fontWeight: '500' }}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 15 }}>
              <Text style={styles.label}>Username</Text>
              <Text style={styles.valueText}>{user.username}</Text>

              <Text style={styles.label}>Email</Text>
              <Text style={styles.valueText}>{user.email}</Text>
            </View>
          </View>
        )}

      </View>
      <View style={styles.actions}>
        {savedRadius && (
          <Text style={styles.radiusText}>
            Current Radius: {savedRadius} KM
          </Text>
        )}
        <TouchableOpacity onPress={handleRadiusChange} style={styles.radiusButton}>
          <Text style={styles.radiusButtonText}>Set Notification Radius 📍</Text>
        </TouchableOpacity>
        <View style={{ height: 10 }} />
        <Button title="Logout" color="#d00" onPress={handleLogout} />
      </View>


      {/* Modal for radius input */}
      <Modal visible={radiusModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 18, marginBottom: 10 }}>
              Enter notification radius (in KM)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2"
              keyboardType="numeric"
              value={newRadius}
              onChangeText={setNewRadius}
            />
            <Button title="Save" onPress={saveRadius} />
            <View style={{ height: 10 }} />
            <Button title="Cancel" color="gray" onPress={() => setRadiusModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff' },

  header: { alignItems: 'center', marginBottom: 30 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  avatarText: { fontSize: 36, color: '#fff', fontWeight: '600' },

  name: { fontSize: 24, fontWeight: '600' },
  email: { fontSize: 16, color: '#666', marginTop: 4 },

  infoSection: { marginBottom: 30 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },

  form: { gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },

  actions: { marginTop: 10 },

  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    elevation: 5,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: '#eee',
    marginTop: 15,
  },
  radiusText: {
  fontSize: 16,
  color: '#333',
  textAlign: 'center',
  marginBottom: 10,
},

radiusButton: {
  borderColor: '#007AFF',
  borderWidth: 1,
  borderRadius: 8,
  paddingVertical: 12,
  paddingHorizontal: 15,
  alignItems: 'center',
  marginBottom: 10,
},

radiusButtonText: {
  color: '#007AFF',
  fontSize: 16,
  fontWeight: '500',
},
saveBtn: {
  backgroundColor: '#007AFF',
  paddingVertical: 12,
  borderRadius: 8,
  alignItems: 'center',
  marginTop: 10,
},
saveBtnText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
},
cancelBtn: {
  borderColor: '#ccc',
  borderWidth: 1,
  paddingVertical: 12,
  borderRadius: 8,
  alignItems: 'center',
  marginTop: 10,
},
cancelBtnText: {
  color: '#333',
  fontSize: 16,
},
rowBetween: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

label: {
  fontSize: 14,
  color: '#666',
  marginBottom: 5,
  marginTop: 10,
},

valueText: {
  fontSize: 16,
  color: '#000',
  marginBottom: 10,
},



});
