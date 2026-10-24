# Integración de Superpose API

El frontend no calcula rutas. Proyecta el grafo geográfico, anima los flujos y compara las dos asignaciones devueltas por el backend (Superpose con QAOA vs. Enrutamiento clásico con Dijkstra).

## Configuración

```env
VITE_SIMULATION_API_URL=https://superpose-api.vercel.app
VITE_SIMULATION_TIMEOUT_MS=30000
```

Para un backend local usa `http://localhost:8000`.

## Endpoints integrados y flujo en la aplicación

La aplicación consume activamente los **5 endpoints** oficiales del backend:

### 1. `GET /api/v1/topology`
* **Uso:** El botón **"Sincronizar"** en la barra superior consulta el estado actual de la red en memoria sin destruirlo.
* **Datos consumidos:** Nombres de distritos de Lima (`node_details`), métricas de vías (`length_km`, `speed_kmh`, `lanes`, `base_time`, `current_time`, `current_penalty`, `capacity`, `load`, `saturation`, `event`) y la lista de `active_events`.

### 2. `POST /api/v1/route/optimize` (Flujo 1: Planificar viaje manual)
* **Uso:** El panel **"1. Planificar mi viaje"** permite seleccionar cualquier origen y destino entre `NODO_A` y `NODO_F` y fijar la cantidad de vehículos del usuario.
* **Payload:**
  ```json
  { "origin": "NODO_A", "destination": "NODO_F", "vehicles": 1 }
  ```
* **Datos consumidos:** Desglose del tiempo del usuario (tiempo libre de viaje + penalización por atasco = tiempo estimado), comparación de costo de red (`user_time_saved`, `system_improvement_pct`), trayectorias (`qaoa_route` vs `selfish_route`) y telemetría cuántica (`qubits_used`, `optimal_bitstring`, `solver_used`, `top_probabilities`).

### 3. `POST /api/v1/events/report` (Flujo 2: Registrar eventos)
* **Uso:** Al hacer clic en cualquier arista en el mapa interactivo se despliega su **Ficha Técnica** y el formulario de reporte de eventos:
  * `ACCIDENT`: Bloqueo crítico (+5000 min tiempo fijo).
  * `TRAFFIC_JAM`: Congestión vial (1.8× tiempo, 4× penalización).
  * `ROADWORK`: Obras de mantenimiento (1.5× tiempo, 6× penalización).
* **Payload:**
  ```json
  { "source": "NODO_C", "target": "NODO_D", "event_type": "ACCIDENT" }
  ```
* Inmediatamente después se re-optimiza la red para reflejar los desvíos y los tiempos actualizados.

### 4. `POST /api/v1/events/reset`
* **Uso:** El botón **"Restablecer red"** restaura todas las aristas a condición `NORMAL`, limpia los eventos activos y devuelve la topología base limpia.

### 5. `PUT /api/v1/flows/background`
* **Uso:** El botón **"Flujos de fondo"** abre un modal para fijar en memoria los dos flujos concurrentes de la ciudad con presets rápidos (*Estándar*, *Hora Punta Matutina* o *Demanda Moderada*):
* **Payload:**
  ```json
  {
    "background_flows": [
      { "origin": "NODO_B", "destination": "NODO_F", "vehicles": 20 },
      { "origin": "NODO_A", "destination": "NODO_E", "vehicles": 30 }
    ]
  }
  ```
