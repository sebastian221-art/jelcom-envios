# JELCOM Envíos — Frontend (React)

La cara visual de la plataforma. Se conecta al backend (puerto 4000).

## Requisitos
- Node.js 18+
- El **backend debe estar corriendo** en otra terminal (`npm start` en la carpeta backend).

## Instalación (una vez)
```powershell
cd frontend
npm install
```

## Arrancar
```powershell
npm run dev
```
Abre lo que te muestre (normalmente **http://localhost:5173**).

> El frontend habla con el backend a través de un proxy: todo lo que empieza por `/api`
> se redirige solo al puerto 4000. No tienes que configurar nada.

## Cómo usar (SMS)
1. Entra a **SMS** en el menú.
2. **1 · Contenido:** nombre de campaña + mensaje (te muestra los segmentos en vivo).
3. **2 · Base:** selecciona el Excel y pulsa **Cargar y depurar**. Verás válidos, duplicados e inválidos.
4. **3 · Envío:** **Realizar envío** → los logs corren en vivo. Puedes **Pausar** y **Reanudar**.
5. Al terminar: **Descargar informe Excel** (formato JELCOM).

## Páginas
- **SMS** — funcional (Fase 1).
- **WhatsApp / Correo** — llegan en sus fases (el motor ya está listo por debajo).
- **Campañas** — historial de todos los envíos + descargar informe.
- **Conexiones** — estado de Háblame / Meta / Brevo. Pulsa "Probar conexión".
- **Configuración / Usuarios** — siguientes fases.

## Orden para trabajar cada día
1. Terminal 1: `cd backend` → `npm start`
2. Terminal 2: `cd frontend` → `npm run dev`
3. Navegador: http://localhost:5173
