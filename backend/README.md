# JELCOM Envíos — Backend (Fase 1)

Motor de envíos masivos. Esta parte es el cerebro: base de datos, depuración, motor de envío
(pausar/reanudar), generación de informes y conexión con proveedores.

## Requisitos
- Node.js 18 o superior

## Instalación (una sola vez)

```powershell
cd backend
npm install
copy .env.example .env      # crea tu archivo de configuración
npm run init-db             # crea la base de datos
```

## Poner las credenciales
Abre el archivo `.env` y pega tus datos. Para SMS necesitas:
```
HABLAME_ACCOUNT=tu_account
HABLAME_API_KEY=tu_apikey
HABLAME_REMITENTE=87130
```
Guarda. **Con solo pegar esto, SMS queda conectado.** Nada más que tocar.

## Arrancar
```powershell
npm start
```
Verás: `🚀 JELCOM Envíos — backend corriendo en http://localhost:4000`

Prueba en el navegador: http://localhost:4000/api/health

## Qué hace cada carpeta
- `src/db/` — base de datos SQLite y su esquema
- `src/services/depurar.js` — la limpieza de bases (teléfonos y correos)
- `src/services/motor.js` — el motor de envío con pausar/reanudar y reintentos
- `src/services/informe.js` — genera el Excel con formato JELCOM
- `src/services/proveedores/` — un adaptador por proveedor (hablame.js listo; meta y brevo en sus fases)
- `src/routes/` — la API que usará el frontend

## Probar sin frontend (opcional, con curl)
```powershell
# 1. Probar conexión Háblame (cuando tengas credenciales)
curl -X POST http://localhost:4000/api/conexiones/hablame/probar

# 2. Crear una campaña SMS
curl -X POST http://localhost:4000/api/campanas -H "Content-Type: application/json" -d "{\"nombre\":\"Prueba\",\"canal\":\"sms\",\"cuerpo\":\"Hola desde JELCOM\"}"
```

## Siguiente paso
El frontend en React (páginas SMS, Conexiones, etc.) se conecta a este backend.
