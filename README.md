# MendLab — Sistema de Laboratorio Clínico
> Electron + React + Vite + TailwindCSS + SQLite + Supabase

---

## 🚀 Instalación y Ejecución

### Requisitos
- Node.js 18+ 
- npm 9+

### Instalar dependencias
```bash
npm install
```

### Modo desarrollo (web + Electron)
```bash
npm run dev
```

### Solo web (sin Electron)
```bash
npm run dev:web
```

### Compilar instalador .exe (Windows)
```bash
npm run dist
```

---

## 🔑 Acceso por defecto
- **Email:** `admin@mendlab.com`
- **Contraseña:** `admin123`

Cambia estos datos desde la sección **Usuarios** después del primer inicio.

---

## 🏗️ Estructura del Proyecto
```
mendlab/
├── electron/
│   ├── main.js          # Proceso principal Electron + SQLite
│   └── preload.js       # Puente contextual seguro
├── src/
│   ├── pages/           # Páginas de la app
│   ├── components/      # Componentes reutilizables
│   ├── services/        # Lógica de negocio (DB, PDF, Excel)
│   ├── store/           # Estado global (Zustand)
│   └── utils/           # Utilidades
├── resources/           # Iconos para el instalador
└── package.json
```

---

## 👥 Roles y Permisos

| Rol | Descripción |
|-----|-------------|
| **Administrador** | Acceso completo: gestión de usuarios, configuración, todos los módulos |
| **Bioquímico / Tecnólogo** | Ingreso y verificación de resultados, ver órdenes, imprimir reportes |
| **Recepcionista** | Crear/editar pacientes, crear órdenes, ver estado, imprimir reportes |

---

## 🔬 Catálogo de Exámenes Incluido

- **Hematología:** Hemograma Completo (12 parámetros)
- **Química Sanguínea:** Glicemia, Urea, Creatinina, TGO, TGP, Bilirrubinas, Ácido Úrico, Colesterol (Total/HDL/LDL), Triglicéridos, Proteínas, Albúmina, Proteinuria 24h, Creatinuria 24h
- **Orina:** Examen General de Orina EGO (15 parámetros)
- **Citología:** PAP (Papanicolaou)
- **Microbiología:** Secreción vaginal, Examen micológico, Tinción Gram
- **Coproparasitología:** Examen de heces
- **Serología:** FR, PCR, H. pylori, Grupo sanguíneo/Rh, HBsAg, VIH, Test embarazo

---

## 📄 Reportes PDF
- Encabezado con nombre del laboratorio (y logo si existe `laboratorio.svg`)
- Código de barras automático por número de orden
- Tabla de resultados con valores referenciales por sexo/edad
- **Resaltado automático** de valores altos (rojo) y bajos (azul)
- Líneas de firma: Director Técnico y Bioquímico responsable
- Pie de página configurable

## 🏷️ Etiquetas de Tubos
- Hojas de etiquetas con código de barras, nombre del paciente, N° orden y fecha
- 2 columnas × 7 filas por página A4
- Compatible con impresora de etiquetas estándar

---

## 🖼️ Logo del Laboratorio
1. Coloca tu logo en formato SVG: `laboratorio.svg`
2. Ubícalo en la carpeta raíz de la aplicación (junto al ejecutable)
3. Aparecerá automáticamente en todos los reportes PDF

---

## ⚙️ Configuración de Supabase (Sincronización)
Para habilitar la sincronización en la nube:
1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Copia tu `SUPABASE_URL` y `SUPABASE_ANON_KEY`
3. Configúralos en `src/services/supabase.js`

---

## 📦 Dependencias Principales
- `electron` + `better-sqlite3` — App de escritorio + DB local
- `react` + `vite` + `tailwindcss` — UI moderna
- `jspdf` + `jspdf-autotable` — Generación de PDF
- `jsbarcode` — Códigos de barras
- `xlsx` — Exportación a Excel
- `zustand` — Estado global
- `@supabase/supabase-js` — Sincronización en la nube
