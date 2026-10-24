import { adaptSuperposeResponse } from '../data/superposeAdapter.js'

const API_BASE = (import.meta.env.VITE_SIMULATION_API_URL || 'https://superpose-api.vercel.app').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_SIMULATION_TIMEOUT_MS) || 30000
const DEFAULT_USER_TRIP = { origin: 'NODO_A', destination: 'NODO_F' }

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
    ? { origin: userFlow.originId, destination: userFlow.destinationId }
    : DEFAULT_USER_TRIP
}

async function optimize({ origin, destination }) {
  return request('/api/v1/route/optimize', {
    method: 'POST',
    body: JSON.stringify({ origin, destination, vehicles: 1 }),
  })
}

export async function startSimulation({ vehicleCount, trip = DEFAULT_USER_TRIP }) {
  const startedAt = performance.now()
  const topologyResult = await request('/api/v1/events/reset', { method: 'POST' })
  const optimizationResult = await optimize(trip)
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

export async function reportIncident(previousSession, { roadId, type }, visualVehicleCount) {
  const [source, target] = roadId.split('--')
  if (!source || !target) throw new Error('La vía seleccionada no contiene dos nodos válidos.')

  const startedAt = performance.now()
  const topologyResult = await request('/api/v1/events/report', {
    method: 'POST',
    body: JSON.stringify({ source, target, event_type: type }),
  })
  const optimizationResult = await optimize(userTripFrom(previousSession))
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

export { API_BASE, DEFAULT_USER_TRIP }
