# 🤖 Comandos de Inteligencia Artificial (Smart Home IoT)

El agente de Inteligencia Artificial procesa el lenguaje natural y deduce las intenciones del usuario para controlar los diferentes componentes de la maqueta física conectados al ESP32.

A continuación se detalla cómo interactuar con el sistema a través de la terminal, web o app móvil.

---

## 🏠 Componentes Controlables

La IA reconoce y mapea el control de 7 actuadores físicos en la maqueta:
- **Sala/Entrada** (LED Blanco)
- **Cocina** (LED Amarillo)
- **Baño** (LED Azul)
- **Cuarto** (LED Extra)
- **Foco General** (Módulo Relé, ideal para 110V/220V)
- **Ventilador** (Motor DC)
- **Puerta** (Servomotor)

---

## 🗣️ Ejemplos de Lenguaje Natural

No es necesario usar comandos rígidos como "encender foco". Puedes hablarle al sistema de forma natural y este encenderá/apagará los actuadores lógicos.

### Iluminación individual
- *"Llegué a la casa, prende la luz de la entrada."*
- *"Apaga el foco del baño, lo dejaron encendido."*
- *"Enciende la cocina y el cuarto por favor."*

### Climatización (Ventilador)
- *"Hace mucho calor aquí, ¿puedes prender el ventilador?"*
- *"Apaga el motor del ventilador, ya hace frío."*

### Control de Acceso (Puerta)
- *"Abre la puerta principal, estoy afuera."*
- *"Cierra la puerta por seguridad."*

### Combinaciones (Múltiples Acciones a la vez)
El modelo es capaz de deducir múltiples comandos en una sola instrucción:
- *"Me voy a dormir. Apaga todas las luces de la sala, la cocina y el baño, pero asegúrate de cerrar la puerta."*
- *"Va a haber una fiesta: prende el foco principal, el ventilador y abre la puerta para los invitados."*

---

## 📡 Cómo funciona internamente

Cuando envías un mensaje, el sistema realiza lo siguiente:
1. El backend de Node.js recibe el chat y lo envía al servicio Python (`FastAPI`).
2. El servicio Python usa el modelo local de Ollama (ej. `qwen2.5`) con un *System Prompt* estricto para forzar una respuesta en formato JSON puro.
3. El JSON es validado usando *Zod* en el backend de Node.js.
4. El backend lee el objeto interno `led_command` y dispara los webhooks y WebSockets hacia el ESP32 para cambiar los pines digitales correspondientes.

### Formato de salida del LLM (Para desarrolladores)
```json
{
  "reply": "Entendido, abriendo la puerta y encendiendo el ventilador.",
  "led_command": {
    "white": null,
    "yellow": null,
    "blue": null,
    "cuarto": null,
    "foco": null,
    "ventilador": true,
    "puerta": "abrir"
  }
}
```
