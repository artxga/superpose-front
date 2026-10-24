import { adaptSuperposeResponse, buildEdgeLoads, edgeId } from './superposeAdapter.js'

export const BACKEND_TOPOLOGY_SNAPSHOT = {
  node_details: [
    { id: 'NODO_A', label: 'Callao', lat: -12.057, lon: -77.118 },
    { id: 'NODO_B', label: 'Los Olivos', lat: -11.990, lon: -77.070 },
    { id: 'NODO_C', label: 'Cercado de Lima', lat: -12.046, lon: -77.043 },
    { id: 'NODO_D', label: 'San Isidro', lat: -12.098, lon: -77.037 },
    { id: 'NODO_E', label: 'San Juan de Lurigancho', lat: -12.003, lon: -77.008 },
    { id: 'NODO_F', label: 'La Molina', lat: -12.083, lon: -76.942 },
  ],
  edges: [
    { source: 'NODO_A', target: 'NODO_C', length_km: 10.72, speed_kmh: 50, lanes: 3, base_time: 12.86, current_time: 12.86, current_penalty: 21.44, capacity: 45, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_C', target: 'NODO_D', length_km: 7.56, speed_kmh: 50, lanes: 3, base_time: 9.07, current_time: 9.07, current_penalty: 15.12, capacity: 45, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_D', target: 'NODO_F', length_km: 13.60, speed_kmh: 50, lanes: 3, base_time: 16.32, current_time: 16.32, current_penalty: 27.20, capacity: 45, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_A', target: 'NODO_B', length_km: 11.83, speed_kmh: 35, lanes: 2, base_time: 20.28, current_time: 20.28, current_penalty: 23.66, capacity: 30, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_B', target: 'NODO_D', length_km: 16.29, speed_kmh: 30, lanes: 2, base_time: 32.58, current_time: 32.58, current_penalty: 32.58, capacity: 30, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_B', target: 'NODO_E', length_km: 8.97, speed_kmh: 35, lanes: 2, base_time: 15.38, current_time: 15.38, current_penalty: 17.94, capacity: 30, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_E', target: 'NODO_F', length_km: 14.86, speed_kmh: 35, lanes: 2, base_time: 25.47, current_time: 25.47, current_penalty: 29.72, capacity: 30, load: 0, saturation: 0, event: 'NORMAL' },
    { source: 'NODO_C', target: 'NODO_E', length_km: 7.94, speed_kmh: 30, lanes: 1, base_time: 15.88, current_time: 15.88, current_penalty: 15.88, capacity: 15, load: 0, saturation: 0, event: 'NORMAL' },
  ],
  active_events: [],
}

const BASE_FLOWS = [
  { name: 'usuario', origin: 'NODO_A', destination: 'NODO_F', vehicles: 1, qaoa_route: ['NODO_A', 'NODO_C', 'NODO_E', 'NODO_F'], selfish_route: ['NODO_A', 'NODO_C', 'NODO_D', 'NODO_F'] },
  { name: 'fondo_1', origin: 'NODO_B', destination: 'NODO_F', vehicles: 20, qaoa_route: ['NODO_B', 'NODO_D', 'NODO_F'], selfish_route: ['NODO_B', 'NODO_E', 'NODO_F'] },
  { name: 'fondo_2', origin: 'NODO_A', destination: 'NODO_E', vehicles: 30, qaoa_route: ['NODO_A', 'NODO_B', 'NODO_E'], selfish_route: ['NODO_A', 'NODO_C', 'NODO_E'] },
]

function optimizationFixture({
  flows = BASE_FLOWS,
  topology = BACKEND_TOPOLOGY_SNAPSHOT,
  optimized = { travel_time: 54.21, congestion_penalty: 0, estimated_time: 54.21 },
  selfish = { travel_time: 38.25, congestion_penalty: 33.232, estimated_time: 71.482 },
  comparison = {
    user_time_saved: 17.272,
    user_improvement_pct: 24.16,
    system_cost_optimized: 138.77,
    system_cost_selfish: 174.304,
    system_improvement_pct: 20.39,
  },
  executionTimeMs = 184.22,
  totalTimeMs = 185.38,
} = {}) {
  return {
    optimized,
    selfish,
    flows,
    edge_loads: buildEdgeLoads(topology, flows),
    comparison,
    quantum_telemetry: {
      qubits_used: 6,
      optimal_bitstring: '010101',
      variables: ['x_0_0', 'x_0_1', 'x_1_0', 'x_1_1', 'x_2_0', 'x_2_1'],
      execution_time_ms: executionTimeMs,
      solver_used: 'QAOA',
      feasible: true,
      objective_scale: 0.86436,
    },
    total_time_ms: totalTimeMs,
  }
}

export const BACKEND_OPTIMIZATION_SNAPSHOT = optimizationFixture()

export const MOCK_INCIDENTS = [
  { id: 'accident-cd', label: 'Accidente · C–D', roadId: 'NODO_C--NODO_D', roadLabel: 'C–D · Cercado–San Isidro', type: 'ACCIDENT', finding: 'El accidente bloquea C–D y obliga a comparar alternativas válidas del grafo.' },
  { id: 'roadwork-bd', label: 'Obras · B–D', roadId: 'NODO_B--NODO_D', roadLabel: 'B–D · Los Olivos–San Isidro', type: 'ROADWORK', finding: 'Las obras penalizan B–D y QAOA redistribuye el flujo B → F.' },
  { id: 'traffic-df', label: 'Congestión · D–F', roadId: 'NODO_D--NODO_F', roadLabel: 'D–F · San Isidro–La Molina', type: 'TRAFFIC_JAM', finding: 'La congestión en D–F muestra el costo de que varios flujos elijan de forma aislada.' },
]

const EVENT_MODIFIERS = {
  ACCIDENT: { timeMultiplier: 1, penaltyMultiplier: 1, blockedTime: 5000 },
  ROADWORK: { timeMultiplier: 1.5, penaltyMultiplier: 6 },
  TRAFFIC_JAM: { timeMultiplier: 1.8, penaltyMultiplier: 4 },
}

function topologyWithEvent(scenario) {
  const modifier = EVENT_MODIFIERS[scenario.type]
  const edges = BACKEND_TOPOLOGY_SNAPSHOT.edges.map((edge) => {
    if (edgeId(edge.source, edge.target) !== scenario.roadId) return { ...edge }
    return {
      ...edge,
      current_time: modifier.blockedTime ?? Number((edge.base_time * modifier.timeMultiplier).toFixed(2)),
      current_penalty: Number((edge.current_penalty * modifier.penaltyMultiplier).toFixed(2)),
      event: scenario.type,
    }
  })
  return { ...BACKEND_TOPOLOGY_SNAPSHOT, edges, active_events: [{ source: scenario.roadId.split('--')[0], target: scenario.roadId.split('--')[1], event_type: scenario.type }] }
}

function scenarioOptimization(scenario, topology) {
  if (scenario.id === 'accident-cd') {
    const flows = BASE_FLOWS.map((flow) => flow.name === 'usuario'
      ? { ...flow, qaoa_route: ['NODO_A', 'NODO_C', 'NODO_E', 'NODO_F'], selfish_route: ['NODO_A', 'NODO_C', 'NODO_E', 'NODO_F'] }
      : { ...flow })
    return optimizationFixture({
      topology,
      flows,
      optimized: { travel_time: 54.21, congestion_penalty: 0, estimated_time: 54.21 },
      selfish: { travel_time: 54.21, congestion_penalty: 29.16, estimated_time: 83.37 },
      comparison: { user_time_saved: 29.16, user_improvement_pct: 34.98, system_cost_optimized: 142.6, system_cost_selfish: 198.4, system_improvement_pct: 28.13 },
      executionTimeMs: 196.8,
      totalTimeMs: 198.1,
    })
  }

  if (scenario.id === 'roadwork-bd') {
    const flows = BASE_FLOWS.map((flow) => flow.name === 'fondo_1'
      ? { ...flow, qaoa_route: ['NODO_B', 'NODO_E', 'NODO_F'] }
      : { ...flow })
    return optimizationFixture({
      topology,
      flows,
      comparison: { user_time_saved: 17.272, user_improvement_pct: 24.16, system_cost_optimized: 150.2, system_cost_selfish: 174.304, system_improvement_pct: 13.83 },
      executionTimeMs: 201.6,
      totalTimeMs: 203.2,
    })
  }

  return optimizationFixture({
    topology,
    selfish: { travel_time: 51.31, congestion_penalty: 33.232, estimated_time: 84.542 },
    comparison: { user_time_saved: 30.332, user_improvement_pct: 35.88, system_cost_optimized: 146.9, system_cost_selfish: 207.5, system_improvement_pct: 29.2 },
    executionTimeMs: 192.4,
    totalTimeMs: 193.8,
  })
}

export function createMockSession(visualVehicleCount = 20) {
  return adaptSuperposeResponse({
    topology: BACKEND_TOPOLOGY_SNAPSHOT,
    optimization: BACKEND_OPTIMIZATION_SNAPSHOT,
    visualVehicleCount,
    source: 'backend-snapshot',
  })
}

export function applyMockIncident(currentSession, incident) {
  const scenario = MOCK_INCIDENTS.find((item) => item.id === incident.scenarioId) || MOCK_INCIDENTS[0]
  const topology = topologyWithEvent(scenario)
  const optimization = scenarioOptimization(scenario, topology)
  return {
    ...adaptSuperposeResponse({
      topology,
      optimization,
      visualVehicleCount: currentSession.visualVehicleCount,
      previousSession: currentSession,
      source: 'backend-snapshot',
    }),
    incident: { ...incident, scenarioId: scenario.id, finding: scenario.finding },
  }
}

console.assert(BACKEND_TOPOLOGY_SNAPSHOT.node_details.length === 6, 'El snapshot debe conservar los 6 nodos del backend.')
console.assert(BACKEND_TOPOLOGY_SNAPSHOT.edges.length === 8, 'El snapshot debe conservar las 8 vías del backend.')
console.assert(BACKEND_OPTIMIZATION_SNAPSHOT.flows.length === 3, 'El snapshot debe conservar los 3 flujos del backend.')
console.assert(BACKEND_OPTIMIZATION_SNAPSHOT.quantum_telemetry.qubits_used === 6, 'El snapshot debe conservar los 6 qubits del backend.')
