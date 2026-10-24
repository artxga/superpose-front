import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import TrafficLab from './components/TrafficLab'

const Arrow = ({ direction = 'right' }) => (
  <svg className={`icon icon--${direction}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const NetworkIcon = () => (
  <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
    <path d="M5 25 17 6l12 19M8 20h18" />
    <circle cx="5" cy="25" r="2.5" />
    <circle cx="17" cy="6" r="2.5" />
    <circle cx="29" cy="25" r="2.5" />
  </svg>
)

function RouteNetwork({ incident }) {
  const routes = incident
    ? [
        'M72 290 C150 250 140 115 265 118 S405 240 512 160 S620 92 735 100',
        'M72 290 C178 338 245 330 330 265 S475 275 555 325 S670 340 735 260',
        'M72 290 C105 190 200 218 290 230 S465 170 525 105 S650 140 735 178',
      ]
    : [
        'M72 290 C170 230 240 218 330 205 S530 170 735 100',
        'M72 290 C180 290 250 270 360 245 S580 220 735 260',
        'M72 290 C150 250 260 240 360 220 S550 160 735 178',
      ]

  return (
    <div className="network" data-ui>
      <div className="network__topline">
        <div>
          <span>Asignación activa</span>
          <strong>{incident ? 'Incidente detectado' : 'Flujo estable'}</strong>
        </div>
        <span className={`status ${incident ? 'status--alert' : ''}`}>
          <i /> {incident ? 'Recalculando' : 'Sin incidentes'}
        </span>
      </div>

      <svg className="route-map" viewBox="0 0 800 390" role="img" aria-label={incident ? 'Red de rutas redistribuida por un incidente' : 'Red de rutas coordinadas'}>
        <path className="street" d="M18 84H782M18 190H782M18 302H782M132 18V372M286 18V372M474 18V372M646 18V372" />
        <path className="street street--minor" d="M18 136H782M18 248H782M214 18V372M382 18V372M556 18V372M724 18V372" />
        {routes.map((route, index) => (
          <g key={`${incident}-${index}`}>
            <path className={`route route--${index + 1}`} d={route} />
            <circle className={`vehicle vehicle--${index + 1}`} r="7">
              <animateMotion dur={`${5.4 + index * 1.2}s`} repeatCount="indefinite" path={route} />
            </circle>
          </g>
        ))}
        <circle className="origin" cx="72" cy="290" r="13" />
        <circle className="destination" cx="735" cy="100" r="13" />
        <circle className="destination" cx="735" cy="178" r="13" />
        <circle className="destination" cx="735" cy="260" r="13" />
        {incident && <g className="incident"><circle cx="474" cy="190" r="22" /><path d="m464 180 20 20m0-20-20 20" /></g>}
      </svg>

      <div className="network__summary">
        <div><span>Vehículos</span><strong>3</strong></div>
        <div><span>Rutas repetidas</span><strong>0</strong></div>
        <div><span>Estado</span><strong>{incident ? 'Desvío' : 'Óptimo'}</strong></div>
      </div>
    </div>
  )
}

function App() {
  const [incident, setIncident] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' }).format(new Date()))
    update()
    const id = window.setInterval(update, 30000)
    return () => window.clearInterval(id)
  }, [])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <header className="site-header">
        <a className="wordmark" href="#inicio" aria-label="Qflow, inicio"><NetworkIcon />Qflow</a>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen(!menuOpen)}>
          <span>{menuOpen ? 'Cerrar' : 'Menú'}</span>
        </button>
        <nav id="site-nav" className={menuOpen ? 'nav nav--open' : 'nav'} aria-label="Navegación principal">
          <a href="#sistema" onClick={closeMenu}>El sistema</a>
          <a href="#laboratorio" onClick={closeMenu}>Laboratorio</a>
          <a href="#metodo" onClick={closeMenu}>Método</a>
          <a className="nav__action" href="#laboratorio" onClick={closeMenu}>Ver demostración</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <div className="hero__copy reveal">
            <h1 id="hero-title">Cada auto,<br />una ruta.</h1>
            <p>Qflow no busca la mejor ruta para cada conductor de forma aislada. Busca la mejor asignación conjunta para toda la red.</p>
            <a className="button" href="#laboratorio">Explorar el sistema <Arrow /></a>
          </div>
          <div className="hero__stage reveal" style={{ '--delay': '100ms' }}>
            <RouteNetwork incident={incident} />
            <button className={`incident-toggle ${incident ? 'incident-toggle--active' : ''}`} type="button" aria-pressed={incident} onClick={() => setIncident(!incident)}>
              <span>{incident ? 'Retirar incidente' : 'Simular accidente'}</span>
              <i aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="intro" id="sistema" aria-label="Qué cambia con Qflow">
          <div className="intro__copy reveal">
            <p><strong>Una ruta rápida para todos puede convertirse en una ruta lenta para todos.</strong></p>
            <p>Los navegadores tradicionales optimizan cada viaje por separado. Cuando miles de autos reciben la misma recomendación, la congestión simplemente cambia de lugar.</p>
            <p>Qflow plantea otra pregunta: ¿qué combinación de rutas mejora el movimiento de toda la red sin abandonar el destino de cada conductor?</p>
            <p>La optimización cuántica explora esas combinaciones y asigna alternativas coordinadas. Si aparece un accidente, un cierre o una vía saturada, el conjunto se calcula de nuevo.</p>
          </div>
          <div className="intro__statement reveal" style={{ '--delay': '100ms' }} aria-hidden="true">
            <span>No todos</span>
            <strong>juntos.</strong>
          </div>
        </section>

        <section className="lab" id="laboratorio" aria-labelledby="lab-title">
          <div className="lab__heading reveal">
            <h2 id="lab-title">Laboratorio en vivo</h2>
            <p>Los mismos vehículos recorren la misma ciudad con dos estrategias: Dijkstra individual y asignación conjunta con Qiskit.</p>
          </div>
          <div className="lab__disclosure reveal" style={{ '--delay': '80ms' }}>
            <span>La vista previa reproduce un snapshot de Superpose API; el modo Backend consulta el servidor actual.</span>
            <span>La interfaz no calcula rutas.</span>
          </div>
          <div className="reveal" style={{ '--delay': '140ms' }}>
            <TrafficLab />
          </div>
        </section>

        <section className="method" id="metodo" aria-labelledby="method-title">
          <div className="method__column">
            <h2 id="method-title" className="reveal">Del reporte a una nueva red</h2>
            <article className="method__step reveal">
              <p><strong>Primero, la ciudad se convierte en decisiones.</strong> Intersecciones, vías, tiempos y capacidad forman un modelo donde cada vehículo conserva su origen y destino.</p>
              <div className="evidence" data-ui>
                <div><span>Red activa</span><strong>6 nodos</strong></div>
                <div><span>Conexiones</span><strong>8 vías</strong></div>
                <div><span>Decisiones QUBO</span><strong>6 binarias</strong></div>
              </div>
            </article>
            <article className="method__step reveal">
              <p><strong>Después, el optimizador busca una combinación.</strong> Superpose API usa Qiskit para resolver la asignación QAOA y devuelve alternativas compatibles entre sí.</p>
              <div className="route-bands" data-ui aria-label="Tres rutas distribuidas">
                <i /><i /><i />
              </div>
            </article>
            <article className="method__step reveal">
              <p><strong>Cuando algo cambia, cambia el conjunto.</strong> Un reporte reduce la capacidad de una vía y dispara un nuevo cálculo para los vehículos afectados.</p>
              <div className="event-row" data-ui>
                <div><span>Vía central C–D</span><strong>Accidente reportado</strong></div>
                <div><span>Flujo afectado</span><strong>Usuario A → F</strong></div>
                <button type="button" onClick={() => setIncident(true)}>Aplicar al mapa</button>
              </div>
            </article>
          </div>
        </section>

        <section className="audiences" aria-labelledby="audiences-title">
          <h2 id="audiences-title" className="reveal">Una red. Tres escalas.</h2>
          <div className="audiences__items">
            <article className="reveal"><h3>Conductores</h3><p>Reciben una alternativa que considera lo que ocurrirá cuando otros autos también se muevan.</p></article>
            <article className="reveal" style={{ '--delay': '70ms' }}><h3>Flotas</h3><p>Coordinan múltiples viajes sin enviar cada vehículo al mismo corredor aparentemente rápido.</p></article>
            <article className="reveal" style={{ '--delay': '140ms' }}><h3>Ciudades</h3><p>Prueban cómo incidentes y restricciones alteran la red antes de intervenir el tráfico real.</p></article>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <div className="closing__copy reveal">
            <h2 id="closing-title">Moverse mejor<br />es coordinarse.</h2>
            <p>La siguiente etapa conectará datos reales, el motor de optimización y una simulación visible de cada decisión.</p>
            <a className="button button--dark" href="#laboratorio">Volver al laboratorio <Arrow /></a>
          </div>
          <div className="closing__panel reveal" data-ui style={{ '--delay': '100ms' }}>
            <span>Próxima integración</span>
            <strong>Motor de simulación</strong>
            <p>Entrada de eventos, comparación de estrategias y actualización de rutas en tiempo real.</p>
            <div><span>Frontend local</span><b>Listo</b></div>
            <div><span>Motor cuántico</span><b>Pendiente</b></div>
            <div><span>Datos de tráfico</span><b>Pendiente</b></div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__brand"><span>Qflow</span></div>
        <a className="footer__invite" href="#inicio">Volver al inicio <Arrow direction="up" /></a>
        <div className="footer__nav"><a href="#sistema">Sistema</a><a href="#laboratorio">Laboratorio</a><a href="#metodo">Método</a></div>
        <div className="footer__time"><span>Lima, Perú</span><strong>{time || '--:--'}</strong></div>
        <div className="footer__note"><p>Primera versión conceptual.</p><span>Qflow es un nombre provisional.</span></div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
