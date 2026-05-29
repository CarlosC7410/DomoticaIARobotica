import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useIoTStore } from '../store';

export default function ChatScreen() {
  const {
    isConnected,
    messages,
    sendMessage,
    serverIP,
    devices,
    ledState,
  } = useIoTStore();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    // Scroll al último mensaje
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !isConnected) return;

    setIsSending(true);
    sendMessage(inputText.trim());
    setInputText('');

    setTimeout(() => {
      setIsSending(false);
    }, 500);
  };

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.disconnectedContainer}>
          <Text style={styles.title}>No conectado</Text>
          <Text style={styles.message}>
            Por favor, escanea un código QR para conectarte al servidor.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const getIntentTypeColor = (intentType) => {
    switch (intentType) {
      case 'actuator':
        return '#ff6b6b';
      case 'sensor':
        return '#51cf66';
      case 'unknown':
        return '#888';
      default:
        return '#888';
    }
  };

  const getIntentTypeLabel = (intentType) => {
    switch (intentType) {
      case 'actuator':
        return '⚙️';
      case 'sensor':
        return '📊';
      default:
        return 'ℹ️';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header con información de conexión */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>IoT Agent</Text>
          <Text style={styles.connected}>● Conectado a {serverIP}</Text>
        </View>
        <View style={styles.devicesInfo}>
          <Text style={styles.devicesCount}>
            {devices.length} dispositivo{devices.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Estado de LEDs */}
      <View style={styles.ledStatusContainer}>
        <Text style={styles.ledStatusLabel}>Estado LEDs:</Text>
        <View style={styles.ledGrid}>
          {[
            { name: 'Blanco', value: ledState.white },
            { name: 'Amarillo', value: ledState.yellow },
            { name: 'Azul', value: ledState.blue },
            { name: 'Foco', value: ledState.light },
          ].map((led) => (
            <View
              key={led.name}
              style={[
                styles.ledIndicator,
                led.value ? styles.ledOn : styles.ledOff,
              ]}
            >
              <Text style={styles.ledName}>{led.name}</Text>
              <Text style={styles.ledStatus}>{led.value ? 'ON' : 'OFF'}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Mensajes */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={({ item, index }) => (
          <View
            key={index}
            style={[
              styles.messageContainer,
              item.user === 'Usuario'
                ? styles.userMessage
                : styles.iaMessage,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                item.user === 'Usuario'
                  ? styles.userBubble
                  : styles.iaBubble,
              ]}
            >
              <View style={styles.messageHeader}>
                <Text style={styles.user}>{item.user}</Text>
                {item.intent_type && (
                  <View
                    style={[
                      styles.intentBadge,
                      {
                        borderColor: getIntentTypeColor(item.intent_type),
                      },
                    ]}
                  >
                    <Text style={styles.intentLabel}>
                      {getIntentTypeLabel(item.intent_type)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.messageText}>{item.text}</Text>
              {item.timestamp && (
                <Text style={styles.timestamp}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
              )}
            </View>
          </View>
        )}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Envía un mensaje para empezar
            </Text>
          </View>
        }
      />

      {/* Input de mensaje */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un comando o pregunta..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          editable={!isSending}
          multiline
          maxHeight={120}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!isConnected || isSending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMessage}
          disabled={!isConnected || isSending || !inputText.trim()}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Enviar</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomColor: '#333',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  connected: {
    fontSize: 12,
    color: '#51cf66',
    marginTop: 4,
  },
  devicesInfo: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  devicesCount: {
    color: '#fff',
    fontSize: 12,
  },
  ledStatusContainer: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomColor: '#333',
    borderBottomWidth: 1,
  },
  ledStatusLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  ledGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  ledIndicator: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  ledOn: {
    backgroundColor: 'rgba(81, 207, 102, 0.2)',
    borderColor: '#51cf66',
  },
  ledOff: {
    backgroundColor: 'rgba(120, 120, 120, 0.1)',
    borderColor: '#666',
  },
  ledName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  ledStatus: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
  },
  messagesList: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  messageContainer: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  iaMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: '#007aff',
  },
  iaBubble: {
    backgroundColor: '#333',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  user: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  intentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  intentLabel: {
    fontSize: 11,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
  },
  timestamp: {
    color: '#999',
    fontSize: 11,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  disconnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderTopColor: '#333',
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  sendButtonDisabled: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
