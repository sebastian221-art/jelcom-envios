-- ─────────────────────────────────────────────────────────────
--  ESQUEMA DE BASE DE DATOS — Plataforma de Envíos JELCOM
--  CAMPAÑA = cliente/proyecto (ej. Cajasan)
--  ENVÍO   = cada mensaje masivo individual
--  CUENTA WHATSAPP = número/credenciales de WhatsApp (varios clientes)
-- ─────────────────────────────────────────────────────────────

-- Cuentas de WhatsApp (cada cliente puede tener la suya)
CREATE TABLE IF NOT EXISTS cuentas_whatsapp (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  telefono        TEXT,
  wa_token        TEXT,
  wa_phone_id     TEXT,
  wa_business_id  TEXT,
  activa          INTEGER DEFAULT 1,
  creada_en       TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS campanas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  color         TEXT DEFAULT '#FF6B00',
  cuenta_wa_id  INTEGER REFERENCES cuentas_whatsapp(id),
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO campanas (id, nombre, color) VALUES (1, 'Envíos ocasionales', '#6b7280');

CREATE TABLE IF NOT EXISTS envios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campana_id    INTEGER NOT NULL DEFAULT 1 REFERENCES campanas(id),
  cuenta_wa_id  INTEGER REFERENCES cuentas_whatsapp(id),
  cuenta_sms_id INTEGER REFERENCES cuentas_sms(id),
  padre_id      INTEGER REFERENCES envios(id),  -- si este envío nació de dividir otro, apunta al original
  nombre        TEXT NOT NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('sms','whatsapp','correo','voz')),
  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','lista','en_curso','pausada','finalizada','error')),
  cuerpo        TEXT,
  asunto        TEXT,
  imagen_url    TEXT,
  enlace        TEXT,
  plantilla     TEXT,
  idioma        TEXT,
  modo_audio    TEXT,          -- 'pregrabado' | 'texto' (bot de voz)
  audio_url     TEXT,          -- URL del audio pregrabado
  texto_voz     TEXT,          -- texto a convertir en voz (ElevenLabs)
  voz_id        TEXT,          -- id de voz de ElevenLabs
  tecla_captura TEXT,          -- descripción de qué tecla capturar
  total_base    INTEGER DEFAULT 0,
  total_validos INTEGER DEFAULT 0,
  total_dup     INTEGER DEFAULT 0,
  total_invalid INTEGER DEFAULT 0,
  total_enviados INTEGER DEFAULT 0,
  total_errores INTEGER DEFAULT 0,
  creado_por    TEXT,
  creado_en     TEXT DEFAULT (datetime('now','localtime')),
  enviado_en    TEXT
);
CREATE INDEX IF NOT EXISTS idx_envios_campana ON envios(campana_id);
CREATE INDEX IF NOT EXISTS idx_envios_padre ON envios(padre_id);

CREATE TABLE IF NOT EXISTS contactos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  envio_id      INTEGER NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  destino       TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','enviado','entregado','leido','rebotado','error','contestada','no_contestada')),
  comprobante   TEXT,
  intento       INTEGER DEFAULT 0,
  detalle_error TEXT,
  tecla_marcada TEXT,          -- tecla que marcó en la llamada de voz
  duracion_seg  INTEGER,       -- duración de la llamada en segundos
  enviado_en    TEXT
);
CREATE INDEX IF NOT EXISTS idx_contactos_envio ON contactos(envio_id);
CREATE INDEX IF NOT EXISTS idx_contactos_estado ON contactos(envio_id, estado);

CREATE TABLE IF NOT EXISTS descartados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  envio_id      INTEGER NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  valor         TEXT,
  motivo        TEXT
);
CREATE INDEX IF NOT EXISTS idx_descartados_envio ON descartados(envio_id);

CREATE TABLE IF NOT EXISTS logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  envio_id      INTEGER REFERENCES envios(id) ON DELETE CASCADE,
  ts            TEXT DEFAULT (datetime('now','localtime')),
  nivel         TEXT DEFAULT 'info' CHECK (nivel IN ('info','warn','error')),
  mensaje       TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_envio ON logs(envio_id, id);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'operador' CHECK (rol IN ('admin','operador')),
  activo        INTEGER DEFAULT 1,
  creado_en     TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS conexiones (
  proveedor     TEXT PRIMARY KEY CHECK (proveedor IN ('hablame','meta','brevo','twilio','elevenlabs')),
  estado        TEXT DEFAULT 'sin_probar' CHECK (estado IN ('ok','error','sin_probar')),
  detalle       TEXT,
  saldo         TEXT,
  ultimo_chequeo TEXT
);
INSERT OR IGNORE INTO conexiones (proveedor, estado) VALUES ('hablame','sin_probar');
INSERT OR IGNORE INTO conexiones (proveedor, estado) VALUES ('meta','sin_probar');
INSERT OR IGNORE INTO conexiones (proveedor, estado) VALUES ('brevo','sin_probar');
INSERT OR IGNORE INTO conexiones (proveedor, estado) VALUES ('twilio','sin_probar');
INSERT OR IGNORE INTO conexiones (proveedor, estado) VALUES ('elevenlabs','sin_probar');

CREATE TABLE IF NOT EXISTS plantillas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  categoria     TEXT,
  idioma        TEXT,
  cuerpo        TEXT,
  tipo_cabecera TEXT DEFAULT 'ninguna',
  imagen_ejemplo TEXT,
  meta_id       TEXT,
  estado        TEXT DEFAULT 'PENDIENTE',
  motivo        TEXT,
  cuenta_wa_id  INTEGER REFERENCES cuentas_whatsapp(id),
  creada_en     TEXT DEFAULT (datetime('now','localtime')),
  revisada_en   TEXT
);

-- CONFIGURACIÓN general (clave-valor). Datos de Jelcom, credenciales editables, etc.
CREATE TABLE IF NOT EXISTS configuracion (
  clave   TEXT PRIMARY KEY,
  valor   TEXT
);
-- Semillas de datos de Jelcom para los informes
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('empresa_nombre', 'JELCOM Soluciones Empresariales');
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('empresa_email', 'info.jelcom@gmail.com');
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('informe_nota', 'Envío ejecutado por la plataforma JELCOM.');

-- ─────────────────────────────────────────────────────────────
--  CALL CENTER (Fase 3) — llamadas con agentes humanos
-- ─────────────────────────────────────────────────────────────

-- AGENTES del call center (pueden ser los mismos usuarios, o aparte)
CREATE TABLE IF NOT EXISTS agentes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  usuario_id  INTEGER REFERENCES usuarios(id),
  estado      TEXT DEFAULT 'desconectado'
              CHECK (estado IN ('desconectado','disponible','en_llamada','pausa')),
  activo      INTEGER DEFAULT 1,
  creado_en   TEXT DEFAULT (datetime('now','localtime'))
);

-- CAMPAÑAS DE LLAMADA (una tanda de llamadas con agentes para un cliente)
CREATE TABLE IF NOT EXISTS campanas_llamada (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campana_id    INTEGER NOT NULL DEFAULT 1 REFERENCES campanas(id), -- cliente
  nombre        TEXT NOT NULL,
  formulario_id INTEGER REFERENCES formularios(id),
  modo_marcado  TEXT DEFAULT 'manual' CHECK (modo_marcado IN ('manual','automatico')),
  estado        TEXT DEFAULT 'borrador'
                CHECK (estado IN ('borrador','activa','pausada','finalizada')),
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);

-- CONTACTOS a llamar en una campaña de llamada
CREATE TABLE IF NOT EXISTS contactos_llamada (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  camp_llamada_id INTEGER NOT NULL REFERENCES campanas_llamada(id) ON DELETE CASCADE,
  nombre        TEXT,
  telefono      TEXT NOT NULL,
  estado        TEXT DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_curso','completado','no_contesta','reagendar')),
  agente_id     INTEGER REFERENCES agentes(id),
  tipificacion_id INTEGER REFERENCES tipificaciones(id),
  intentos      INTEGER DEFAULT 0,
  duracion_seg  INTEGER,
  call_sid      TEXT,
  atendido_en   TEXT
);
CREATE INDEX IF NOT EXISTS idx_contllam_camp ON contactos_llamada(camp_llamada_id, estado);

-- FORMULARIOS (encuestas/guiones de preguntas)
CREATE TABLE IF NOT EXISTS formularios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  creado_en   TEXT DEFAULT (datetime('now','localtime'))
);

-- PREGUNTAS de un formulario
CREATE TABLE IF NOT EXISTS preguntas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  formulario_id INTEGER NOT NULL REFERENCES formularios(id) ON DELETE CASCADE,
  texto         TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'opcion'
                CHECK (tipo IN ('si_no','opcion','texto','numero')),
  opciones      TEXT,   -- JSON con las opciones (para tipo 'opcion')
  orden         INTEGER DEFAULT 0,
  obligatoria   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_preguntas_form ON preguntas(formulario_id, orden);

-- TIPIFICACIONES (resultado de la llamada: contestó, no interesado, etc.)
CREATE TABLE IF NOT EXISTS tipificaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  color       TEXT DEFAULT '#6b7280',
  es_exito    INTEGER DEFAULT 0,   -- marca si cuenta como gestión exitosa
  activa      INTEGER DEFAULT 1
);

-- RESPUESTAS que da el agente por cada llamada
CREATE TABLE IF NOT EXISTS respuestas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contacto_llamada_id INTEGER NOT NULL REFERENCES contactos_llamada(id) ON DELETE CASCADE,
  pregunta_id   INTEGER NOT NULL REFERENCES preguntas(id),
  valor         TEXT,
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_respuestas_cont ON respuestas(contacto_llamada_id);

-- Tipificaciones por defecto
INSERT OR IGNORE INTO tipificaciones (id, nombre, color, es_exito) VALUES
  (1, 'Contestó - Gestión exitosa', '#16a34a', 1),
  (2, 'Contestó - No interesado', '#ED7D31', 0),
  (3, 'No contesta', '#6b7280', 0),
  (4, 'Número equivocado', '#dc2626', 0),
  (5, 'Volver a llamar', '#2E5496', 0);

-- ─────────────────────────────────────────────────────────────
--  CUENTAS DE SMS (multi-proveedor: hablame, brevo, otros)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_sms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,              -- "Háblame Jelcom", "Brevo SMS"
  proveedor     TEXT NOT NULL DEFAULT 'hablame' CHECK (proveedor IN ('hablame','brevo','labsmobile')),
  remitente     TEXT,                       -- nombre corto que ve el destinatario
  -- credenciales (según proveedor)
  hablame_account TEXT,
  hablame_apikey  TEXT,
  hablame_url     TEXT,
  brevo_apikey    TEXT,
  labsmobile_usuario TEXT,
  labsmobile_token   TEXT,
  activa        INTEGER DEFAULT 1,
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);


-- ─────────────────────────────────────────────────────────────
--  VOCES DE ELEVENLABS (guardadas, elegibles por envío)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voces_elevenlabs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,       -- "Voz Cajasan", "Voz institucional", etc.
  voice_id      TEXT NOT NULL,       -- el Voice ID real de ElevenLabs
  descripcion   TEXT,
  activa        INTEGER DEFAULT 1,
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);