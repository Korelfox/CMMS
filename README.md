# CMMS Flota · Proyecto de Producción

Sistema de Gestión de Mantenimiento multi-tenant para flotas pesqueras.
Frontend en **Vite + React**, backend en **Supabase** (PostgreSQL + Auth + RLS).

---

## Estado actual (Fase 1 — en construcción)

✅ Esquema de base de datos multi-tenant + seguridad RLS/RBAC (`01_schema_cmms_multitenant.sql`)
✅ Capa de conexión a Supabase
✅ Autenticación (login / registro / sesión persistente)
✅ Carga de perfil (empresa + rol) y control de acceso
✅ Shell de la aplicación con navegación
⏳ Conexión de los módulos a la base de datos (siguiente paso)
⏳ Sincronización offline (PWA)

---

## Requisitos

- Node.js 18 o superior
- Una cuenta gratuita en [supabase.com](https://supabase.com)

## Puesta en marcha

### 1. Crear el proyecto en Supabase
1. Entra a supabase.com y crea un proyecto nuevo.
2. Ve a **SQL Editor** y ejecuta el contenido de `01_schema_cmms_multitenant.sql` (una vez).
3. Ve a **Project Settings > API** y copia la **URL** y la **anon key**.

### 2. Configurar el frontend
```bash
cd cmms-app
npm install
cp .env.example .env.local
```
Edita `.env.local` y pega tus claves:
```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Crear tu primera empresa y usuario
1. En Supabase, **Authentication > Users > Add user** (o regístrate desde la app).
2. En el **SQL Editor**, ejecuta el bloque de ONBOARDING que está al final de
   `01_schema_cmms_multitenant.sql` (reemplaza tu email). Esto crea la empresa
   y te asigna como `admin_empresa`.

### 4. Levantar la aplicación
```bash
npm run dev
```
Abre http://localhost:5173 e ingresa con tu correo y contraseña.

---

## Estructura del proyecto

```
cmms-app/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
└── src/
    ├── main.jsx              # Punto de entrada (envuelve en AuthProvider)
    ├── App.jsx               # Control de acceso (login / onboarding / app)
    ├── theme.js              # Paleta, roles, helpers de formato
    ├── ui.jsx                # Primitivas de interfaz (Card, Pill, etc.)
    ├── lib/
    │   ├── supabase.js       # Cliente Supabase
    │   ├── auth.jsx          # Contexto de autenticación (sesión + perfil)
    │   └── db.js             # Capa de acceso a datos (CRUD tenant-aware)
    └── components/
        ├── Login.jsx         # Pantalla de acceso / registro
        └── AppShell.jsx      # Shell con navegación y datos de sesión
```

## Seguridad

- El aislamiento entre empresas lo garantiza **Row Level Security** en la base de
  datos, no el frontend. Aunque la app tuviera un bug, el servidor nunca devuelve
  datos de otra empresa.
- La `anon key` es segura para el frontend: sin una sesión válida y sin pasar las
  políticas RLS, no entrega datos.
- Nunca expongas la `service_role key` en el frontend.

## Despliegue (cuando esté listo)

```bash
npm run build      # genera /dist
```
Sube `/dist` a Vercel o Netlify, y configura las mismas variables de entorno.
