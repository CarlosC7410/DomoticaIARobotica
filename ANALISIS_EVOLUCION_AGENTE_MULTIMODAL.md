# Analisis tecnico para evolucion del agente IoT a multimodal (texto + voz + movil)

Fecha: 2026-03-19
Ubicacion del analisis: c:\Users\juanc\ProyectosJS\Proyectos Visual Studio Code

## 1) Resumen ejecutivo

El stack actual ya resuelve un flujo funcional de control de actuadores (LEDs) por lenguaje natural escrito:

- Frontend web React (`Agente`) envia `chat:message` por Socket.IO.
- Backend Node/Express (`Backend`) orquesta chat, llama al servicio LLM y emite `led:command`.
- Servicio IA en FastAPI (`ProyectoIA`) transforma texto libre a JSON estructurado.
- ESP32 (`ConexionRedAI.ino`) ejecuta comando y reporta `led:state`.

Para cumplir el objetivo nuevo (instrucciones naturales por voz + respuesta hablada del agente + app movil con Expo + onboarding por QR) faltan 5 capacidades:

1. Canal de entrada de voz (captura audio + STT).
2. Descubrimiento/pareado movil por QR.
3. Router de intenciones para decidir sensor vs actuador de forma explicita.
4. Canal de salida por voz (TTS) para que el agente tambien conteste hablando.
5. Persistencia (DB) para trazabilidad, sesiones, dispositivos y telemetria (si se escala a multiusuario/multidispositivo).

## 2) Inventario del estado actual (codigo revisado)

### 2.1 Frontend web (`Agente`)

- Stack: React 19 + Vite 7 + `socket.io-client@4.8.3`.
- Funciones actuales:
  - Captura IP del backend y valida `/health`.
  - Chat global en tiempo real.
  - Visualiza estado de LEDs (`white`, `yellow`, `blue`).
- No existe:
  - Captura de voz.
  - Escaneo QR.
  - Autenticacion.
  - Manejo multi-dispositivo.

### 2.2 Backend (`Backend`)

- Stack: Express 4 + Socket.IO 4 + CORS.
- Funciones actuales:
  - Endpoints: `/health`, `/api/echo`, `/api/test-llm`.
  - Evento `chat:message` -> llama LLM -> emite respuesta IA + `led:command`.
  - Evento `led:state` -> reemite al frontend.
- No existe:
  - Persistencia (sin DB).
  - Registro de dispositivos/capacidades.
  - ACL/autorizacion por socket.
  - Contrato de eventos versionado.

### 2.3 Servicio IA (`ProyectoIA`)

- Stack: FastAPI + requests + Ollama local.
- Funciones actuales:
  - Prompt de sistema restringe salida JSON con `reply` y `led_command`.
  - Sanitizacion robusta de booleans para LEDs.
- Limitacion actual:
  - Dominio cerrado solo a LEDs.
  - No clasifica intenciones de sensor/consulta/automatizacion.

### 2.4 Firmware ESP32 (`ConexionRedAI.ino`)

- Stack: `WiFi.h`, `SocketIOclient.h`, `ArduinoJson.h`.
- Funciones actuales:
  - Recibe `led:command` y aplica estado a 3 pines.
  - Publica `led:state`.
  - Reporta `device:hello`.
- Hallazgo relevante:
  - Credenciales WiFi embebidas en codigo (riesgo de seguridad).

## 3) Brecha contra el objetivo solicitado

Objetivo solicitado:

- Mantener instrucciones por texto.
- Agregar instrucciones en lenguaje natural por voz.
- Decidir sensor/actuador desde la intencion del usuario.
- Conectar front-backend-LLM por sockets.
- Tener app movil con React Native + Expo y prueba por QR.

Brechas concretas:

1. No hay pipeline de audio (microfono -> transcripcion -> comando).
2. No hay capa de "decision de destino" (sensor o actuador) generalizada.
3. No hay protocolo de pareado movil via QR.
4. No existe canal de respuesta por voz ni configuracion de tono/estilo.
5. No hay persistencia para auditoria, estados historicos ni sesiones.

## 4) Arquitectura objetivo recomendada

## 4.1 Principio de compatibilidad

Mantener compatibilidad con el flujo actual (`chat:message`, `led:command`, `led:state`) y extender sin romper:

- Nuevo canal `voice:transcript` (texto ya transcrito).
- Nuevo esquema de salida del LLM con `actions[]` y `queries[]`.
- Adaptador de compatibilidad para mapear `actions` a `led_command` cuando aplique.

## 4.2 Flujo propuesto multimodal

1. Usuario habla desde app movil Expo.
2. App graba audio y obtiene transcripcion (STT local o STT en backend).
3. App envia texto normalizado por socket (`chat:message` o `voice:transcript`).
4. Backend llama al LLM con contexto de capacidades del dispositivo.
5. LLM responde accion estructurada:
   - `target_type`: `actuator` o `sensor`
   - `target`: `led`, `relay`, `temperature`, etc.
   - `operation`: `set`, `toggle`, `read`
   - `params`
6. Backend enruta:
   - si es actuador -> `device:command`
   - si es sensor -> `device:query` y espera `device:telemetry`
7. Backend publica respuesta al cliente + estado/lectura.
8. Backend decide perfil de voz (voiceId, pitch, rate, style) segun preferencia del usuario.
9. Se genera audio TTS (en movil o en backend, segun modo elegido).
10. Cliente reproduce la respuesta hablada.

## 4.3 Canal de salida de voz (TTS) recomendado

Para no romper el contrato actual, agregar eventos nuevos:

- `tts:request`
  - backend -> cliente: `{ text, profileId, source: "local-mobile" | "local-pi" | "cloud" }`
- `tts:audio`
  - backend -> cliente: `{ audioUrl|audioBase64, format, durationMs, profileId }` (si el TTS corre en backend)
- `tts:profile:update`
  - cliente -> backend: `{ profileId, voiceId, pitch, rate, volume, stylePrompt }`

Regla practica:

- Si `source=local-mobile` -> la app usa `expo-speech` con `voice`, `pitch`, `rate`.
- Si `source=local-pi` -> backend genera audio con Piper y envia URL/stream.
- Si `source=cloud` -> backend usa TTS cloud con instrucciones de estilo.

## 4.4 Modelo de decision sensor/actuador

Para tu caso actual, el LLM debe decidir entre:

- Actuador primario: LEDs (`white`, `yellow`, `blue`).
- Sensor actual: estado reportado del dispositivo (`led:state`) como "sensor logico".
- Sensores sugeridos para siguiente fase:
  - Temperatura/humedad (DHT22).
  - Luz ambiente (LDR/BH1750).
  - Presencia (PIR).

Regla de negocio recomendada:

- Si el verbo es de accion (`encender`, `apagar`, `cambiar`) -> `actuator`.
- Si el verbo es de consulta (`cuanto`, `estado`, `nivel`, `temperatura`) -> `sensor`.
- Si hay ambiguedad -> respuesta aclaratoria, no ejecutar hardware.

## 5) Librerias compatibles con el stack actual

## 5.1 Manteniendo web + backend actuales

Compatibles directas con tu stack Node/React:

- `socket.io-client` / `socket.io` (ya en uso y version alineada 4.8.3).
- `zod` para validar contratos de eventos (frontend, backend, servicio IA).
- `pino` + `pino-http` para trazabilidad de eventos.
- `express-rate-limit` para proteger endpoints publicos.

## 5.2 Para app movil Expo (React Native)

Librerias recomendadas:

- `expo-camera` para escaneo QR (soporta deteccion de codigos en `CameraView` y callback `onBarcodeScanned`).
- `expo-audio` para grabacion/reproduccion de audio (canal de voz).
- `expo-speech` para TTS (respuesta hablada del agente, opcional).
- `socket.io-client` para tiempo real con el backend.

STT (speech-to-text) tienes 2 rutas:

A) Ruta simple y estable para arrancar:
- Capturar audio con `expo-audio` y transcribir en backend (servicio STT).
- Ventaja: evita friccion de modulos nativos en la app inicialmente.

B) Ruta STT on-device:
- `@react-native-voice/voice`.
- Requiere Development Build (no funciona en Expo Go) y config plugin.

## 5.3 Consideracion Expo Go vs Development Build

- Para QR con `expo-camera` puedes iniciar en Expo Go.
- Para audio/TTS con modulos Expo tambien puedes iniciar rapido.
- Si agregas librerias con codigo nativo no incluido en Expo Go (ej. `@react-native-voice/voice`), debes migrar a Development Build.

## 5.4 Respuesta por voz y control de tono (propuesta para Raspberry Pi 5 - 8 GB)

### Opcion A: TTS en el movil (mas practica para iniciar)

- Tecnologia: `expo-speech`.
- Donde corre: telefono (no carga CPU en la Raspberry).
- Control de tono: `pitch`, `rate`, `voice`, `volume`.
- Ventajas:
  - Implementacion rapida.
  - Funciona en Expo Go.
  - Costo cero de inferencia.
- Desventajas:
  - La voz depende del dispositivo del usuario (no siempre suena igual).

### Opcion B: TTS local en Raspberry (offline y consistente)

- Tecnologia: `piper-tts` (repo activo: `OHF-Voice/piper1-gpl`).
- Donde corre: Raspberry Pi 5.
- Control de tono:
  - principal por seleccion de voz/modelo.
  - ajuste por velocidad/prosodia en pre/post-procesamiento.
- Ventajas:
  - Offline, privado, sin costo por request.
  - Voz consistente para todos los clientes.
- Desventajas:
  - Mantenimiento extra (modelos de voz y servicio TTS).
  - Licenciamiento GPL-3.0 del engine base (revisar implicaciones si distribuyes binarios).

### Opcion C: TTS cloud via LLM (maxima naturalidad)

- Tecnologia: API de TTS con `gpt-4o-mini-tts`.
- Control de tono:
  - `voice` + `instructions` (ej. "Speak in a calm and professional tone.").
  - opcion de voces personalizadas para cuentas elegibles.
- Ventajas:
  - Mejor expresividad y control de estilo.
  - Streaming de audio para baja latencia percibida.
- Desventajas:
  - Requiere internet y costo por uso.
  - Dependencia de servicio externo.

### Recomendacion concreta para tu caso (practica)

1. Fase inicial (1-2 semanas): Opcion A (`expo-speech`) para validar UX completa de voz.
2. Fase estable local: Opcion B (Piper en Raspberry) para modo offline y voz consistente.
3. Fase premium opcional: Opcion C solo si necesitas voz mas "humana" o estilos muy variables.

Implementacion hibrida recomendada:

- Campo `ttsMode` por usuario/sesion: `mobile_local | pi_local | cloud`.
- Perfil persistente `voice_profile` con:
  - `provider`, `voiceId`, `pitch`, `rate`, `volume`, `stylePrompt`, `language`.
- El LLM NO sintetiza audio: solo decide contenido textual y (opcionalmente) etiquetas de estilo.

## 6) QR para pareado y pruebas

Implementacion recomendada de onboarding por QR:

1. Backend genera token de pareado de un solo uso (TTL 2-5 min).
2. Front web muestra QR con URL o deep link (ej. `iot-agent://pair?token=...`).
3. App Expo escanea QR (`expo-camera` + `onBarcodeScanned`).
4. App envia token al backend y recibe config:
   - host/puerto socket
   - deviceId/sessionId
   - capabilities
5. App abre socket y queda enlazada al entorno.

Beneficio:

- Elimina entrada manual de IP en movil.
- Reduce errores de conexion.
- Permite sesiones temporales seguras.

## 7) Base de datos: se requiere o no?

## 7.1 Cuando NO es obligatoria

Puedes seguir sin DB si el alcance es:

- 1 usuario local.
- 1 dispositivo ESP32.
- Sin historial, auditoria ni autenticacion.

## 7.2 Cuando SI conviene introducir DB

Recomendada en cuanto quieras:

- Historial de comandos y respuestas.
- Telemetria historica de sensores.
- Multi-dispositivo.
- Multiusuario/roles.
- Reintentos y trazabilidad operacional.

## 7.3 Recomendacion de DB para tu stack

Recomendacion principal:

- PostgreSQL + Prisma en el backend Node.

Por que:

- Encaja bien con Express y crecimiento futuro.
- Soporta consultas analiticas de historial/telemetria.
- Buen equilibrio entre robustez y simplicidad.

Modelo minimo sugerido:

- `devices` (id, nombre, tipo, capabilities, last_seen, status).
- `sessions` (id, client_type, client_id, created_at, expires_at).
- `commands` (id, source_text, normalized_intent, status, created_at).
- `actions` (id, command_id, device_id, action_type, payload, ack_at).
- `sensor_readings` (id, device_id, sensor_type, value, unit, timestamp).

## 8) Roadmap recomendado (incremental)

Fase 1 (sin romper nada actual):

- Estandarizar contrato de eventos con esquemas (`zod`).
- Agregar `intent_type` (`actuator` / `sensor`) en respuesta del LLM.
- Logging estructurado en backend.

Fase 2 (movil y QR):

- Crear app Expo minima (chat + estado).
- Agregar escaneo QR de pareado.
- Conectar Socket.IO desde movil.

Fase 3 (voz):

- Captura audio en Expo.
- STT en backend (ruta recomendada inicial).
- Publicar texto al pipeline actual del LLM.
- Activar respuesta hablada del agente (TTS).
- Agregar pantalla de configuracion de voz (voz, tono, velocidad, volumen, estilo).
- Introducir selector `ttsMode`: movil local / Raspberry local / cloud.

Fase 4 (persistencia y seguridad):

- Incorporar PostgreSQL + Prisma.
- Guardar comandos, acciones y telemetria.
- Tokens de sesion, expiracion y autorizacion por socket.

Fase 5 (sensores reales):

- Agregar al menos 1 sensor fisico (DHT22 o PIR).
- Extender prompt LLM con catalogo de capacidades por dispositivo.
- Enrutar `device:query` y consolidar `device:telemetry`.

## 9) Riesgos tecnicos detectados y mitigacion

- Riesgo: sobre-ejecucion por respuestas ambiguas del LLM.
  - Mitigacion: validacion de esquema + politica "si hay duda, preguntar".

- Riesgo: credenciales en firmware.
  - Mitigacion: provisionamiento por serial o archivo local no versionado.

- Riesgo: divergencia de contratos entre front/back/LLM/firmware.
  - Mitigacion: paquete compartido de tipos/esquemas y tests de contrato.

- Riesgo: depender solo de LAN/IP manual.
  - Mitigacion: pareado por QR + token temporal.

## 10) Fuentes tecnicas validadas (compatibilidad)

- Expo Camera (QR/barcode, `onBarcodeScanned`, disponibilidad):
  - https://docs.expo.dev/versions/latest/sdk/camera/
- Expo Audio (grabacion/reproduccion):
  - https://docs.expo.dev/versions/latest/sdk/audio/
- Expo Speech (TTS):
  - https://docs.expo.dev/versions/latest/sdk/speech/
- Compatibilidad de librerias y uso de Development Builds en Expo:
  - https://docs.expo.dev/workflow/using-libraries/
  - https://docs.expo.dev/develop/development-builds/introduction/
- `@react-native-voice/voice` (requiere codigo nativo / no Expo Go):
  - https://github.com/react-native-voice/voice
- Socket.IO client options (transports, nota React Native):
  - https://socket.io/docs/v4/client-options/
- Piper (engine TTS local actual, repo activo):
  - https://github.com/OHF-Voice/piper1-gpl
- Vosk (STT offline, compatible con Raspberry Pi):
  - https://alphacephei.com/vosk/
- OpenAI TTS (control de voz/estilo por `voice` e `instructions`):
  - https://developers.openai.com/api/docs/guides/text-to-speech

## 11) Conclusion practica

Tu base actual es correcta y reutilizable. Para una Raspberry Pi 5 con 8 GB, la ruta mas practica es:

1. Arrancar con `expo-speech` (respuesta por voz inmediata y configurable sin sobrecargar la Pi).
2. Migrar a Piper en backend cuando quieras modo offline consistente.
3. Dejar TTS cloud como modo opcional para voces mas expresivas.

Con eso mantienes compatibilidad hacia atras con el flujo actual de LEDs y agregas voz de forma incremental y controlada.
