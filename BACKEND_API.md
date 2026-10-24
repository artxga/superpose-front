# Integración de Superpose API

El frontend no calcula rutas. Proyecta el grafo geográfico, anima los flujos y compara las dos asignaciones devueltas por el backend.

## Configuración

```env
VITE_SIMULATION_API_URL=https://superpose-api.vercel.app
```

Para un backend local usa `http://localhost:8000`.

Si la variable no existe, el cliente usa esa misma URL. Cada petición se cancela tras `VITE_SIMULATION_TIMEOUT_MS` milisegundos (30000 por defecto). El backend permite CORS y expone los endpoints bajo `/api/v1`.

## Flujo conectado

Al iniciar:

1. `POST /api/v1/events/reset` devuelve la topología limpia.
2. `POST /api/v1/route/optimize` recibe `{ "origin": "NODO_A", "destination": "NODO_F", "vehicles": 1 }`. Tras un incidente se reutiliza el origen y destino del flujo `usuario` de la sesión.
3. El adaptador combina ambas respuestas y construye el mapa, las rutas y las trayectorias visuales.

Al reportar un evento:

1. El usuario selecciona una arista existente.
2. `POST /api/v1/events/report` recibe `source`, `target` y uno de `ACCIDENT`, `TRAFFIC_JAM` o `ROADWORK`.
3. Se ejecuta nuevamente `/api/v1/route/optimize` y se reemplazan las asignaciones animadas.

## Datos consumidos

La topología aporta:

- `node_details`: identificador, distrito, latitud y longitud.
- `edges`: distancia, velocidad, carriles, tiempo, capacidad, carga, saturación y evento.
- `active_events`: eventos vigentes.

La optimización aporta:

- `flows[].qaoa_route`: asignación conjunta QAOA.
- `flows[].selfish_route`: referencia tradicional con Dijkstra.
- `edge_loads`: carga y saturación de cada estrategia.
- `comparison`: costo de red y mejora porcentual.
- `quantum_telemetry`: qubits, bitstring, factibilidad, solver y duración.

El navegador transforma latitud/longitud al sistema de coordenadas SVG y dibuja una curva suave entre los extremos de cada arista. Esa curva es únicamente una decisión de representación: no agrega calles, cruces, rotondas ni conexiones al grafo.

## Escala visual

El escenario actual modela 51 vehículos: 1 del usuario, 20 del flujo B → F y 30 del flujo A → E. El selector de 10, 20 o 50 controla cuántos autos se dibujan, no cuántas variables usa QAOA. Cada auto visual indica cuántos vehículos agregados representa.

La vista previa carga un snapshot de `app/config.py` y del ejemplo documentado por el backend: 6 nodos, 8 aristas, 3 flujos, 2 rutas candidatas por flujo y 6 qubits. Los incidentes de la vista previa son respuestas precalculadas para demostrar la interacción; el modo Backend muestra la respuesta real del servidor.

## Fuente de verdad

La topología y los nombres de distrito vienen de Superpose API. La imagen `superpose_lima_map_1792868807820.jpg` se usa como referencia de jerarquía visual, pero no como definición del grafo. Si la imagen y `app/config.py` difieren, prevalece la configuración del backend.
