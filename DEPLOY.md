# Desplegar el frontend en Vercel

Guía para publicar Qflow en la misma cuenta de Vercel donde está Superpose API (`https://superpose-api.vercel.app`). El frontend es un sitio estático de Vite: no necesita servidor ni base de datos.

## Antes de empezar

- Acceso al repositorio de GitHub [`P1er0uni/Fronted---superpose`](https://github.com/P1er0uni/Fronted---superpose). El dueño del repo puede agregarte como colaborador en **Settings → Collaborators**, o puedes hacer un fork a tu cuenta.
- La cuenta de Vercel debe tener permiso para leer ese repo (la integración de GitHub de Vercel lo pide al importar).

## Opción A: desde el panel de Vercel (recomendada)

1. En Vercel, **Add New… → Project**.
2. Elige el repositorio `Fronted---superpose` y pulsa **Import**.
3. Vercel lee `vercel.json` y completa solo la configuración:

   | Campo | Valor |
   | --- | --- |
   | Framework Preset | Vite |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Node.js | 22.x o superior (lo fija `engines` en `package.json`) |

4. **Environment Variables** (opcional): el frontend ya apunta a `https://superpose-api.vercel.app`. Solo hace falta definir algo si el backend tiene otra URL:

   | Nombre | Ejemplo |
   | --- | --- |
   | `VITE_SIMULATION_API_URL` | `https://superpose-api.vercel.app` |
   | `VITE_SIMULATION_TIMEOUT_MS` | `30000` |

   Son variables de compilación: si las cambias después, vuelve a desplegar (**Deployments → Redeploy**).

5. Pulsa **Deploy**. En menos de un minuto queda publicado en una URL `*.vercel.app`.

Desde ese momento, cada push a `main` despliega a producción y cada push a otra rama genera una URL de vista previa.

## Opción B: desde la terminal

```bash
npm i -g vercel
vercel login
vercel link
vercel --prod
```

`vercel link` crea el proyecto en la cuenta con la que iniciaste sesión; elige el equipo donde está el backend.

## Comprobar que funciona

1. Abre la URL publicada y baja al **Laboratorio en vivo**.
2. El indicador debe decir **Simulación activa** con la fuente **Backend** seleccionada.
3. El resumen bajo el mapa debe mostrar la ruta QAOA `A → C → E → F`.
4. Haz clic en una vía, pulsa **Aplicar incidente** y comprueba que aparece el badge del evento.
5. Pulsa **Reiniciar** al terminar: los incidentes se guardan en el backend y los ven todos los usuarios.

Si aparece **Sin conexión**:

- Comprueba que `https://superpose-api.vercel.app/api/v1/topology` responde en el navegador.
- El backend debe seguir permitiendo CORS desde el dominio del frontend (hoy responde `Access-Control-Allow-Origin: *`).
- Si definiste `VITE_SIMULATION_API_URL`, revisa que no termine en `/api` ni tenga espacios.

## Notas del backend

- El estado de los incidentes es global: no hay sesiones por usuario.
- Cada optimización QAOA tarda alrededor de 1 s; el frontend cancela la petición a los 30 s.
- Si el backend pasa a tener otro dominio, basta con cambiar `VITE_SIMULATION_API_URL` y volver a desplegar.
