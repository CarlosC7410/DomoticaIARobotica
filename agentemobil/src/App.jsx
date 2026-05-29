import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useIoTStore } from './store';
import QRScannerScreen from './screens/QRScannerScreen';
import ChatScreen from './screens/ChatScreen';

const Stack = createNativeStackNavigator();

function DisconnectButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.disconnectButton} onPress={onPress}>
      <Text style={styles.disconnectButtonText}>Desconectar</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const isConnected = useIoTStore((state) => state.isConnected);
  const serverIP = useIoTStore((state) => state.serverIP);
  const disconnect = useIoTStore((state) => state.disconnect);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a1a1a',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerBackTitle: 'Atrás',
        }}
      >
        {!isConnected ? (
          <Stack.Screen
            name="QRScanner"
            component={QRScannerScreen}
            options={{
              title: 'Escanear QR',
              headerShown: true,
            }}
          />
        ) : (
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              title: `Conectado a ${serverIP}`,
              headerRight: () => (
                <DisconnectButton onPress={disconnect} />
              ),
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  disconnectButton: {
    marginRight: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ff6b6b',
    borderRadius: 4,
  },
  disconnectButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});
