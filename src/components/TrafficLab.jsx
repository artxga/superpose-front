import React, { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE, reportIncident, startSimulation } from '../api/superposeApi.js'
import { applyMockIncident, createMockSession, MOCK_INCIDENTS } from '../data/backendSnapshot.js'

const INCIDENTS = [
  { value: 'ACCIDENT', label: 'Accidente' },
  { value: 'TRAFFIC_JAM', label: 'Congestión' },
  { value: 'ROADWORK', label: 'Obras' },
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

// Keeps a vehicle where it is when its route is recalculated: it joins the new
// route at the closest point and keeps the same pace from there.
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

function pointsForRoad(road, nodes) {
  if (road.geometry?.length) return road.geometry
  const from = nodes.get(road.from)
  const to = nodes.get(road.to)
  return from && to ? [[from.x, from.y], [to.x, to.y]] : []
}

function pathFromPoints(points = [], closed = false) {
  if (!points.length) return ''
  return `${points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ')}${closed ? ' Z' : ''}`
}

const ROAD_COLORS = {
  expressway: '#3ee8f5',
  avenue: '#b07cf7',
  local: '#f59a72',
}

const EVENT_BADGES = {
  ACCIDENT: { label: 'ACCIDENTE', tone: 'accident' },
  TRAFFIC_JAM: { label: 'CONGESTIÓN', tone: 'jam' },
  ROADWORK: { label: 'OBRAS', tone: 'roadwork' },
}

// Node label boxes sit on the side that keeps them clear of the roads.
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

function SimulationMap({ session, elapsedMs, selectedRoad, onSelectRoad, selectedVehicleId, onSelectVehicle, roadsInteractive = true }) {
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
        <rect width={width} height={height} fill="url(#map-streets)" />
        <g className="traffic-map__areas">
          {(map.areas || []).map((area) => (
            <path key={area.id} className={`city-area city-area--${area.kind}`} d={pathFromPoints(area.points, true)} fill={area.kind === 'water' ? 'url(#map-ocean)' : undefined} />
          ))}
        </g>

        <text className="traffic-map__title" x={width / 2} y="70" textAnchor="middle">Superpose — Red vial de Lima</text>

        <g className="traffic-map__roads">
          {map.roads.map((road) => {
            const points = pointsForRoad(road, nodes)
            if (!points.length) return null
            const d = pathFromPoints(points)
            const isSelected = road.id === selectedRoad
            const roadWidth = road.kind === 'expressway' ? 9 : (road.kind === 'avenue' ? 7 : 3.5)
            return (
              <g
                key={road.id}
                className={`traffic-road traffic-road--${road.kind}${isSelected ? ' traffic-road--selected' : ''}${road.blocked ? ' traffic-road--blocked' : ''}`}
                style={{ '--road-color': ROAD_COLORS[road.kind] || ROAD_COLORS.avenue, '--road-width': `${roadWidth}px` }}
              >
                <title>{`${road.label} · ${road.lengthKm ?? '—'} km · ${road.blocked ? 'bloqueada' : `${road.currentTime ?? '—'} min`} · ${road.lanes ?? '—'} carriles · carga ${number(road.load, 1)}/${road.capacity ?? '—'}`}</title>
                <path className="traffic-road__glow" d={d} filter="url(#map-glow)" />
                <path className="traffic-road__body" d={d} />
                {road.kind === 'expressway' && <path className="traffic-road__core" d={d} />}
                <path
                  className={`traffic-road__hit${roadsInteractive ? '' : ' traffic-road__hit--disabled'}`}
                  d={d}
                  tabIndex={roadsInteractive ? 0 : undefined}
                  role={roadsInteractive ? 'button' : undefined}
                  aria-label={`Seleccionar vía ${road.label || road.id}`}
                  onClick={() => roadsInteractive && onSelectRoad(road.id)}
                  onKeyDown={(event) => {
                    if (roadsInteractive && (event.key === 'Enter' || event.key === ' ')) onSelectRoad(road.id)
                  }}
                />
              </g>
            )
          })}
        </g>

        <g className="traffic-map__routes">
          {(session.routes || []).map((route, index) => (
            <path
              key={route.id}
              className={`traffic-route${route.flowId === 'usuario' ? ' traffic-route--user' : ''}`}
              style={{ '--route-color': route.color }}
              d={pathFromPoints(offsetPoints(route.points, -14 - index * 7))}
            />
          ))}
        </g>

        <g className="traffic-map__labels" aria-hidden="true">
          {map.roads.map((road) => road.labelAt && (
            <g
              className="traffic-road-label"
              key={`${road.id}-label`}
              style={{ '--road-color': ROAD_COLORS[road.kind] || ROAD_COLORS.avenue }}
              transform={`translate(${road.labelAt[0]} ${road.labelAt[1]}) rotate(${road.labelAngle || 0}) translate(0 ${road.kind === 'local' ? 22 : 28})`}
            >
              <rect x="-66" y="-14" width="132" height="28" rx="14" />
              <text textAnchor="middle" dominantBaseline="central">
                {number(road.lengthKm, 1)} km · {road.blocked ? 'bloqueada' : `${number(road.currentTime, 1)} min`}
              </text>
            </g>
          ))}
        </g>

        <g className="traffic-map__vehicles">
          {vehicles.map((vehicle, index) => {
            const position = pointAt(vehicle.timeline, elapsedMs)
            if (!position) return null
            return (
              <g
                key={vehicle.id}
                className={`traffic-vehicle-group${vehicle.id === selectedVehicleId ? ' traffic-vehicle-group--selected' : ''}`}
                transform={`translate(${position.x} ${position.y}) rotate(${(position.angle || 0) + 90})`}
                tabIndex="0"
                role="button"
                aria-label={`Inspeccionar ${vehicle.id}`}
                onClick={() => onSelectVehicle(vehicle.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectVehicle(vehicle.id)
                }}
              >
                <title>{`${vehicle.id}${vehicle.routeId ? ` · ${vehicle.routeId}` : ''}`}</title>
                <circle className="traffic-vehicle__halo" r="14" />
                <g className="traffic-vehicle" style={{ '--vehicle-color': vehicle.color || `var(--vehicle-${(index % 4) + 1})` }}>
                  <rect className="traffic-vehicle__wheel" x="-8" y="-7" width="3" height="6" rx="1" />
                  <rect className="traffic-vehicle__wheel" x="5" y="-7" width="3" height="6" rx="1" />
                  <rect className="traffic-vehicle__wheel" x="-8" y="4" width="3" height="6" rx="1" />
                  <rect className="traffic-vehicle__wheel" x="5" y="4" width="3" height="6" rx="1" />
                  <path className="traffic-vehicle__body" d="M-5-11Q0-13 5-11L7-5V8Q7 11 4 12H-4Q-7 11-7 8V-5Z" />
                  <path className="traffic-vehicle__glass" d="M-4-5 4-5 5-1H-5ZM-5 2H5L4 7H-4Z" />
                  <path className="traffic-vehicle__roof" d="M-4-6Q0-8 4-6L5 7Q0 9-5 7Z" />
                  <circle className="traffic-vehicle__light" cx="-3.5" cy="-9.5" r="1.1" />
                  <circle className="traffic-vehicle__light" cx="3.5" cy="-9.5" r="1.1" />
                </g>
              </g>
            )
          })}
        </g>

        <g className="traffic-map__events" aria-hidden="true">
          {map.roads.filter((road) => EVENT_BADGES[road.event] && road.geometry?.length).map((road) => {
            const badge = EVENT_BADGES[road.event]
            // A quarter of the way along the road, so the badge does not cover the distance label.
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
              <g key={node.id} className="traffic-node" transform={`translate(${node.x} ${node.y})`}>
                <title>{`${node.id} · ${node.district} · ${role}`}</title>
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
        <g className="traffic-map__scale" transform={`translate(${width - 60 - scalePx} 104)`} aria-hidden="true">
          <path d={`M0 -5V5M0 5H${scalePx}M${scalePx} -5V5`} />
          <text x={scalePx / 2} y="-8" textAnchor="middle">{map.geography?.scaleKm || 5} km</text>
        </g>
      </svg>

      <div className="traffic-map__footer">
        {userRoute && (
          <div className="traffic-map__summary">
            <strong>{coordinated ? 'Ruta QAOA' : 'Ruta Dijkstra'}:</strong>{' '}
            {shortPath(userRoute.nodePath)} · <em>{minutes(userMinutes)}</em>
            {coordinated && otherMinutes > userMinutes ? ' · evita la congestión' : ''}
            {otherPath && (
              <span>({coordinated ? 'ruta individual' : 'ruta QAOA'} {shortPath(otherPath)} · {minutes(otherMinutes)})</span>
            )}
          </div>
        )}
        <div className="traffic-map__key" aria-hidden="true">
          <span><i className="key-expressway" /><b>cian</b> = vía expresa (3 carriles)</span>
          <span><i className="key-avenue" /><b>violeta</b> = avenida (2 carriles)</span>
          <span><i className="key-local" /><b>delgada</b> = un carril</span>
          <span><i className="key-route" /><b>discontinua</b> = ruta asignada</span>
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
  const [incidentType, setIncidentType] = useState('ACCIDENT')
  const [demoIncidentId, setDemoIncidentId] = useState(MOCK_INCIDENTS[0].id)
  const [selectedRoad, setSelectedRoad] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
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

  async function handleStart() {
    setStatus('connecting')
    setError('')
    setIncident(null)
    setSelectedRoad('')
    setElapsedMs(0)

    try {
      const result = source === 'demo'
        ? { data: createMockSession(vehicleCount), latencyMs: null }
        : await startSimulation({ vehicleCount })
      if (!result.data?.sessionId || !result.data?.map || !Array.isArray(result.data?.vehicles)) {
        throw new Error('La respuesta no cumple el contrato de simulación.')
      }
      setSession(result.data)
      setSelectedRoad(source === 'demo' ? MOCK_INCIDENTS.find((item) => item.id === demoIncidentId).roadId : '')
      setSelectedVehicleId('')
      setApiLatencyMs(result.latencyMs)
      clockRef.current = { origin: performance.now(), pausedAt: 0 }
      setStatus('running')
    } catch (requestError) {
      setStatus('error')
      setError(requestError.message)
    }
  }

  function handleSourceChange(nextSource) {
    setSource(nextSource)
    setStatus('idle')
    setError('')
    setElapsedMs(0)
    setIncident(null)
    setSelectedRoad(nextSource === 'demo' ? MOCK_INCIDENTS.find((item) => item.id === demoIncidentId).roadId : '')
    setSelectedVehicleId('')
    setApiLatencyMs(null)
    setSession(nextSource === 'demo' ? createMockSession(vehicleCount) : null)
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

    try {
      const scenario = MOCK_INCIDENTS.find((item) => item.id === demoIncidentId)
      const incidentPayload = source === 'demo'
        ? { scenarioId: scenario.id, roadId: scenario.roadId, type: scenario.type, simulationTimeMs: incidentAt }
        : { roadId: selectedRoad, type: incidentType, simulationTimeMs: incidentAt }
      if (source === 'demo') await new Promise((resolve) => setTimeout(resolve, 650))
      const result = source === 'demo'
        ? { data: applyMockIncident(session, incidentPayload), latencyMs: null }
        : await reportIncident(session, incidentPayload, vehicleCount)
      if (!Array.isArray(result.data?.vehicles)) {
        throw new Error('El backend no devolvió las nuevas trayectorias.')
      }
      setSession((current) => continueSession(current, { ...current, ...result.data }, incidentAt))
      setSelectedVehicleId('')
      setApiLatencyMs(result.latencyMs)
      setIncident({ roadId: incidentPayload.roadId, type: incidentPayload.type, atMs: incidentAt })
      clockRef.current = { origin: performance.now() - incidentAt, pausedAt: incidentAt }
      setStatus(wasRunning ? 'running' : 'paused')
    } catch (requestError) {
      setStatus(wasRunning ? 'running' : 'paused')
      setError(requestError.message)
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

  return (
    <div className="traffic-lab">
      <div className="traffic-lab__toolbar" data-ui>
        <div className="traffic-lab__state">
          <span className={`connection-dot connection-dot--${status}`} />
          <div>
            <strong>{STATUS_LABELS[status]}</strong>
            <span>{session ? `${session.visualVehicleCount || vehicleCount} autos visuales · ${session.modeledVehicles || '—'} modelados · ${flowCount} flujos` : API_BASE}</span>
          </div>
        </div>

        <div className="traffic-lab__controls">
          <div className="source-switch" aria-label="Fuente de las rutas">
            <button type="button" className={source === 'demo' ? 'source-switch--active' : ''} onClick={() => handleSourceChange('demo')}>Vista previa</button>
            <button type="button" className={source === 'backend' ? 'source-switch--active' : ''} onClick={() => handleSourceChange('backend')}>Backend</button>
          </div>
          <label>
            <span>Vehículos</span>
            <select value={vehicleCount} onChange={(event) => setVehicleCount(Number(event.target.value))} disabled={status === 'connecting' || status === 'recalculating'}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
          <button className="lab-control lab-control--primary" type="button" onClick={handleStart} disabled={status === 'connecting' || status === 'recalculating'}>
            {session ? 'Reiniciar' : 'Iniciar simulación'}
          </button>
          <button className="lab-control" type="button" onClick={togglePause} disabled={!['running', 'paused'].includes(status)}>
            {status === 'paused' ? 'Continuar' : 'Pausar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="traffic-lab__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleStart}>Reintentar</button>
        </div>
      )}

      {comparison && (
        <div className="strategy-test" data-ui>
          <div className="strategy-test__intro">
            <strong>Prueba A/B · misma ciudad, mismos autos</strong>
            <span>Cambia únicamente la forma de asignar las rutas.</span>
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
              <small>Una ruta mínima por flujo</small>
            </button>
            <button
              type="button"
              className={strategy === 'coordinated' ? 'strategy-switch--active' : ''}
              aria-pressed={strategy === 'coordinated'}
              onClick={() => handleStrategyChange('coordinated')}
            >
              <span>Qflow · Qiskit</span>
              <strong>{minutes(comparison.coordinated.userEstimatedMinutes)}</strong>
              <small>Una asignación para toda la red</small>
            </button>
          </div>
          {session.keyDecision && (
            <div className="strategy-test__decision">
              <span>Decisión que cambia · {session.keyDecision.flowLabel}</span>
              <strong>{strategy === 'coordinated' ? 'Qflow' : 'Tradicional'} asigna {activePath}</strong>
            </div>
          )}
          <p>Qflow reduce el costo total de la red en <strong>{number(comparison.systemImprovementPct, 1)}%</strong>{congestionDifference > 0 ? ` y la saturación máxima en ${number(congestionDifference, 1)} puntos` : ''}.</p>
        </div>
      )}

      <div className="traffic-lab__stage" data-ui>
        <SimulationMap
          session={visibleSession}
          elapsedMs={elapsedMs}
          selectedRoad={selectedRoad}
          onSelectRoad={setSelectedRoad}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          roadsInteractive={source === 'backend'}
        />
        <aside className="incident-panel">
          <div>
            <strong>Provocar un cambio</strong>
            <p>{source === 'demo' ? 'El incidente se aplica a ambas estrategias para compararlas en igualdad de condiciones.' : 'Selecciona una vía y envía el incidente al backend.'}</p>
          </div>
          {source === 'demo' ? (
            <label>
              <span>Escenario</span>
              <select value={demoIncidentId} onChange={(event) => handleDemoIncidentChange(event.target.value)}>
                {MOCK_INCIDENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ) : (
            <label>
              <span>Tipo de incidente</span>
              <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)}>
                {INCIDENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          <div className="incident-panel__road">
            <span>Vía seleccionada</span>
            <strong>{source === 'demo' ? MOCK_INCIDENTS.find((item) => item.id === demoIncidentId).roadLabel : (selectedRoadData ? `${selectedRoadData.label} · ${selectedRoadData.lanes} carriles` : 'Haz clic en el mapa')}</strong>
          </div>
          <button type="button" onClick={handleIncident} disabled={!session || !selectedRoad || !['running', 'paused'].includes(status)}>
            Aplicar incidente
          </button>
          {incident && <small>Último evento aplicado en {seconds(incident.atMs / 1000)}.</small>}
          {selectedVehicle ? (
            <div className="vehicle-inspector">
              <span>{selectedVehicle.id} · {selectedVehicle.rerouted ? 'Redirigido' : 'Ruta mantenida'}</span>
              <strong>{selectedVehicle.flowLabel}</strong>
              <p>{selectedVehicle.explanation}</p>
              <small>Ruta {selectedVehicle.routeId} · ETA {minutes(selectedVehicle.estimatedTravelMinutes)} · representa ~{number(selectedVehicle.representedVehicles, 1)} vehículos</small>
            </div>
          ) : <small>Selecciona un auto en el mapa para explicar su asignación.</small>}
        </aside>
      </div>

      <div className="traffic-lab__progress" aria-label={`Progreso ${Math.round(progress)}%`}>
        <i style={{ width: `${progress}%` }} />
      </div>

      {solver && comparison && (
        <div className="traffic-lab__evidence" data-ui>
          <div className="solver-preview">
            <div>
              <strong>{strategy === 'coordinated' ? 'Evidencia Qiskit' : 'Referencia tradicional'}</strong>
              <span>{solver.mode}{strategy === 'coordinated' ? ` · ${number(solver.problem.binaryVariables)} variables · ${number(solver.problem.constraints)} flujos` : ` · ${flowCount} rutas independientes`}</span>
            </div>
            <ol>
              {solver.facts.map((fact) => <li key={fact.id}><span>{fact.label}</span><strong className="num">{fact.value}</strong></li>)}
            </ol>
          </div>
          <div className="strategy-comparison">
            <div className="strategy-comparison__heading">
              <strong>Individual vs. coordinada</strong>
              <span>{source === 'demo' ? 'Snapshot versionado del backend' : 'Respuesta actual de Superpose API'}</span>
            </div>
            <div className="strategy-comparison__table">
              <span /> <span className={strategy === 'traditional' ? 'is-active' : ''}>Tradicional</span><span className={strategy === 'coordinated' ? 'is-active' : ''}>Qflow</span>
              <strong>Usuario estimado</strong><span className="num">{minutes(comparison.individual.userEstimatedMinutes)}</span><span className="num">{minutes(comparison.coordinated.userEstimatedMinutes)}</span>
              <strong>Costo total red</strong><span className="num">{number(comparison.individual.systemCost, 1)}</span><span className="num">{number(comparison.coordinated.systemCost, 1)}</span>
              <strong>Saturación máxima</strong><span className="num">{number(comparison.individual.maxCongestionPct)}%</span><span className="num">{number(comparison.coordinated.maxCongestionPct)}%</span>
              <strong>Cálculo solver</strong><span className="num">—</span><span className="num">{number(comparison.coordinated.computeMs, 1)} ms</span>
            </div>
          </div>
        </div>
      )}

      <div className="traffic-lab__metrics" data-ui>
        <Metric label="Tiempo simulado" value={seconds(elapsedMs / 1000)} note="Reloj de la sesión" />
        <Metric label="Cálculo del solver" value={Number.isFinite(Number(metrics.computeMs)) ? `${number(metrics.computeMs, 1)} ms` : '—'} note={strategy === 'coordinated' ? 'quantum_telemetry.execution_time_ms' : 'No informado por el backend'} />
        <Metric label="Latencia API" value={apiLatencyMs === null ? '—' : `${number(apiLatencyMs, 1)} ms`} note={source === 'demo' ? 'Sin consulta en modo demo' : 'Ida, proceso y vuelta'} />
        <Metric label="Vehículos modelados" value={number(metrics.modeledVehicles)} note={`${visibleSession?.vehicles?.length || vehicleCount} autos visuales`} />
        <Metric label="Costo medio por flujo" value={minutes(metrics.averageTravelMinutes)} note={`Costo agregado ÷ ${flowCount} flujos`} />
        <Metric label="Saturación máxima" value={Number.isFinite(Number(metrics.maxCongestionPct)) ? `${number(metrics.maxCongestionPct, 1)}%` : '—'} note="edge_loads del backend" />
      </div>
    </div>
  )
}
