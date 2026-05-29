import { z } from "zod";

// ====== SCHEMAS DE VALIDACIÓN ======

// Evento: dispositivo se anuncia
export const DeviceHelloSchema = z.object({
  deviceName: z.string().min(1, "Device name required")
});

// Evento: mensaje de chat desde usuario
export const ChatMessageSchema = z.object({
  text: z.string().min(1, "Message text required"),
  timestamp: z.number().optional()
});

// Estado de LEDs (usado en respuesta y en estado compartido)
export const LedStateSchema = z.object({
  white: z.boolean(),
  yellow: z.boolean(),
  blue: z.boolean(),
  light: z.boolean().optional()
});

export const LedCommandSchema = z.object({
  white: z.boolean().optional(),
  yellow: z.boolean().optional(),
  blue: z.boolean().optional(),
  light: z.boolean().optional(),
  cuarto: z.boolean().optional(),
  foco: z.boolean().optional(),
  ventilador: z.boolean().optional(),
  puerta: z.enum(["abrir", "cerrar"]).optional().nullable()
});

// ====== SCHEMAS FASE 1: INTENT Y RESPUESTA LLM ======

// Tipo de intención: si se espera que es actuador o sensor
export const IntentTypeSchema = z.enum(["actuator", "sensor", "unknown"]);

// Comando con intención clasificada
export const CommandWithIntentSchema = z.object({
  text: z.string(),
  intent_type: IntentTypeSchema,
  target: z.string().optional(),  // ej: "led", "light", "temperature"
  operation: z.enum(["set", "toggle", "read", "query"]).optional(),
  confidence: z.number().min(0).max(1).optional()
});

// Respuesta enriquecida del backend (contiene intent_type)
export const BackendResponseSchema = z.object({
  user: z.string(),
  text: z.string(),
  intent_type: IntentTypeSchema.optional(),
  timestamp: z.number().optional(),
  messageId: z.string().optional()
});

// Respuesta desde el LLM con estructura enriquecida
export const LLMResponseSchema = z.object({
  reply: z.string(),
  intent_type: IntentTypeSchema,
  led_command: LedCommandSchema.optional()
});

// ====== HELPERS DE VALIDACIÓN ======

/**
 * Valida un evento de chat
 * @param {*} data - datos a validar
 * @returns {object} - datos validados o lanza ZodError
 */
export const validateChatMessage = (data) => {
  return ChatMessageSchema.parse(data);
};

/**
 * Valida un comando LED
 * @param {*} data - datos a validar
 * @returns {object} - datos validados
 */
export const validateLedCommand = (data) => {
  return LedCommandSchema.parse(data);
};

/**
 * Valida respuesta del LLM
 * @param {*} data - datos a validar
 * @returns {object} - datos validados
 */
export const validateLLMResponse = (data) => {
  return LLMResponseSchema.parse(data);
};

/**
 * Valida estado de LED
 * @param {*} data - datos a validar
 * @returns {object} - datos validados
 */
export const validateLedState = (data) => {
  return LedStateSchema.parse(data);
};

/**
 * Intenta validar de forma segura (no lanza error)
 * @param {*} data - datos a validar
 * @param {*} schema - schema Zod a usar
 * @returns {object} - { success: boolean, data?: object, error?: string }
 */
export const safeValidate = (data, schema) => {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors?.map(e => `${e.path.join(".")}: ${e.message}`).join("; ") || "Validation failed"
      };
    }
    return { success: false, error: error?.message || "Unknown error" };
  }
};
