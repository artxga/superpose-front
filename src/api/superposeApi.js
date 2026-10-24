import { adaptSuperposeResponse } from '../data/superposeAdapter.js'

const API_BASE = (import.meta.env.VITE_SIMULATION_API_URL || 'https://superpose-api.vercel.app').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_SIMULATION_TIMEOUT_MS) || 30000
const DEFAULT_USER_TRIP = { origin: 'NODO_A', destination: 'NODO_F', vehicles: 1 }

const DEFAULT_BACKGROUND_FLOWS = [
  { origin: 'NODO_B', destination: 'NODO_F', vehicles: 20 },
  { origin: 'NODO_A', destination: 'NODO_E', vehicles: 30 },
]

async function request(path, options = {}) {
  const startedAt = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${API_BASE} no respondió en ${REQUEST_TIMEOUT_MS / 1000} s.`)
    }
    throw new Error(`No se pudo conectar con ${API_BASE}. ${error.message}`)
  } finally {
    clearTimeout(timeout)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = Array.isArray(payload?.detail)
      ? payload.detail.map((item) => item.msg).join('. ')
      : payload?.detail
    throw new Error(detail || payload?.message || payload?.error || `El servidor respondió ${response.status}`)
  }
  return { data: payload, latencyMs: performance.now() - startedAt }
}

function userTripFrom(session) {
  const userFlow = session?.flows?.find((flow) => flow.id === 'usuario')
  return userFlow
    ? { origin: userFlow.originId, destination: userFlow.destinationId, vehicles: userFlow.vehicles || 1 }
    : DEFAULT_USER_TRIP
}

/**
 * 1. GET /api/v1/topology
 * Obtiene el estado actual del grafo sin modificarlo.
 */
export async function getTopology() {
  return request('/api/v1/topology', { method: 'GET' })
}

/**
 * 2. POST /api/v1/route/optimize
 * Ejecuta la optimización híbrida cuántica QAOA comparada con Dijkstra.
 */
export async function optimizeRoute({ origin, destination, vehicles = 1, background_flows }) {
  const body = { origin, destination, vehicles }
  if (Array.isArray(background_flows) && background_flows.length === 2) {
    body.background_flows = background_flows
  }
  return request('/api/v1/route/optimize', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * 3. POST /api/v1/events/report
 * Reporta un evento dinámico (ACCIDENT, TRAFFIC_JAM, ROADWORK) en una arista.
 */
export async function reportEventAPI({ source, target, event_type }) {
  return request('/api/v1/events/report', {
    method: 'POST',
    body: JSON.stringify({ source, target, event_type }),
  })
}

/**
 * 4. POST /api/v1/events/reset
 * Restaura todas las aristas de la red al estado inicial NORMAL.
 */
export async function resetEventsAPI() {
  return request('/api/v1/events/reset', { method: 'POST' })
}

/**
 * 5. PUT /api/v1/flows/background
 * Fija en memoria los dos flujos de tráfico concurrentes de fondo.
 */
export async function updateBackgroundFlowsAPI(background_flows) {
  return request('/api/v1/flows/background', {
    method: 'PUT',
    body: JSON.stringify({ background_flows }),
  })
}

/**
 * Inicia la simulación conectada. Si reset es true, limpia los eventos; si no, obtiene la topología vigente.
 */
export async function startSimulation({ vehicleCount, trip = DEFAULT_USER_TRIP, backgroundFlows, reset = false }) {
  const startedAt = performance.now()
  const topologyResult = reset ? await resetEventsAPI() : await getTopology()
  const optimizationResult = await optimizeRoute({
    origin: trip.origin,
    destination: trip.destination,
    vehicles: trip.vehicles || 1,
    background_flows: backgroundFlows,
  })
  return {
    data: adaptSuperposeResponse({
      topology: topologyResult.data,
      optimization: optimizationResult.data,
      visualVehicleCount: vehicleCount,
      source: 'superpose-api',
    }),
    latencyMs: performance.now() - startedAt,
  }
}

/**
 * Reporta un incidente y recalcula la optimización para la ruta del usuario.
 */
export async function reportIncident(previousSession, { roadId, type }, visualVehicleCount, trip) {
  const [source, target] = roadId.split('--')
  if (!source || !target) throw new Error('La vía seleccionada no contiene dos nodos válidos.')

  const startedAt = performance.now()
  const topologyResult = await reportEventAPI({ source, target, event_type: type })
  const activeTrip = trip || userTripFrom(previousSession)
  const optimizationResult = await optimizeRoute({
    origin: activeTrip.origin,
    destination: activeTrip.destination,
    vehicles: activeTrip.vehicles || 1,
  })
  return {
    data: adaptSuperposeResponse({
      topology: topologyResult.data,
      optimization: optimizationResult.data,
      visualVehicleCount,
      previousSession,
      source: 'superpose-api',
    }),
    latencyMs: performance.now() - startedAt,
  }
}

/**
 * Sincroniza la topología actual del backend sin forzar un reset destructivo.
 */
export async function syncSimulation(previousSession, visualVehicleCount, trip) {
  const startedAt = performance.now()
  const topologyResult = await getTopology()
  const activeTrip = trip || userTripFrom(previousSession)
  const optimizationResult = await optimizeRoute({
    origin: activeTrip.origin,
    destination: activeTrip.destination,
    vehicles: activeTrip.vehicles || 1,
  })
  return {
    data: adaptSuperposeResponse({
      topology: topologyResult.data,
      optimization: optimizationResult.data,
      visualVehicleCount,
      previousSession,
      source: 'superpose-api',
    }),
    latencyMs: performance.now() - startedAt,
  }
}

/**
 * Actualiza los flujos de fondo con PUT /api/v1/flows/background y recalcula.
 */
export async function applyBackgroundFlows(previousSession, backgroundFlows, visualVehicleCount, trip) {
  const startedAt = performance.now()
  await updateBackgroundFlowsAPI(backgroundFlows)
  const topologyResult = await getTopology()
  const activeTrip = trip || userTripFrom(previousSession)
  const optimizationResult = await optimizeRoute({
    origin: activeTrip.origin,
    destination: activeTrip.destination,
    vehicles: activeTrip.vehicles || 1,
    background_flows: backgroundFlows,
  })
  return {
    data: adaptSuperposeResponse({
      topology: topologyResult.data,
      optimization: optimizationResult.data,
      visualVehicleCount,
      previousSession,
      source: 'superpose-api',
    }),
    latencyMs: performance.now() - startedAt,
  }
}

export { API_BASE, DEFAULT_USER_TRIP, DEFAULT_BACKGROUND_FLOWS }
