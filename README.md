# Qflow

Primera interfaz conceptual para un sistema de movilidad que coordina rutas mediante optimización cuántica. Qflow no busca la mejor ruta para cada conductor de forma aislada: busca la mejor asignación conjunta para toda la red.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

## Conectar el simulador

El laboratorio incluye una vista previa jugable basada en un snapshot del backend y un modo conectado. Ninguno calcula rutas en el navegador. Por defecto el modo conectado usa la API desplegada en `https://superpose-api.vercel.app`; para otro backend copia `.env.example` como `.env.local` y cambia `VITE_SIMULATION_API_URL`. La integración está descrita en [`BACKEND_API.md`](./BACKEND_API.md).

El modo conectado consume directamente `POST /api/v1/events/reset`, `POST /api/v1/route/optimize` y `POST /api/v1/events/report`. La demo local reproduce un snapshot de la topología, las rutas y la telemetría documentadas por el backend, sin ejecutar el algoritmo en el navegador.

La vista previa incluye tres flujos origen-destino, tres incidentes y una prueba A/B interactiva. El modo tradicional muestra `selfish_route` de NetworkX/Dijkstra; Qflow muestra `qaoa_route` y `quantum_telemetry`. El mapa proyecta las coordenadas de Lima incluidas por el backend y conserva exactamente sus seis nodos y ocho vías.

## Producción

```bash
npm run build
npm run preview
```

La carpeta generada es `dist/`. Para publicarlo en Vercel sigue [`DEPLOY.md`](./DEPLOY.md).
