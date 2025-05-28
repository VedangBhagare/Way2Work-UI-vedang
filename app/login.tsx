import { Feather, FontAwesome } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: '46228661104-vplcjvmpir4ek87eic3r5kf96ibrbgs5.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      // Handle user info or navigation
      router.replace('/(tabs)/home');
    }
  }, [response]);

  const handleLogin = () => {
    if (email && password) {
      router.replace('/(tabs)/home');
    } else {
      Alert.alert('Missing Info', 'Please enter email and password');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.form}>
        <Text style={styles.title}>Sign In</Text>

        <View style={styles.inputWrapper}>
          <Feather name="mail" size={20} color="#000" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
          />
        </View>

        <View style={styles.inputWrapper}>
          <Feather name="lock" size={20} color="#000" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />
        </View>

        <TouchableOpacity>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.loginText}>Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={() => promptAsync()}
          disabled={!request}
        >
          <FontAwesome name="google" size={20} color="#DB4437" />
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/register')}>
          <Text style={styles.signUpText}>
            Don’t have an account? <Text style={{ fontWeight: 'bold' }}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B3D91'},
  topSection: {
    backgroundColor: '#0B3D91',
    height: '30%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 145,
    height: 145,
  },
  form: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopRightRadius: 100,
    height:'100%'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginVertical: 8,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 50,
  },
  forgotText: {
    textAlign: 'right',
    color: '#666',
    marginVertical: 10,
  },
  loginBtn: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
  },
  loginText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  googleBtn: {
    flexDirection: 'row',
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 15,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginVertical: 10,
  },
  googleText: {
    fontWeight: '500',
    marginLeft: 10,
  },
  signUpText: {
    textAlign: 'center',
    marginTop: 15,
    color: '#333',
  },
});
