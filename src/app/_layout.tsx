import '@/global.css';

import { AmiriQuran_400Regular, useFonts } from '@expo-google-fonts/amiri-quran';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'nativewind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { QURAN_DB_ASSET, QURAN_DB_NAME } from '@/lib/quran/db';
import { NAV_THEME } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  // Keep the native splash screen up until the Quran font is ready.
  const [fontsLoaded] = useFonts({ AmiriQuran_400Regular });
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']}>
        <SQLiteProvider databaseName={QURAN_DB_NAME} assetSource={{ assetId: QURAN_DB_ASSET }}>
          <Stack>
            <Stack.Screen name="index" options={{ title: 'Scan Tajwid' }} />
            <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            <Stack.Screen name="result" options={{ title: 'Hasil' }} />
          </Stack>
        </SQLiteProvider>
        <AnimatedSplashOverlay />
        <PortalHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
