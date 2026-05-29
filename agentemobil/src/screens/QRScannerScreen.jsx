import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIoTStore } from '../store';

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const cameraRef = useRef(null);
  const { connectToServer, isConnected } = useIoTStore();

  // Pedir permiso de cámara
  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Solicitud de permiso de cámara</Text>
        <Button title="Permitir acceso a cámara" onPress={requestPermission} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No hay permiso de cámara</Text>
        <Text style={styles.message}>
          Necesitamos acceso a tu cámara para escanear códigos QR.
        </Text>
        <Button title="Permitir acceso" onPress={requestPermission} />
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setIsLoading(true);

    try {
      // Extraer IP del QR data (formato esperado: "192.168.1.121" o URL)
      let ip = data;

      // Si es una URL, extraer IP
      if (data.includes('://')) {
        const url = new URL(data);
        ip = url.hostname;
      }

      // Validar que sea una IP válida
      if (!isValidIP(ip)) {
        Alert.alert('Código QR inválido', 'No contiene una IP válida: ' + ip);
        setScanned(false);
        setIsLoading(false);
        return;
      }

      console.log('[QR] IP escaneada:', ip);

      // Conectar al servidor
      connectToServer(ip);

      // Esperar conexión
      setTimeout(() => {
        if (isConnected) {
          Alert.alert('Éxito', `Conectado a ${ip}`);
        } else {
          Alert.alert(
            'Error',
            `No se pudo conectar a ${ip}. Verifica que el servidor está corriendo.`
          );
          setScanned(false);
        }
        setIsLoading(false);
      }, 2000);
    } catch (error) {
      Alert.alert('Error', 'Ocurrió un error: ' + error.message);
      setScanned(false);
      setIsLoading(false);
    }
  };

  const isValidIP = (ip) => {
    const ipRegex =
      /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
    return ipRegex.test(ip);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        ref={cameraRef}
      >
        <View style={styles.overlay}>
          <View style={styles.topSection} />

          <View style={styles.middleSection}>
            <View style={styles.sideSection} />
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.sideSection} />
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.scanText}>
              Escanea el código QR del servidor
            </Text>
          </View>
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Conectando...</Text>
          </View>
        )}
      </CameraView>

      {scanned && !isLoading && (
        <View style={styles.buttonContainer}>
          <Button title="Escanear de nuevo" onPress={() => setScanned(false)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topSection: {
    flex: 0.2,
  },
  middleSection: {
    flex: 0.6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideSection: {
    flex: 1,
  },
  scanArea: {
    width: 250,
    height: 250,
    borderColor: '#00ff00',
    borderWidth: 2,
    justifyContent: 'space-between',
    alignItems: 'space-between',
  },
  corner: {
    width: 30,
    height: 30,
    borderColor: '#00ff00',
    borderWidth: 3,
    position: 'absolute',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomSection: {
    flex: 0.2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  buttonContainer: {
    padding: 20,
    backgroundColor: '#1f1f1f',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 30,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
