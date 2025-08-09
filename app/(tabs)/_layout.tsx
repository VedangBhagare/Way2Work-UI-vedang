// app/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

export default function Layout() {
  const router = useRouter();
  const { token } = useLocalSearchParams(); // ✅ get token from route

  useEffect(() => {
    // Handle taps while app is running / backgrounded
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const jobId = resp?.notification?.request?.content?.data?.jobId as string | undefined;
      if (jobId) {
        router.replace({
          pathname: '/(tabs)/home',
          params: { token: token as string | undefined, openJobId: String(jobId) },
        });
      }
    });

    // Handle cold start (app launched by tapping a notification)
    (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      const jobId = last?.notification?.request?.content?.data?.jobId as string | undefined;
      if (jobId) {
        router.replace({
          pathname: '/home',
          params: { token: token as string | undefined, openJobId: String(jobId) },
        });
      }
    })();

    return () => sub.remove();
  }, [router, token]);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="home"
        initialParams={{ token }} // ✅ pass token here
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        initialParams={{ token }} // ✅ pass token here
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        initialParams={{ token }} // ✅ pass token here
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
