# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegado por el usuario: React con Vite y npm, preparado para desarrollo local y un despliegue posterior en Vercel.

## Users

Conductores, operadores de flotas y responsables de movilidad urbana que necesitan reducir la congestión y reaccionar a incidentes viales.

## Product Purpose

Coordinar las rutas de múltiples vehículos como un solo problema para mejorar los tiempos de ejecución del cálculo y los tiempos de viaje.

## Positioning

En lugar de recomendar la misma ruta aparentemente óptima a todos los autos, el sistema asigna rutas diferentes y compatibles entre sí mediante optimización cuántica.

## Capabilities and Constraints

- Debe responder a reportes como accidentes, vías cerradas, obras y alta demanda.
- El backend previsto usará Qiskit para formular y ejecutar la optimización cuántica o híbrida.
- El frontend se conecta a Superpose API (`/api/v1/events/reset`, `/api/v1/route/optimize`, `/api/v1/events/report`), que ejecuta QAOA con Qiskit y Dijkstra con NetworkX. El navegador no calcula rutas.
- La vista previa reproduce un snapshot versionado del backend para presentar la demo sin servidor; el modo Backend muestra la respuesta real.
- Debe poder desplegarse posteriormente en Vercel.

## Brand Commitments

El concepto de trabajo es “superwaze”. Qflow es un nombre provisional para esta primera interfaz, no una marca confirmada.

## Evidence on Hand

El escenario es una red simplificada de Lima (6 nodos, 8 vías, 3 flujos, 51 vehículos) con coordenadas aproximadas. No hay todavía datos de tráfico reales, benchmarks, clientes ni testimonios. La interfaz debe identificar claramente los valores demostrativos.

## Product Principles

- Optimizar la red completa, no solo un viaje aislado.
- Hacer visible por qué cada vehículo recibe una ruta diferente.
- Reaccionar de forma comprensible a cambios en la vía.
- No presentar simulaciones ni resultados conceptuales como evidencia real.
