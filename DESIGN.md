---
name: "Qflow"
description: "La asignación coordinada de rutas convertida en una interfaz viva."
colors:
  background: "#1c1c1c"
  surface: "#262626"
  ink: "#f1f1ef"
  muted: "#b8bab4"
  accent: "#9fba9d"
  accent-hover: "#b3cbae"
  accent-ink: "#171a17"
  field: "#c8c5ba"
  field-ink: "#1c1c1c"
  alert: "#db7d64"
  route-a: "#d5f0a5"
  route-b: "#88cad3"
  route-c: "#f1d27e"
  interface-paper: "#f7f8f5"
typography:
  display:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(3.25rem, 6.3vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(2.6rem, 2rem + 3.4vw, 5.5rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(1.6rem, 2.5vw, 2.65rem)"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.48
  lead:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem)"
    fontWeight: 400
    lineHeight: 1.48
  label:
    fontFamily: "Clash Grotesk, Aptos, sans-serif"
    fontSize: "clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)"
    fontWeight: 400
    lineHeight: 1.48
rounded:
  flat: "0"
  card: "14px"
  panel: "16px"
  pill: "99px"
  circle: "50%"
spacing:
  page-margin: "clamp(1.25rem, 2.8vw, 2.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.flat}"
    padding: "0.95rem 1.15rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.flat}"
  button-dark:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.flat}"
    padding: "0.95rem 1.15rem"
  chip-status:
    backgroundColor: "#e8eee5"
    textColor: "#315334"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.45rem 0.75rem"
  card-interface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1rem 1.15rem"
  panel-light:
    backgroundColor: "{colors.interface-paper}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.panel}"
    padding: "2rem"
---

# Design System: Qflow

## Overview

**Creative North Star: "The product performs"**

Qflow no explica el sistema desde fuera: convierte la asignación coordinada de rutas en la imagen principal y deja que la interfaz demuestre el concepto. La red vial, las rutas separadas y la reacción a un incidente son el material visual; el gesto central permite introducir o retirar un accidente y ver cómo cambia el conjunto.

La dirección del fragmento de producto es **“Framed sheet”**: las superficies claras y los módulos con bordes pertenecen a la interfaz simulada, mientras que la página editorial permanece plana, amplia y oscura. La expresividad procede de cambios de escala, campos cromáticos, recortes geométricos y composición asimétrica, no de decoración añadida.

**Key Characteristics:**

- El producto actúa como argumento visual, no como captura ornamental.
- Una página editorial oscura enmarca hojas claras y módulos de datos contenidos.
- La composición cambia por sección, pero conserva márgenes fluidos y contraste fuerte.
- Qflow se presenta como una primera versión conceptual y un nombre provisional.

## Colors

La paleta combina carbón y marfil con un verde salvia funcional; cian, lima y ámbar distinguen rutas, y coral se reserva para incidentes.

### Primary

- **Verde de coordinación:** acción principal, grandes campos de énfasis y selección.
- **Tinta de acción:** texto y símbolos colocados sobre el verde de coordinación.

### Secondary

- **Coral de incidente:** accidentes, estados de alerta y pulsos de recalculado.
- **Trío de rutas:** verde lima, cian y ámbar separan alternativas sin convertirlas en decoración general.

### Neutral

- **Carbón de ciudad:** lienzo principal y botón oscuro.
- **Grafito de superficie:** navegación móvil, footer y módulos oscuros.
- **Marfil de lectura:** texto principal sobre carbón.
- **Gris de contexto:** texto secundario y metadatos.
- **Campo mineral:** secciones claras de laboratorio y cierre.
- **Papel de interfaz:** mapa, paneles claros y fragmentos de producto.

**The Functional Color Rule.** El acento verde señala coordinación o acción; el coral señala incidente; los tres colores de ruta solo distinguen alternativas de movilidad.

## Typography

**Display Font:** Clash Grotesk (con Aptos y sans-serif como respaldo)  
**Body Font:** Clash Grotesk (con Aptos y sans-serif como respaldo)

**Character:** Una sola familia grotesca mantiene continuidad entre relato e interfaz. El contraste nace de escala, peso y densidad: titulares grandes y tensos frente a cuerpos sobrios y datos compactos.

### Hierarchy

- **Display** (400, escala fluida, 0.92): hero y grandes cierres; tracking negativo y un máximo visual de dos líneas.
- **Headline** (400, escala fluida, 0.98): títulos principales de sección.
- **Title** (400, escala fluida): títulos de audiencias y módulos destacados.
- **Lead** (400, escala fluida): introducciones de hero y secciones claras, normalmente limitadas a 42–48 caracteres por línea.
- **Body** (400, escala fluida, 1.48): explicación editorial; la columna de método aumenta a 1.62 para lectura sostenida.
- **Label** (400, escala fluida): estados, leyendas y metadatos; no se fuerza a mayúsculas.

**The Two-Weight Rule.** Solo se usan los pesos 400 y 500; la jerarquía depende primero de tamaño, posición y color.

## Layout

El sistema usa una cuadrícula de doce columnas en hero y footer, con margen lateral fluido entre 20 y 40 px. En escritorio, el hero enfrenta el argumento en las primeras seis columnas con una interfaz de rutas que nace en la quinta y se extiende hasta el borde derecho; el campo verde se recorta con una esquina diagonal. Las secciones siguientes cambian deliberadamente de estructura: declaración partida, laboratorio a dos columnas, columna de método desplazada al 30%, escalera de audiencias, cierre bipartito y footer en mosaico.

A 900 px, la navegación se convierte en menú desplegable, el hero pasa a flujo vertical, las secciones de dos columnas se apilan y las audiencias pierden sus offsets escalonados. A 560 px se simplifican estados del mapa, leyendas, filas de evento y paneles. La maqueta conserva el desborde horizontal interno del mapa como una ventana encuadrada, no como una compresión ilegible.

**The Changing-Composition Rule.** Cada sección puede adoptar una composición distinta, pero todas comparten el mismo margen de página, tipografía y lógica cromática.

## Elevation & Depth

El sistema es plano: no usa sombras. La profundidad se comunica mediante campos de color, solapamiento del hero, bordes finos dentro de fragmentos de producto y contraste tonal entre carbón, grafito, mineral y papel. Los elementos de marketing permanecen sin contorno; los bordes se reservan para datos y paneles que pertenecen a la interfaz.

**The Flat-by-Default Rule.** No añadir sombras, glassmorphism ni gradientes; separar planos con tono, recorte, borde funcional o solapamiento.

## Shapes

La página editorial usa rectángulos de esquinas rectas. Los botones principales, la navegación activa, las leyendas y las piezas del footer son planos y sin radio. Los radios contenidos pertenecen a la interfaz: tarjetas de datos de 14 px, hojas claras de 16 px, chips y bandas completamente redondeados, y puntos circulares de estado. El gran recorte diagonal del hero funciona como silueta distintiva; no debe repetirse como ornamento menor.

**The Framed-Sheet Rule.** Curvas, bordes y divisores viven dentro de los fragmentos de producto; el marco editorial se mantiene recto.

## Components

### Buttons

- **Shape:** rectángulo plano, sin radio.
- **Primary:** fondo verde de coordinación, tinta oscura, icono de flecha de trazo cuadrado y separación generosa.
- **Hover / Focus / Active:** asciende 3 px y aclara el verde al pasar el cursor; desciende 1 px al activar; el foco visible usa un contorno cian de 3 px separado 5 px.
- **Dark:** conserva forma y espaciado, invierte a carbón y marfil y aclara a grafito en hover.

### Chips

- **Status:** píldora pálida con punto circular; cambia a fondo cálido, texto oscuro y punto coral cuando hay incidente.
- **Legend:** rectángulo plano mineral, compacto y sin comportamiento de selección.

### Cards / Containers

- **Data cards:** grafito, borde tonal fino, radio contenido y altura mínima amplia para que los datos respiren.
- **Light panels:** papel de interfaz, tinta oscura, borde mineral y radio de hoja.
- **Shadow Strategy:** ninguna; ver Elevation & Depth.

### Navigation

La navegación de escritorio es una fila ligera; los enlaces simples cambian a verde en hover y la acción final se presenta como botón verde. En móvil, un control “Menú/Cerrar” expone una hoja grafito apilada debajo del encabezado; elegir cualquier enlace cierra el menú.

### Coordinated Route Map

El mapa enmarca tres trayectorias, vehículos animados, origen, destinos, estado y resumen. “Simular accidente” alterna el estado, cambia el texto y el color de alerta y recalcula las geometrías de las tres rutas; “Aplicar al mapa” activa el mismo estado desde la sección de método.

La entrada usa una apertura tipo shutter de 1.1 s y los elementos editoriales aparecen con un reveal vertical de 0.75 s. Con `prefers-reduced-motion`, el desplazamiento suave y las transiciones se reducen casi a cero, y los vehículos animados se ocultan.

## Do's and Don'ts

### Do:

- **Do** convertir el comportamiento real del producto —rutas distintas y reacción a incidentes— en la demostración principal.
- **Do** reservar bordes, radios y divisores para fragmentos reconocibles como interfaz.
- **Do** mantener el laboratorio vacío y nombrado como módulo futuro hasta que exista una simulación real.
- **Do** identificar cifras, estados e integraciones como conceptuales o pendientes cuando corresponda.

### Don't:

- **Don't** añadir gradientes, glassmorphism, sombras decorativas o tarjetas genéricas a la capa editorial.
- **Don't** reutilizar el coral de alerta o los colores de ruta como acentos decorativos.
- **Don't** presentar Qflow como marca confirmada ni los datos ilustrativos como benchmarks.
- **Don't** reemplazar la demostración coordinada por una imagen de tráfico genérica.
