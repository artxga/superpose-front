import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  API_BASE,
  DEFAULT_USER_TRIP,
  DEFAULT_BACKGROUND_FLOWS,
  startSimulation,
  reportIncident,
  syncSimulation,
  applyBackgroundFlows,
  resetEventsAPI,
  optimizeRoute,
} from '../api/superposeApi.js'
import {
  applyMockIncident,
  createMockSession,
  MOCK_INCIDENTS,
} from '../data/backendSnapshot.js'

export const CITY_NODES = [
  { id: 'NODO_A', label: 'Callao', code: 'A' },
  { id: 'NODO_B', label: 'Los Olivos', code: 'B' },
  { id: 'NODO_C', label: 'Cercado de Lima', code: 'C' },
  { id: 'NODO_D', label: 'San Isidro', code: 'D' },
  { id: 'NODO_E', label: 'San Juan de Lurigancho', code: 'E' },
  { id: 'NODO_F', label: 'La Molina', code: 'F' },
]

const INCIDENTS = [
  { value: 'ACCIDENT', label: 'Accidente', description: 'Bloqueo crítico (+5000 min tiempo fijo)' },
  { value: 'TRAFFIC_JAM', label: 'Congestión', description: 'Atasco en vía (1.8× tiempo, 4× penalización)' },
  { value: 'ROADWORK', label: 'Obras viales', description: 'Reducción de carriles (1.5× tiempo, 6× penalización)' },
]

const BACKGROUND_PRESETS = [
  {
    name: 'Estándar (Backend default)',
    flows: [
      { origin: 'NODO_B', destination: 'NODO_F', vehicles: 20 },
      { origin: 'NODO_A', destination: 'NODO_E', vehicles: 30 },
    ],
  },
  {
    name: 'Hora Punta Matutina',
    flows: [
      { origin: 'NODO_B', destination: 'NODO_F', vehicles: 35 },
      { origin: 'NODO_A', destination: 'NODO_E', vehicles: 45 },
    ],
  },
  {
    name: 'Demanda Moderada',
    flows: [
      { origin: 'NODO_B', destination: 'NODO_F', vehicles: 10 },
      { origin: 'NODO_A', destination: 'NODO_E', vehicles: 15 },
    ],
  },
]

const STATUS_LABELS = {
  idle: 'Esperando inicio',
  connecting: 'Consultando backend',
  running: 'Simulación activa',
  paused: 'Simulación pausada',
  recalculating: 'Recalculando rutas',
  error: 'Sin conexión',
  complete: 'Recorrido completado',
}

function number(value, digits = 0) {
  return Number.isFinite(Number(value))
    ? new Intl.NumberFormat('es-PE', { maximumFractionDigits: digits }).format(Number(value))
    : '—'
}

function seconds(value) {
  if (!Number.isFinite(Number(value))) return '—'
  const total = Number(value)
  if (total < 60) return `${number(total, 1)} s`
  return `${Math.floor(total / 60)} min ${Math.round(total % 60)} s`
}

function minutes(value) {
  return Number.isFinite(Number(value)) ? `${number(value, 1)} min` : '—'
}

function pointAt(timeline = [], elapsedMs = 0) {
  if (!timeline.length) return null
  if (elapsedMs <= timeline[0].atMs) return timeline[0]

  for (let index = 1; index < timeline.length; index += 1) {
    const next = timeline[index]
    const previous = timeline[index - 1]
    if (elapsedMs <= next.atMs) {
      const span = Math.max(1, next.atMs - previous.atMs)
      const ratio = Math.min(1, Math.max(0, (elapsedMs - previous.atMs) / span))
      return {
        x: previous.x + (next.x - previous.x) * ratio,
        y: previous.y + (next.y - previous.y) * ratio,
        angle: Math.atan2(next.y - previous.y, next.x - previous.x) * (180 / Math.PI),
      }
    }
  }

  const last = timeline[timeline.length - 1]
  const previous = timeline[timeline.length - 2] || last
  return { ...last, angle: Math.atan2(last.y - previous.y, last.x - previous.x) * (180 / Math.PI) }
}

function continueTimeline(previousTimeline = [], nextTimeline = [], atMs = 0) {
  if (!previousTimeline.length || !nextTimeline.length) return nextTimeline
  if (atMs <= previousTimeline[0].atMs) return nextTimeline
  const current = pointAt(previousTimeline, atMs)
  if (atMs >= previousTimeline.at(-1).atMs) return [{ x: current.x, y: current.y, atMs: 0 }]

  const closest = nextTimeline.reduce((best, point, index) => {
    const distance = Math.hypot(point.x - current.x, point.y - current.y)
    return distance < best.distance ? { index, distance } : best
  }, { index: 0, distance: Infinity }).index
  const shift = atMs - nextTimeline[closest].atMs
  return [
    { x: current.x, y: current.y, atMs: 0 },
    { x: current.x, y: current.y, atMs },
    ...nextTimeline.slice(closest + 1).map((point) => ({ ...point, atMs: point.atMs + shift })),
  ]
}

function continueVehicles(previousVehicles = [], nextVehicles = [], atMs = 0) {
  const previousById = new Map(previousVehicles.map((vehicle) => [vehicle.id, vehicle]))
  return nextVehicles.map((vehicle) => {
    const previous = previousById.get(vehicle.id)
    return previous?.flowId === vehicle.flowId
      ? { ...vehicle, timeline: continueTimeline(previous.timeline, vehicle.timeline, atMs) }
      : vehicle
  })
}

function continueSession(previousSession, nextSession, atMs) {
  const strategyViews = Object.fromEntries(Object.entries(nextSession.strategyViews || {}).map(([key, view]) => [
    key,
    { ...view, vehicles: continueVehicles(previousSession?.strategyViews?.[key]?.vehicles, view.vehicles, atMs) },
  ]))
  return {
    ...nextSession,
    vehicles: continueVehicles(previousSession?.vehicles, nextSession.vehicles, atMs),
    strategyViews,
  }
}

const ROAD_COLORS = {
  expressway: '#3b485d',
  avenue: '#2b3648',
  local: '#1e2634',
}

const EVENT_BADGES = {
  ACCIDENT: { label: 'ACCIDENTE', tone: 'accident' },
  TRAFFIC_JAM: { label: 'CONGESTIÓN', tone: 'jam' },
  ROADWORK: { label: 'OBRAS', tone: 'roadwork' },
}

const NODE_LABEL_SIDE = {
  NODO_A: 'left',
  NODO_B: 'left',
  NODO_C: 'right',
  NODO_D: 'below',
  NODO_E: 'right',
  NODO_F: 'right',
}

function offsetPoints(points = [], distance = 0) {
  if (!distance || points.length < 2) return points
  return points.map(([x, y], index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next[0] - previous[0]
    const dy = next[1] - previous[1]
    const length = Math.hypot(dx, dy) || 1
    return [x + (-dy / length) * distance, y + (dx / length) * distance]
  })
}

function nodeLabelBox(node, centroid) {
  const side = NODE_LABEL_SIDE[node.id]
    || (Math.abs(node.x - centroid.x) > Math.abs(node.y - centroid.y)
      ? (node.x < centroid.x ? 'left' : 'right')
      : (node.y < centroid.y ? 'above' : 'below'))
  const width = Math.max(node.id.length * 11, (node.district || '').length * 9.4) + 28
  const height = 58
  const gap = 26
  const positions = {
    left: { x: -gap - width, y: -height / 2 },
    right: { x: gap, y: -height / 2 },
    above: { x: -width / 2, y: -gap - height },
    below: { x: -width / 2, y: gap },
  }
  return { ...positions[side], width, height }
}

function SimulationMap({
  session,
  elapsedMs,
  selectedRoad,
  onSelectRoad,
  selectedVehicleId,
  onSelectVehicle,
  roadsInteractive = true,
  onSelectNode,
  highlightedFlowId = 'usuario',
  onSelectFlow,
}) {
  const map = session?.map
  const vehicles = session?.vehicles || []
  const width = map?.width || 1376
  const height = map?.height || 768

  if (!map?.nodes?.length || !map?.roads?.length) {
    return (
      <div className="traffic-map traffic-map--empty">
        <div>
          <strong>El mapa llegará desde el backend</strong>
          <p>Inicia una sesión para recibir calles, rutas y posiciones de los vehículos.</p>
        </div>
      </div>
    )
  }

  const nodes = new Map(map.nodes.map((node) => [node.id, node]))
  const centroid = {
    x: map.nodes.reduce((sum, node) => sum + node.x, 0) / map.nodes.length,
    y: map.nodes.reduce((sum, node) => sum + node.y, 0) / map.nodes.length,
  }
  const originIds = new Set((session.flows || []).map((flow) => flow.originId))
  const destinationIds = new Set((session.flows || []).map((flow) => flow.destinationId))
  const coordinated = session.strategy !== 'traditional'
  const userRoute = (session.routes || []).find((route) => route.flowId === 'usuario')
  const otherView = session.strategyViews?.[coordinated ? 'traditional' : 'coordinated']
  const otherPath = otherView?.routes?.find((route) => route.flowId === 'usuario')?.nodePath
  const otherMinutes = otherView?.metrics?.userEstimatedMinutes
  const userMinutes = session.metrics?.userEstimatedMinutes
  const shortPath = (path = []) => path.map((nodeId) => nodeId.replace('NODO_', '')).join(' → ')
  const scalePx = map.geography?.scalePx || 92

  return (
    <div className="traffic-map">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mapa de la red vial de Lima">
        <defs>
          <radialGradient id="map-ground" cx="55%" cy="45%" r="75%">
            <stop offset="0" stopColor="#131c2b" />
            <stop offset="1" stopColor="#0a101b" />
          </radialGradient>
          <linearGradient id="map-ocean" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0b3b5c" />
            <stop offset="1" stopColor="#0f2a44" />
          </linearGradient>
          <pattern id="map-streets" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <path d="M0 0H46M0 0V46" stroke="#1d2a3b" strokeWidth="1" />
            <path d="M23 0V46" stroke="#172234" strokeWidth=".6" />
          </pattern>
          <filter id="map-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#map-ground)" />
        <rect width={width} height={height} fill="url(#map-streets)" opacity=".3" />

        <g className="city-areas">
          {map.areas.map((area) => (
            <path
              key={area.id}
              className={`city-area city-area--${area.kind}`}
              d={`M ${area.points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`}
              fill={area.kind === 'water' ? 'url(#map-ocean)' : '#162234'}
            />
          ))}
        </g>

        <g className="traffic-map__roads">
          {map.roads.map((road) => {
            const pathData = `M ${road.geometry.map(([x, y]) => `${x} ${y}`).join(' L ')}`
            const isSelected = selectedRoad === road.id
            const baseWidth = road.kind === 'expressway' ? 14 : (road.kind === 'avenue' ? 9 : 5)
            const strokeColor = ROAD_COLORS[road.kind] || '#8ca2ba'
            return (
              <g
                key={road.id}
                className={`traffic-road traffic-road--${road.kind} ${isSelected ? 'traffic-road--selected' : ''} ${road.blocked ? 'traffic-road--blocked' : ''}`}
                style={{ '--road-color': strokeColor, '--road-width': `${baseWidth}px` }}
              >
                <path className="traffic-road__glow" d={pathData} />
                <path className="traffic-road__body" d={pathData} />
                <path className="traffic-road__core" d={pathData} />
                <path
                  className={`traffic-road__hit ${roadsInteractive ? '' : 'traffic-road__hit--disabled'}`}
                  d={pathData}
                  onClick={() => roadsInteractive && onSelectRoad(road.id)}
                  role={roadsInteractive ? 'button' : undefined}
                  aria-label={`Vía ${road.label}`}
                  tabIndex={roadsInteractive ? 0 : -1}
                />
              </g>
            )
          })}
        </g>

        <g className="traffic-map__routes">
          {(session.routes || []).map((route) => {
            const isUser = route.flowId === 'usuario'
            const isHighlighted = highlightedFlowId === 'all'
              ? true
              : (highlightedFlowId ? highlightedFlowId === route.flowId : isUser)
            const isDimmed = highlightedFlowId !== 'all' && !isHighlighted
            const offset = (route.flowId === 'fondo_1' ? -4 : (route.flowId === 'fondo_2' ? 4 : 0))
            const routePoints = offsetPoints(route.points, offset)
            const pathData = `M ${routePoints.map(([x, y]) => `${x} ${y}`).join(' L ')}`
            const routeColor = isUser ? '#00f0ff' : (route.flowId === 'fondo_1' ? '#fbbf24' : '#c084fc')
            return (
              <g
                key={route.id}
                className={`traffic-route-group ${isHighlighted ? 'traffic-route-group--highlighted' : ''} ${isDimmed ? 'traffic-route-group--dimmed' : ''} ${isUser ? 'traffic-route-group--user' : ''}`}
                style={{ '--route-color': routeColor }}
                onClick={() => onSelectFlow && onSelectFlow(route.flowId)}
              >
                {/* Halo neón ancho para la ruta activa/seleccionada */}
                {isHighlighted && (
                  <path className="traffic-route__glow" d={pathData} />
                )}
                {/* Viga sólida de color semántico */}
                <path className="traffic-route__core" d={pathData} />
                {/* Línea animada de flujo direccional */}
                <path className="traffic-route__animated" d={pathData} />
              </g>
            )
          })}
        </g>

        <g className="traffic-map__vehicles">
          {vehicles.map((vehicle) => {
            const point = pointAt(vehicle.timeline, elapsedMs)
            if (!point) return null
            const isSelected = selectedVehicleId === vehicle.id
            const isUserVehicle = vehicle.flowId === 'usuario'
            return (
              <g
                key={vehicle.id}
                className={`traffic-vehicle-group ${isSelected ? 'traffic-vehicle-group--selected' : ''} ${isUserVehicle ? 'traffic-vehicle-group--user' : ''}`}
                transform={`translate(${point.x} ${point.y}) rotate(${point.angle})`}
                onClick={() => onSelectVehicle(vehicle.id)}
                role="button"
                tabIndex={0}
                aria-label={isUserVehicle ? `Tu auto (${vehicle.id})` : `Vehículo ${vehicle.id}`}
                style={{ '--vehicle-color': isUserVehicle ? '#00f7ff' : vehicle.color }}
              >
                {isUserVehicle && (
                  <circle className="traffic-vehicle__user-beacon" r="28" />
                )}
                <circle className="traffic-vehicle__halo" r={isUserVehicle ? 20 : 16} />
                <rect className="traffic-vehicle__wheel" x="-11" y="-8.5" width="5" height="3" rx="1.5" />
                <rect className="traffic-vehicle__wheel" x="6" y="-8.5" width="5" height="3" rx="1.5" />
                <rect className="traffic-vehicle__wheel" x="-11" y="5.5" width="5" height="3" rx="1.5" />
                <rect className="traffic-vehicle__wheel" x="6" y="5.5" width="5" height="3" rx="1.5" />
                <path className="traffic-vehicle__body" d="M -11 -6.5 L 10 -6.5 Q 13 -6.5 13 -3 L 13 3 Q 13 6.5 10 6.5 L -11 6.5 Q -13 6.5 -13 4 L -13 -4 Q -13 -6.5 -11 -6.5 Z" />
                <rect className="traffic-vehicle__roof" x="-5" y="-4.5" width="10" height="9" rx="2" />
                <polygon className="traffic-vehicle__glass" points="5,-4 7,-4 9,-2.5 9,2.5 7,4 5,4" />
                <polygon className="traffic-vehicle__glass" points="-5,-4 -7,-4 -9,-2.5 -9,2.5 -7,4 -5,4" />
                <circle className="traffic-vehicle__light" cx="12" cy="-4" r={isUserVehicle ? 1.8 : 1.2} />
                <circle className="traffic-vehicle__light" cx="12" cy="4" r={isUserVehicle ? 1.8 : 1.2} />
                {isUserVehicle && (
                  <g className="traffic-vehicle__user-flag" transform={`rotate(${-point.angle})`}>
                    <rect x="-26" y="-38" width="52" height="18" rx="4" />
                    <text x="0" y="-25" textAnchor="middle">TU AUTO</text>
                  </g>
                )}
              </g>
            )
          })}
        </g>

        <g className="traffic-map__labels">
          {map.roads.map((road) => {
            const [x, y] = road.labelAt
            return (
              <g key={`${road.id}-label`} className="traffic-road-label" transform={`translate(${x} ${y}) rotate(${road.labelAngle})`}>
                <rect x="-38" y="-14" width="76" height="28" rx="6" />
                <text x="0" y="0" textAnchor="middle" dominantBaseline="central">
                  {`${number(road.lengthKm, 1)} km`}
                </text>
              </g>
            )
          })}
        </g>

        <g className="traffic-map__events" aria-hidden="true">
          {map.roads.filter((road) => EVENT_BADGES[road.event] && road.geometry?.length).map((road) => {
            const badge = EVENT_BADGES[road.event]
            const [x, y] = road.geometry[Math.floor(road.geometry.length / 4)]
            const badgeWidth = badge.label.length * 10 + 28
            return (
              <g key={`${road.id}-event`} className={`traffic-event traffic-event--${badge.tone}`} transform={`translate(${x} ${y})`}>
                <rect x={-badgeWidth - 20} y="-15" width={badgeWidth} height="30" rx="7" />
                <text x={-badgeWidth / 2 - 20} textAnchor="middle" dominantBaseline="central">{badge.label}</text>
                <circle r="14" />
                <text className="traffic-event__icon" textAnchor="middle" dominantBaseline="central">{road.event === 'TRAFFIC_JAM' ? '≡' : '!'}</text>
              </g>
            )
          })}
        </g>

        <g className="traffic-map__nodes">
          {map.nodes.map((node) => {
            const isOrigin = originIds.has(node.id)
            const isDestination = destinationIds.has(node.id)
            const role = isOrigin && isDestination ? 'Origen · destino' : (isOrigin ? 'Origen' : (isDestination ? 'Destino' : 'Conexión'))
            const box = nodeLabelBox(node, centroid)
            return (
              <g
                key={node.id}
                className="traffic-node"
                transform={`translate(${node.x} ${node.y})`}
                style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                onClick={() => onSelectNode && onSelectNode(node.id)}
              >
                <title>{`${node.id} · ${node.district} · ${role} (Clic para fijar)`}</title>
                <circle className="traffic-node__glow" r="22" filter="url(#map-glow)" />
                <circle className="traffic-node__ring" r="17" />
                <g className="traffic-node__label" transform={`translate(${box.x} ${box.y})`}>
                  <rect width={box.width} height={box.height} rx="8" />
                  <text className="traffic-node__id" x="14" y="22">{node.id}</text>
                  <text className="traffic-node__district" x="14" y="45">{node.district}</text>
                </g>
              </g>
            )
          })}
        </g>

        <g className="traffic-map__compass" transform={`translate(${width - 48} 52)`} aria-hidden="true">
          <text x="0" y="-18" textAnchor="middle">N</text>
          <path d="M0-10 9 16 0 10-9 16Z" />
        </g>

        <g className="traffic-map__scale" transform="translate(48 52)" aria-hidden="true">
          <path d={`M0 0V8H${scalePx}V0`} />
          <text x={scalePx / 2} y="-8" textAnchor="middle">5 km</text>
        </g>
      </svg>

      <div className="traffic-map__footer">
        {userRoute && (
          <div className="traffic-map__summary">
            <span>Ruta del usuario:</span>
            <strong>{coordinated ? 'Superpose QAOA' : 'Tradicional Dijkstra'}</strong> asigna <em>{shortPath(userRoute.nodePath)}</em> ({minutes(userMinutes)}).
            {otherPath && (
              <span>({coordinated ? 'ruta individual' : 'ruta QAOA'} {shortPath(otherPath)} · {minutes(otherMinutes)})</span>
            )}
          </div>
        )}

        <div className="traffic-map__route-filter">
          <span>Resaltar:</span>
          <button
            type="button"
            className={highlightedFlowId === 'all' ? 'route-pill route-pill--active' : 'route-pill'}
            onClick={() => onSelectFlow && onSelectFlow('all')}
          >
            Todas
          </button>
          <button
            type="button"
            className={highlightedFlowId === 'usuario' ? 'route-pill route-pill--active route-pill--user' : 'route-pill'}
            onClick={() => onSelectFlow && onSelectFlow(highlightedFlowId === 'usuario' ? 'all' : 'usuario')}
          >
            <i style={{ background: '#00f0ff' }} />
            Tu viaje ({shortPath(userRoute?.nodePath)})
          </button>
          {(session.flows || []).filter((f) => f.id !== 'usuario').map((flow) => {
            const isFondo1 = flow.id === 'fondo_1'
            const color = isFondo1 ? '#fbbf24' : '#c084fc'
            const isActive = highlightedFlowId === flow.id
            const flowRoute = (session.routes || []).find((r) => r.flowId === flow.id)
            return (
              <button
                key={flow.id}
                type="button"
                className={isActive ? 'route-pill route-pill--active' : 'route-pill'}
                onClick={() => onSelectFlow && onSelectFlow(isActive ? 'all' : flow.id)}
              >
                <i style={{ background: color }} />
                {flow.id === 'fondo_1' ? 'Fondo 1' : 'Fondo 2'} ({shortPath(flowRoute?.nodePath)})
              </button>
            )
          })}
        </div>

        <div className="traffic-map__key" aria-hidden="true">
          <span><i className="key-road-base" /><b>Gris asfalto</b> = Red vial base</span>
          <span><i className="key-route-user" /><b>Cian eléctrico</b> = Tu viaje seleccionado</span>
          <span><i className="key-route-bg" /><b>Ámbar / Violeta</b> = Flujos de fondo</span>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, note }) {
  return (
    <div className="lab-metric">
      <span>{label}</span>
      <strong className="num">{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

export default function TrafficLab() {
  const [source, setSource] = useState('backend')
  const [strategy, setStrategy] = useState('coordinated')
  const [vehicleCount, setVehicleCount] = useState(20)
  const [trip, setTrip] = useState(DEFAULT_USER_TRIP)
  const [highlightedFlowId, setHighlightedFlowId] = useState('usuario')
  const [backgroundFlows, setBackgroundFlows] = useState(DEFAULT_BACKGROUND_FLOWS)
  const [showBackgroundModal, setShowBackgroundModal] = useState(false)
  const [incidentType, setIncidentType] = useState('ACCIDENT')
  const [demoIncidentId, setDemoIncidentId] = useState(MOCK_INCIDENTS[0].id)
  const [selectedRoad, setSelectedRoad] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [sideTab, setSideTab] = useState('road')
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [apiLatencyMs, setApiLatencyMs] = useState(null)
  const [incident, setIncident] = useState(null)
  const clockRef = useRef({ origin: 0, pausedAt: 0 })

  const visibleSession = useMemo(() => {
    const strategyView = session?.strategyViews?.[strategy]
    return strategyView ? { ...session, ...strategyView } : session
  }, [session, strategy])

  const durationMs = useMemo(() => {
    const ends = (visibleSession?.vehicles || []).map((vehicle) => vehicle.timeline?.at(-1)?.atMs || 0)
    return Math.max(0, ...ends)
  }, [visibleSession])

  useEffect(() => {
    if (status !== 'running') return undefined
    let frame
    const update = () => {
      const next = performance.now() - clockRef.current.origin
      setElapsedMs(next)
      if (durationMs && next >= durationMs) {
        setElapsedMs(durationMs)
        setStatus('complete')
        return
      }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [status, durationMs])

  useEffect(() => {
    handleStart()
  }, [])

  async function handleStart({ reset = false } = {}) {
    setStatus('connecting')
    setError('')
    setIncident(null)
    setSelectedRoad('')
    setElapsedMs(0)
    setActionNotice(reset ? 'Red restablecida (POST /api/v1/events/reset)' : 'Consultando topología (GET /api/v1/topology)')

    try {
      const result = source === 'demo'
        ? { data: createMockSession(vehicleCount, trip), latencyMs: null }
        : await startSimulation({ vehicleCount, trip, backgroundFlows, reset })

      if (!result.data?.sessionId || !result.data?.map || !Array.isArray(result.data?.vehicles)) {
        throw new Error('La respuesta no cumple el contrato de simulación.')
      }
      setSession(result.data)
      setSelectedRoad(source === 'demo' ? MOCK_INCIDENTS.find((item) => item.id === demoIncidentId)?.roadId || '' : '')
      setSelectedVehicleId('')
      setApiLatencyMs(result.latencyMs)
      clockRef.current = { origin: performance.now(), pausedAt: 0 }
      setStatus('running')
    } catch (requestError) {
      setStatus('error')
      setError(requestError.message)
    }
  }

  async function handleSync() {
    if (source === 'demo') {
      setActionNotice('En modo demo se reproduce el snapshot estático.')
      return
    }
    setStatus('connecting')
    setError('')
    try {
      const result = await syncSimulation(session, vehicleCount, trip)
      setSession(result.data)
      setApiLatencyMs(result.latencyMs)
      setActionNotice('Topología y rutas sincronizadas (GET /api/v1/topology)')
      setStatus('running')
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  async function calculateTrip(targetTrip = trip) {
    if (targetTrip.origin === targetTrip.destination) {
      setError('El origen y el destino deben ser nodos distintos.')
      return
    }
    setStatus('recalculating')
    setError('')
    setActionNotice(`Optimizando viaje ${targetTrip.origin} → ${targetTrip.destination}...`)

    try {
      if (source === 'demo') {
        const nextMock = createMockSession(vehicleCount, targetTrip)
        setSession(nextMock)
        setElapsedMs(0)
        clockRef.current = { origin: performance.now(), pausedAt: 0 }
        setStatus('running')
        setActionNotice(`Ruta calculada para ${targetTrip.origin} → ${targetTrip.destination}`)
        return
      }

      const result = await startSimulation({ vehicleCount, trip: targetTrip, backgroundFlows, reset: false })
      setSession(result.data)
      setApiLatencyMs(result.latencyMs)
      setElapsedMs(0)
      clockRef.current = { origin: performance.now(), pausedAt: 0 }
      setStatus('running')
      setActionNotice(`Ruta calculada para ${targetTrip.origin} → ${targetTrip.destination} con ${targetTrip.vehicles} auto(s).`)
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  async function handleTripChange(field, value) {
    const nextTrip = { ...trip, [field]: value }
    setTrip(nextTrip)
    if (nextTrip.origin !== nextTrip.destination) {
      await calculateTrip(nextTrip)
    }
  }

  function handleNodeClick(nodeId) {
    if (trip.origin === nodeId) return
    handleTripChange('destination', nodeId)
  }

  function handleSourceChange(nextSource) {
    setSource(nextSource)
    setStatus('idle')
    setError('')
    setElapsedMs(0)
    setIncident(null)
    setSelectedRoad(nextSource === 'demo' ? MOCK_INCIDENTS.find((item) => item.id === demoIncidentId)?.roadId || '' : '')
    setSelectedVehicleId('')
    setApiLatencyMs(null)
    setSession(nextSource === 'demo' ? createMockSession(vehicleCount, trip) : null)
  }

  function handleDemoIncidentChange(nextScenarioId) {
    const scenario = MOCK_INCIDENTS.find((item) => item.id === nextScenarioId)
    setDemoIncidentId(nextScenarioId)
    setSelectedRoad(scenario.roadId)
  }

  function handleStrategyChange(nextStrategy) {
    setStrategy(nextStrategy)
    setSelectedVehicleId('')
  }

  function togglePause() {
    if (status === 'running') {
      clockRef.current.pausedAt = elapsedMs
      setStatus('paused')
    } else if (status === 'paused') {
      clockRef.current.origin = performance.now() - clockRef.current.pausedAt
      setStatus('running')
    }
  }

  async function handleIncident() {
    if (!session?.sessionId || !selectedRoad) return
    const wasRunning = status === 'running'
    const incidentAt = elapsedMs
    setStatus('recalculating')
    setError('')
    setActionNotice(`Reportando evento en ${selectedRoad} (POST /api/v1/events/report)...`)

    try {
      const scenario = MOCK_INCIDENTS.find((item) => item.id === demoIncidentId)
      const incidentPayload = source === 'demo'
        ? { scenarioId: scenario.id, roadId: scenario.roadId, type: scenario.type, simulationTimeMs: incidentAt }
        : { roadId: selectedRoad, type: incidentType, simulationTimeMs: incidentAt }

      if (source === 'demo') await new Promise((resolve) => setTimeout(resolve, 650))
      const result = source === 'demo'
        ? { data: applyMockIncident(session, incidentPayload), latencyMs: null }
        : await reportIncident(session, incidentPayload, vehicleCount, trip)

      if (!Array.isArray(result.data?.vehicles)) {
        throw new Error('El backend no devolvió las nuevas trayectorias.')
      }
      setSession((current) => continueSession(current, { ...current, ...result.data }, incidentAt))
      setSelectedVehicleId('')
      setApiLatencyMs(result.latencyMs)
      setIncident({ roadId: incidentPayload.roadId, type: incidentPayload.type, atMs: incidentAt })
      clockRef.current = { origin: performance.now() - incidentAt, pausedAt: incidentAt }
      setStatus(wasRunning ? 'running' : 'paused')
      setActionNotice(`Evento aplicado a ${selectedRoad}: penalización calculada.`)
    } catch (requestError) {
      setStatus(wasRunning ? 'running' : 'paused')
      setError(requestError.message)
    }
  }

  async function handleApplyBackgroundFlows(flows) {
    setShowBackgroundModal(false)
    setBackgroundFlows(flows)
    if (source === 'demo') {
      setActionNotice('Flujos de fondo actualizados en modo local.')
      return
    }
    setStatus('recalculating')
    setError('')
    setActionNotice('Actualizando flujos concurrentes (PUT /api/v1/flows/background)...')

    try {
      const result = await applyBackgroundFlows(session, flows, vehicleCount, trip)
      setSession(result.data)
      setApiLatencyMs(result.latencyMs)
      setStatus('running')
      setActionNotice('Flujos de fondo guardados en backend y red re-optimizada.')
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  const metrics = visibleSession?.metrics || {}
  const flowCount = session?.flows?.length || 0
  const solver = visibleSession?.solver
  const comparison = session?.comparison
  const selectedVehicle = visibleSession?.vehicles?.find((vehicle) => vehicle.id === selectedVehicleId)
  const progress = durationMs ? Math.min(100, (elapsedMs / durationMs) * 100) : 0
  const congestionDifference = comparison
    ? comparison.individual.maxCongestionPct - comparison.coordinated.maxCongestionPct
    : null
  const selectedRoadData = visibleSession?.map?.roads?.find((road) => road.id === selectedRoad)
  const activePath = session?.keyDecision
    ? (strategy === 'coordinated' ? session.keyDecision.coordinatedPath : session.keyDecision.traditionalPath)
    : null

  const activeEventsList = session?.activeEvents || []

  return (
    <div className="traffic-lab">
      {/* 1. BARRA SUPERIOR DE ESTADO Y COMANDOS */}
      <div className="traffic-lab__toolbar" data-ui>
        <div className="traffic-lab__state">
          <span className={`connection-dot connection-dot--${status}`} />
          <div>
            <strong>{STATUS_LABELS[status]}</strong>
            <span>
              {session
                ? `${session.visualVehicleCount || vehicleCount} autos visuales · ${session.modeledVehicles || '—'} modelados · ${flowCount} flujos`
                : API_BASE}
              {apiLatencyMs ? ` · ${number(apiLatencyMs, 0)} ms` : ''}
            </span>
          </div>
        </div>

        <div className="traffic-lab__controls">
          <div className="source-switch" aria-label="Fuente de las rutas">
            <button
              type="button"
              className={source === 'demo' ? 'source-switch--active' : ''}
              onClick={() => handleSourceChange('demo')}
            >
              Vista previa
            </button>
            <button
              type="button"
              className={source === 'backend' ? 'source-switch--active' : ''}
              onClick={() => handleSourceChange('backend')}
            >
              Backend
            </button>
          </div>

          <button
            className="lab-control"
            type="button"
            title="Sincronizar estado actual de la topología (GET /api/v1/topology)"
            onClick={handleSync}
            disabled={status === 'connecting' || status === 'recalculating'}
          >
            Sincronizar
          </button>

          <button
            className="lab-control"
            type="button"
            title="Configurar flujos concurrentes (PUT /api/v1/flows/background)"
            onClick={() => setShowBackgroundModal(true)}
          >
            Flujos de fondo
          </button>

          <label>
            <span>Autos</span>
            <select
              value={vehicleCount}
              onChange={(event) => setVehicleCount(Number(event.target.value))}
              disabled={status === 'connecting' || status === 'recalculating'}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>

          <button
            className="lab-control lab-control--primary"
            type="button"
            onClick={() => handleStart({ reset: true })}
            disabled={status === 'connecting' || status === 'recalculating'}
          >
            Restablecer red
          </button>

          <button
            className="lab-control"
            type="button"
            onClick={togglePause}
            disabled={!['running', 'paused'].includes(status)}
          >
            {status === 'paused' ? 'Continuar' : 'Pausar'}
          </button>
        </div>
      </div>

      {actionNotice && !error && (
        <div className="traffic-lab__notice" role="status">
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice('')}>×</button>
        </div>
      )}

      {error && (
        <div className="traffic-lab__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => handleStart({ reset: false })}>Reintentar</button>
        </div>
      )}

      {/* 2. FLUJO 1: PLANIFICAR RUTA MANUAL (POST /api/v1/route/optimize) */}
      <section className="trip-planner" data-ui aria-label="Ingresar manualmente una ruta">
        <div className="trip-planner__header">
          <strong>1. Planificar mi viaje</strong>
          <span>Ingresa manualmente tu origen y destino para calcular la asignación cuántica frente a Dijkstra.</span>
        </div>

        <div className="trip-planner__form">
          <label>
            <span>Origen</span>
            <select
              value={trip.origin}
              onChange={(e) => handleTripChange('origin', e.target.value)}
            >
              {CITY_NODES.map((node) => (
                <option key={node.id} value={node.id} disabled={node.id === trip.destination}>
                  {node.id} · {node.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Destino</span>
            <select
              value={trip.destination}
              onChange={(e) => handleTripChange('destination', e.target.value)}
            >
              {CITY_NODES.map((node) => (
                <option key={node.id} value={node.id} disabled={node.id === trip.origin}>
                  {node.id} · {node.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Vehículos</span>
            <input
              type="number"
              min="1"
              max="20"
              value={trip.vehicles || 1}
              onChange={(e) => handleTripChange('vehicles', Math.max(1, Number(e.target.value)))}
            />
          </label>

          <button
            type="button"
            className="trip-planner__button"
            onClick={() => calculateTrip(trip)}
            disabled={trip.origin === trip.destination || status === 'recalculating'}
          >
            Optimizar viaje
          </button>
        </div>

        {/* Desglose detallado del usuario según el contrato */}
        {comparison && (
          <div className="trip-breakdown">
            <div className="trip-breakdown__col">
              <span className="trip-breakdown__tag trip-breakdown__tag--selfish">Tradicional (Dijkstra)</span>
              <div className="trip-breakdown__time">
                <strong>{minutes(comparison.individual.userEstimatedMinutes)}</strong>
                <small>Tiempo estimado</small>
              </div>
              <div className="trip-breakdown__parts">
                <span>Tiempo libre: <b>{minutes(comparison.individual.userTravelTime)}</b></span>
                <span>Retraso congestión: <b>+{minutes(comparison.individual.userCongestionPenalty)}</b></span>
              </div>
            </div>

            <div className="trip-breakdown__divider">
              {comparison.userImprovementPct > 0 ? (
                <span className="improvement-pill">-{number(comparison.userImprovementPct, 1)}% tiempo</span>
              ) : (
                <span className="improvement-pill improvement-pill--neutral">Coordinado</span>
              )}
            </div>

            <div className="trip-breakdown__col trip-breakdown__col--superpose">
              <span className="trip-breakdown__tag trip-breakdown__tag--qaoa">Superpose (QAOA)</span>
              <div className="trip-breakdown__time">
                <strong>{minutes(comparison.coordinated.userEstimatedMinutes)}</strong>
                <small>Tiempo conjunto</small>
              </div>
              <div className="trip-breakdown__parts">
                <span>Tiempo libre: <b>{minutes(comparison.coordinated.userTravelTime)}</b></span>
                <span>Retraso congestión: <b>+{minutes(comparison.coordinated.userCongestionPenalty)}</b></span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. PRUEBA A/B Y CONMUTADOR DE ESTRATEGIA */}
      {comparison && (
        <div className="strategy-test" data-ui>
          <div className="strategy-test__intro">
            <strong>Prueba A/B · Red Completa</strong>
            <span>Compara el impacto de la coordinación global sobre toda la ciudad.</span>
          </div>
          <div className="strategy-switch" aria-label="Estrategia de asignación">
            <button
              type="button"
              className={strategy === 'traditional' ? 'strategy-switch--active' : ''}
              aria-pressed={strategy === 'traditional'}
              onClick={() => handleStrategyChange('traditional')}
            >
              <span>Tradicional</span>
              <strong>{minutes(comparison.individual.userEstimatedMinutes)}</strong>
              <small>Dijkstra egoísta por flujo</small>
            </button>
            <button
              type="button"
              className={strategy === 'coordinated' ? 'strategy-switch--active' : ''}
              aria-pressed={strategy === 'coordinated'}
              onClick={() => handleStrategyChange('coordinated')}
            >
              <span>Superpose · Qiskit</span>
              <strong>{minutes(comparison.coordinated.userEstimatedMinutes)}</strong>
              <small>Optimización combinatoria QAOA</small>
            </button>
          </div>
          {session.keyDecision && (
            <div className="strategy-test__decision">
              <span>Decisión que cambia · {session.keyDecision.flowLabel}</span>
              <strong>{strategy === 'coordinated' ? 'Superpose' : 'Tradicional'} asigna {activePath}</strong>
            </div>
          )}
          <p>
            Superpose reduce el costo total de la red en <strong>{number(comparison.systemImprovementPct, 1)}%</strong>
            {congestionDifference > 0 ? ` y la saturación máxima en ${number(congestionDifference, 1)} puntos` : ''}.
            {comparison.userTimeSaved ? ` El usuario ahorra ${number(comparison.userTimeSaved, 1)} minutos.` : ''}
          </p>
        </div>
      )}

      {/* 4. ESCENARIO CENTRAL: MAPA SVG + PANEL LATERAL (FLUJO 2: INCIDENTES Y FICHA DE VÍA) */}
      <div className="traffic-lab__stage" data-ui>
        <SimulationMap
          session={visibleSession}
          elapsedMs={elapsedMs}
          selectedRoad={selectedRoad}
          onSelectRoad={setSelectedRoad}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={(id) => {
            setSelectedVehicleId(id)
            setSideTab('vehicle')
            const v = visibleSession?.vehicles?.find((veh) => veh.id === id)
            if (v?.flowId) setHighlightedFlowId(v.flowId)
          }}
          roadsInteractive={true}
          onSelectNode={handleNodeClick}
          highlightedFlowId={highlightedFlowId}
          onSelectFlow={setHighlightedFlowId}
        />

        <aside className="incident-panel">
          {/* Navegación interna del panel lateral */}
          <div className="side-tabs">
            <button
              type="button"
              className={sideTab === 'road' ? 'side-tab--active' : ''}
              onClick={() => setSideTab('road')}
            >
              Vía / Reporte
            </button>
            <button
              type="button"
              className={sideTab === 'events' ? 'side-tab--active' : ''}
              onClick={() => setSideTab('events')}
            >
              Incidentes ({activeEventsList.length})
            </button>
            {selectedVehicle && (
              <button
                type="button"
                className={sideTab === 'vehicle' ? 'side-tab--active' : ''}
                onClick={() => setSideTab('vehicle')}
              >
                Auto
              </button>
            )}
          </div>

          {/* TAB 1: FICHA TÉCNICA DE VÍA Y REPORTE DE INCIDENTE */}
          {sideTab === 'road' && (
            <div className="side-content">
              <div>
                <strong>2. Reportar incidente en vía</strong>
                <p>
                  {source === 'demo'
                    ? 'Selecciona un escenario de prueba en modo demostración.'
                    : 'Haz clic en una arista del mapa para ver sus especificaciones y registrar un evento en el backend.'}
                </p>
              </div>

              {source === 'demo' ? (
                <label>
                  <span>Escenario de prueba</span>
                  <select
                    value={demoIncidentId}
                    onChange={(event) => handleDemoIncidentChange(event.target.value)}
                  >
                    {MOCK_INCIDENTS.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  <span>Tipo de evento (POST /api/v1/events/report)</span>
                  <select
                    value={incidentType}
                    onChange={(event) => setIncidentType(event.target.value)}
                  >
                    {INCIDENTS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label} — {item.description}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Ficha técnica completa de la vía devuelta por el backend */}
              {selectedRoadData ? (
                <div className="road-tech-card">
                  <div className="road-tech-card__header">
                    <span>Vía seleccionada</span>
                    <strong>{selectedRoadData.label}</strong>
                    <small>Tipo: {selectedRoadData.kind} · {selectedRoadData.lanes} carriles</small>
                  </div>
                  <div className="road-tech-card__grid">
                    <div><span>Longitud</span><b>{number(selectedRoadData.lengthKm, 2)} km</b></div>
                    <div><span>Velocidad</span><b>{number(selectedRoadData.speedKmh, 0)} km/h</b></div>
                    <div><span>Tiempo libre</span><b>{minutes(selectedRoadData.baseTime)}</b></div>
                    <div><span>Tiempo actual</span><b>{minutes(selectedRoadData.currentTime)}</b></div>
                    <div><span>Capacidad</span><b>{selectedRoadData.capacity} veh</b></div>
                    <div><span>Carga actual</span><b>{number(selectedRoadData.load, 1)} veh</b></div>
                    <div className="road-tech-card__full">
                      <span>Saturación ({number(selectedRoadData.saturation * 100, 1)}%)</span>
                      <div className="saturation-bar">
                        <i style={{ width: `${Math.min(100, selectedRoadData.saturation * 100)}%` }} />
                      </div>
                    </div>
                    {selectedRoadData.event !== 'NORMAL' && (
                      <div className="road-tech-card__full road-tech-card__badge">
                        <span>Estado activo:</span>
                        <b>{selectedRoadData.event}</b>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="road-tech-card road-tech-card--empty">
                  <span>Haz clic sobre una vía en el mapa para inspeccionarla</span>
                </div>
              )}

              <button
                type="button"
                className="incident-apply-button"
                onClick={handleIncident}
                disabled={!session || !selectedRoad || !['running', 'paused'].includes(status)}
              >
                Aplicar incidente a la red
              </button>
            </div>
          )}

          {/* TAB 2: LISTA DE EVENTOS ACTIVOS */}
          {sideTab === 'events' && (
            <div className="side-content">
              <div>
                <strong>Incidentes activos en la red</strong>
                <p>Eventos vigentes en memoria del backend que modifican pesos y penalizaciones.</p>
              </div>

              {activeEventsList.length === 0 ? (
                <div className="active-events-empty">
                  <span>✓ Red en flujo libre (0 incidentes activos)</span>
                </div>
              ) : (
                <div className="active-events-list">
                  {activeEventsList.map((evt, idx) => {
                    const roadKey = `${evt.source}--${evt.target}`
                    return (
                      <div
                        key={idx}
                        className={`active-event-item active-event-item--${evt.event_type?.toLowerCase()}`}
                        onClick={() => {
                          setSelectedRoad(roadKey)
                          setSideTab('road')
                        }}
                      >
                        <div className="active-event-item__badge">{evt.event_type}</div>
                        <strong>{evt.source.replace('NODO_', '')} ↔ {evt.target.replace('NODO_', '')}</strong>
                        <small>Haz clic para inspeccionar vía</small>
                      </div>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                className="lab-control"
                onClick={() => handleStart({ reset: true })}
                style={{ marginTop: 'auto' }}
              >
                Limpiar todos los eventos (Reset)
              </button>
            </div>
          )}

          {/* TAB 3: INSPECTOR DE AUTO */}
          {sideTab === 'vehicle' && selectedVehicle && (
            <div className="side-content">
              <div className="vehicle-inspector">
                <span>{selectedVehicle.id} · {selectedVehicle.rerouted ? 'Redirigido' : 'Ruta mantenida'}</span>
                <strong>{selectedVehicle.flowLabel}</strong>
                <p>{selectedVehicle.explanation}</p>
                <small>
                  Ruta {selectedVehicle.routeId} · ETA {minutes(selectedVehicle.estimatedTravelMinutes)} · representa ~{number(selectedVehicle.representedVehicles, 1)} vehículos
                </small>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="traffic-lab__progress" aria-label={`Progreso ${Math.round(progress)}%`}>
        <i style={{ width: `${progress}%` }} />
      </div>

      {/* 5. EVIDENCIA CUÁNTICA Y TELEMETRÍA EXTENDIDA */}
      {solver && comparison && (
        <div className="traffic-lab__evidence" data-ui>
          <div className="solver-preview">
            <div>
              <strong>{strategy === 'coordinated' ? 'Evidencia Qiskit (QAOA)' : 'Referencia clásica (Dijkstra)'}</strong>
              <span>
                {solver.mode}
                {strategy === 'coordinated'
                  ? ` · ${number(solver.problem.binaryVariables)} variables · ${number(solver.problem.constraints)} flujos`
                  : ` · ${flowCount} rutas independientes`}
              </span>
            </div>
            <ol>
              {solver.facts.map((fact) => (
                <li key={fact.id}>
                  <span>{fact.label}</span>
                  <strong className="num">{fact.value}</strong>
                </li>
              ))}
            </ol>

            {/* Desglose explicativo del bitstring óptimo si es QAOA */}
            {strategy === 'coordinated' && solver.facts.find((f) => f.id === 'bitstring') && (
              <div className="bitstring-explanation">
                <span>Asignación binaria:</span>
                <code>
                  {solver.facts.find((f) => f.id === 'bitstring')?.value || '—'}
                </code>
                <small>Pares de qubits indican la ruta asignada a cada flujo (Ruta 1 vs Ruta 2 alternativa).</small>
              </div>
            )}

            {/* Visualización de top_probabilities del circuito si existen */}
            {strategy === 'coordinated' && solver.topProbabilities?.length > 0 && (
              <div className="quantum-probabilities">
                <span>Distribución de estados cuánticos medidos:</span>
                <div className="quantum-prob-bars">
                  {solver.topProbabilities.slice(0, 3).map((prob, idx) => (
                    <div key={idx} className="quantum-prob-row">
                      <code>{prob.bitstring}</code>
                      <div className="quantum-prob-track">
                        <i style={{ width: `${Math.min(100, (prob.probability || 0) * 100 * 5)}%` }} />
                      </div>
                      <small>{number((prob.probability || 0) * 100, 2)}%</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="strategy-comparison">
            <div className="strategy-comparison__heading">
              <strong>Individual vs. Coordinada</strong>
              <span>{source === 'demo' ? 'Snapshot versionado' : 'Respuesta real de Superpose API'}</span>
            </div>
            <div className="strategy-comparison__table">
              <span />
              <span className={strategy === 'traditional' ? 'is-active' : ''}>Tradicional</span>
              <span className={strategy === 'coordinated' ? 'is-active' : ''}>Superpose</span>

              <strong>Usuario estimado</strong>
              <span className="num">{minutes(comparison.individual.userEstimatedMinutes)}</span>
              <span className="num">{minutes(comparison.coordinated.userEstimatedMinutes)}</span>

              <strong>Tiempo libre de viaje</strong>
              <span className="num">{minutes(comparison.individual.userTravelTime)}</span>
              <span className="num">{minutes(comparison.coordinated.userTravelTime)}</span>

              <strong>Retraso por congestión</strong>
              <span className="num">{minutes(comparison.individual.userCongestionPenalty)}</span>
              <span className="num">{minutes(comparison.coordinated.userCongestionPenalty)}</span>

              <strong>Costo total red</strong>
              <span className="num">{number(comparison.individual.systemCost, 1)}</span>
              <span className="num">{number(comparison.coordinated.systemCost, 1)}</span>

              <strong>Saturación máxima</strong>
              <span className="num">{number(comparison.individual.maxCongestionPct)}%</span>
              <span className="num">{number(comparison.coordinated.maxCongestionPct)}%</span>

              <strong>Cálculo solver</strong>
              <span className="num">—</span>
              <span className="num">{number(comparison.coordinated.computeMs, 1)} ms</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. MÉTRICAS INFERIORES */}
      <div className="traffic-lab__metrics" data-ui>
        <Metric label="Tiempo simulado" value={seconds(elapsedMs / 1000)} note="Reloj de la sesión" />
        <Metric label="Tiempo usuario" value={minutes(metrics.userEstimatedMinutes)} note="ETA estimada" />
        <Metric label="Autos reasignados" value={metrics.reroutedVehicles || 0} note="Ruta alterada por QAOA" />
        <Metric label="Saturación pico" value={`${number(metrics.maxCongestionPct, 0)}%`} note="Arista más cargada" />
        <Metric label="Ahorro de red" value={comparison ? `${number(comparison.systemImprovementPct, 1)}%` : '—'} note="Costo total del sistema" />
        <Metric label="Latencia API" value={apiLatencyMs ? `${number(apiLatencyMs, 0)} ms` : '—'} note="Tiempo de red + solver" />
      </div>

      {/* 7. MODAL DE FLUJOS DE FONDO (PUT /api/v1/flows/background) */}
      {showBackgroundModal && (
        <BackgroundFlowsModal
          flows={backgroundFlows}
          onClose={() => setShowBackgroundModal(false)}
          onSave={handleApplyBackgroundFlows}
        />
      )}
    </div>
  )
}

function BackgroundFlowsModal({ flows, onClose, onSave }) {
  const [localFlows, setLocalFlows] = useState(flows)

  function handlePreset(preset) {
    setLocalFlows(preset.flows)
  }

  function handleUpdateFlow(index, field, value) {
    setLocalFlows((current) => current.map((f, i) => (i === index ? { ...f, [field]: value } : f)))
  }

  return (
    <div className="background-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="background-modal" onClick={(e) => e.stopPropagation()}>
        <div className="background-modal__header">
          <div>
            <strong>Configuración de Flujos de Fondo</strong>
            <p>Define los dos flujos vehiculares concurrentes que compiten en la red (PUT /api/v1/flows/background).</p>
          </div>
          <button type="button" className="background-modal__close" onClick={onClose}>×</button>
        </div>

        <div className="background-modal__presets">
          <span>Presets rápidos:</span>
          {BACKGROUND_PRESETS.map((p, idx) => (
            <button key={idx} type="button" onClick={() => handlePreset(p)}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="background-modal__flows">
          {localFlows.map((flow, idx) => (
            <div key={idx} className="background-flow-card">
              <strong>Flujo de fondo {idx + 1}</strong>
              <div className="background-flow-card__fields">
                <label>
                  <span>Origen</span>
                  <select
                    value={flow.origin}
                    onChange={(e) => handleUpdateFlow(idx, 'origin', e.target.value)}
                  >
                    {CITY_NODES.map((n) => (
                      <option key={n.id} value={n.id} disabled={n.id === flow.destination}>
                        {n.id} · {n.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Destino</span>
                  <select
                    value={flow.destination}
                    onChange={(e) => handleUpdateFlow(idx, 'destination', e.target.value)}
                  >
                    {CITY_NODES.map((n) => (
                      <option key={n.id} value={n.id} disabled={n.id === flow.origin}>
                        {n.id} · {n.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Vehículos</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={flow.vehicles}
                    onChange={(e) => handleUpdateFlow(idx, 'vehicles', Math.max(1, Number(e.target.value)))}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="background-modal__actions">
          <button type="button" className="lab-control" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="lab-control lab-control--primary"
            onClick={() => onSave(localFlows)}
          >
            Guardar y re-optimizar
          </button>
        </div>
      </div>
    </div>
  )
}
