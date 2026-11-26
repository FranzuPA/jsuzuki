# JSuzuki Control

Sistema de finanzas personales: ingresos, gastos, planificación mensual y anual,
deudas, ahorros, patrimonio, diez informes exportables, avisos y una integración
de solo lectura con Mercado Pago Brasil.

Es una aplicación web que además se instala como aplicación en el celular (PWA).
Funciona en español y en portugués de Brasil, con real (R$) por defecto y la
moneda cambiable desde la configuración.

---

## Qué hace

| Pantalla | Qué resuelve |
| --- | --- |
| **Panel** | Nueve indicadores del mes, seis gráficos y un resumen escrito de tu situación. |
| **Ingresos / Gastos** | Carga rápida de movimientos, 22 categorías iniciales editables, búsqueda y filtros. |
| **Planificación** | Presupuesto por categoría y reparto automático del salario en porcentajes que elegís. |
| **Plan anual** | Los doce meses de un vistazo y un calendario financiero con lo que vence. |
| **Deudas** | Deudas con cuotas, pagos, y simuladores de bola de nieve y avalancha. |
| **Ahorros** | Objetivos con aportes. Un aporte **nunca** se cuenta como gasto de consumo. |
| **Patrimonio** | Bienes, deudas y valuaciones en el tiempo. |
| **Informes** | Diez informes (`general`, `categories`, `savings`, `debts`, `budget`, `networth`, `monthly`, `annual`, `recurring`, `projection`) por día, semana, mes, trimestre, semestre, año o rango libre, con exportación a PDF, XLSX y CSV. |
| **Financial Insights** | Conclusiones escritas sobre tus números, con las proyecciones siempre marcadas como tales. |
| **Herramientas** | Calculadora financiera, simuladores de escenarios, plantillas de gastos y cierre de mes. |
| **Importar** | Extractos en CSV o XLSX, con vista previa fila por fila y control de duplicados. |
| **Mercado Pago** | Conexión de solo lectura. Ver más abajo. |
| **Configuración** | Idioma, moneda, formato de fecha, zona horaria, avisos, copias de seguridad e historial de cambios. |

---

## Requisitos

- Node.js 20.19 o superior.
- PostgreSQL 14 o superior.
- npm.

---

## Instalación

```bash
git clone https://github.com/OWNER/jsuzuki-control.git
cd jsuzuki-control
npm install
cp .env.example .env
```

### 1. Configurar el entorno

Abrí `.env` y completá al menos estas tres variables:

| Variable | Obligatoria | Para qué sirve |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL que usa la aplicación. |
| `DIRECT_URL` | Sí | Conexión directa que usan las migraciones. En local puede ser igual a `DATABASE_URL`. |
| `AUTH_SECRET` | Sí | Firma de las cookies de sesión. Mínimo 32 caracteres. |
| `ENCRYPTION_KEY` | Sí | Cifra los tokens de Mercado Pago (AES-256-GCM). Mínimo 32 caracteres. |
| `APP_URL` | No | URL pública. Por defecto `http://localhost:3000`. |
| `ALLOWED_SIGNUP_EMAIL` | No | Si la completás, solo ese correo puede registrarse. Es la forma de cerrar el registro en una instalación personal. |
| `MERCADOPAGO_CLIENT_ID` | No | Credenciales de la aplicación de Mercado Pago. |
| `MERCADOPAGO_CLIENT_SECRET` | No | Ídem. |
| `MERCADOPAGO_REDIRECT_URI` | No | URL de vuelta del OAuth. Vacía usa `{APP_URL}/api/mercadopago/callback`. |
| `CRON_SECRET` | No | Protege la tarea diaria. Sin este valor el endpoint no responde. |

Los secretos se generan así:

```bash
openssl rand -base64 48
```

**Nunca** pongas estos valores en el repositorio. `.env` está en `.gitignore`.

### 2. Preparar la base

```bash
npm run db:deploy    # aplica las migraciones
npm run db:seed      # datos iniciales (opcional)
```

`db:seed` crea una cuenta con las categorías, las cuentas, el reparto del salario
y los importes de ejemplo del pedido: ingreso de R$ 4.500, alquiler de R$ 1.800,
alimentación de R$ 1.000, otros de R$ 300 y un compromiso extraordinario de
R$ 600 que es de **un solo mes**, no un gasto que se repite. Todo es editable y
borrable.

```bash
# Con tus propios datos
SEED_EMAIL=vos@ejemplo.com SEED_PASSWORD="UnaClaveLarga123" npm run db:seed
# Sin movimientos de ejemplo
SEED_SAMPLE=no npm run db:seed
```

Correrlo dos veces no duplica nada: si la cuenta ya existe, no toca nada.

También podés saltear el seed y crear tu cuenta desde `/register`: el registro
prepara exactamente lo mismo.

### 3. Levantarla

```bash
npm run dev     # desarrollo, http://localhost:3000
npm run build   # compilación de producción
npm run start   # servir lo compilado
```

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Genera el cliente de Prisma y compila. |
| `npm run start` | Sirve la compilación. |
| `npm run typecheck` | TypeScript sin emitir. Tiene que dar cero errores. |
| `npm run lint` | ESLint con la configuración de Next. |
| `npm test` | Las pruebas automatizadas. |
| `npm run db:migrate` | Crea y aplica una migración en desarrollo. |
| `npm run db:deploy` | Aplica las migraciones en producción. |
| `npm run db:seed` | Datos iniciales. |
| `npm run db:studio` | Explorador visual de la base. |

---

## Pruebas

```bash
npm test
```

151 pruebas sobre lo que, si se rompe, da un número equivocado sin avisar:

- `money` y los redondeos a dos decimales.
- `finance-core`: los totales del mes, con los ahorros contados como ahorro y no
  como gasto de consumo.
- `debts`: cuotas, intereses, bola de nieve y avalancha.
- `recurring`: que una recurrencia no se materialice dos veces.
- `reports-periods`: los rangos de los informes.
- `import-parse`: `1.234,56` contra `1,234.56`, que leído al revés cambia el
  importe por mil.
- `tools-calculators`: interés compuesto, cuota francesa, objetivos y escenarios.
- `mercadopago-report`: la lectura del reporte de Mercado Pago y su control de
  duplicados.
- `dates`: meses, rangos y zonas horarias.

---

## Cómo está hecho

```
src/
  app/            Rutas de Next (App Router). (app)/ son las pantallas, api/ el backend.
  components/     Componentes de React. ui/ son los ladrillos básicos.
  lib/
    finance/      El núcleo del cálculo: totales, resumen del mes, proyecciones.
    reports/      Los diez informes y su exportación.
    mercadopago/  OAuth, lectura del reporte y conciliación.
    i18n/          Diccionario portugués / español y traducción de los errores de la API.
    money.ts      Todo el dinero pasa por acá.
prisma/           Esquema, migraciones y datos iniciales.
tests/            Pruebas de los cálculos.
```

**Next.js 16 + React 19 + TypeScript + Tailwind 4 + Recharts + Prisma + PostgreSQL.**

Tres decisiones que conviene conocer antes de tocar el código:

1. **El dinero nunca es un `number`.** En la base es `Decimal(14,2)`, en el
   código es `decimal.js` y entre el cliente y el servidor viaja como texto con
   dos decimales. Un `float` acá significa centavos perdidos.
2. **Un movimiento no se cuenta dos veces.** La base tiene un único
   `(userId, externalId)` y los procesos que cargan movimientos (importación,
   recurrencias, plantillas, Mercado Pago) son idempotentes: correrlos de nuevo
   no duplica nada.
3. **Un ahorro no es un gasto de consumo.** Un aporte a un objetivo y un pago de
   deuda son gastos para el saldo, pero se cuentan aparte en todos los totales,
   los informes y los gráficos.

### Los dos idiomas

El idioma por defecto es el portugués de Brasil: es el de las pantallas de
antes de entrar, el de los títulos de cada página y el de los datos iniciales
de una cuenta nueva. El español está completo y se elige en Configuración.

La pantalla se traduce con el diccionario de `src/lib/i18n/dictionary.ts`, que
tiene una clave por texto. Para agregar claves hay un script:

```bash
node scripts/add-i18n.mjs claves.json   # {"una.clave": {"es": "...", "pt": "..."}}
```

Dos cosas que no salen del diccionario:

- **Los errores de la API** se escriben en español en el servidor, que no sabe
  en qué idioma está mirando la pantalla quien hizo el pedido. Se traducen al
  recibir la respuesta, con la tabla de `src/lib/i18n/server-messages.ts`. Un
  mensaje nuevo que no esté en esa tabla se muestra en español: cuando agregues
  uno, agregalo también ahí.
- **Los nombres de las categorías, las cuentas y el reparto del salario** se
  guardan como texto en la base, en el idioma que tenía la cuenta al
  registrarse. Cambiar el idioma en Configuración los traduce con
  `localizeDefaults` (`src/lib/defaults.ts`), que solo toca los que siguen
  siendo los iniciales: lo que renombró el usuario no se cambia.

---

## Mercado Pago Brasil

La integración es **de solo consulta**. No existe en el código ninguna llamada
que mueva, pague o transfiera dinero.

- La contraseña de Mercado Pago no se pide ni se guarda: se escribe en el sitio
  de Mercado Pago. La aplicación recibe un permiso y lo guarda cifrado con
  AES-256-GCM.
- Se usan únicamente endpoints documentados por Mercado Pago. No hay scraping.

### Qué expone realmente una cuenta personal

El único listado de movimientos que la documentación oficial expone es el
**reporte de liberaciones** (*relatório de liberações*): se pide por API, Mercado
Pago lo genera aparte y después se descarga como CSV. Una cuenta sin actividad de
cobro puede recibir reportes vacíos, y las cuentas de prueba siempre los reciben
vacíos.

Por eso la pantalla acepta **las dos vías**: la sincronización por API y el mismo
reporte descargado a mano del panel de Mercado Pago. Las dos pasan por el mismo
lector y el mismo control de duplicados.

### Configurarla

1. Creá una aplicación en <https://www.mercadopago.com.br/developers/panel/app>.
2. Cargá como *Redirect URI* exactamente `{APP_URL}/api/mercadopago/callback`.
3. Poné `MERCADOPAGO_CLIENT_ID` y `MERCADOPAGO_CLIENT_SECRET` en el entorno.
4. Entrá a `/mercadopago` y tocá **Conectar mi cuenta**.

### Qué hace con lo que trae

1. Lo que ya tiene el mismo identificador de Mercado Pago no se vuelve a cargar.
2. Si ya habías anotado ese movimiento a mano, no se crea otro: se marca el que
   estaba como conciliado y se le pasa el identificador, así la próxima
   sincronización lo saltea sola.
3. Los movimientos internos, como un retiro al banco, no se cargan: esa plata ya
   está contada una vez.
4. Lo que entra queda **a la espera de revisión**, marcado como importado, hasta
   que lo confirmes.

---

## Tarea diaria

`GET /api/cron` aplica las recurrencias vencidas, genera los avisos del día y
sincroniza Mercado Pago. Es idempotente.

Se protege con `CRON_SECRET` y se llama con `Authorization: Bearer <CRON_SECRET>`.
Sin esa variable el endpoint responde 503: es preferible que la tarea no corra a
que quede una puerta abierta. `vercel.json` ya la programa a las 9:00 UTC.

---

## Producción

Está preparada para Vercel con PostgreSQL administrado (Supabase, Neon o
equivalente).

1. Conectá el repositorio al proyecto de Vercel.
2. Cargá las variables de entorno de la tabla de más arriba. Con Supabase:
   - `DATABASE_URL`: el pooler en modo **transaction** (puerto `6543`) con
     `?pgbouncer=true&connection_limit=1` al final. Si usás el modo session
     (puerto `5432`), las funciones serverless agotan las 15 conexiones del
     pool y la aplicación falla con `EMAXCONNSESSION`.
   - `DIRECT_URL`: el pooler en modo session o la conexión directa (puerto
     `5432`). La usan las migraciones.
3. Aplicá las migraciones contra la base de producción:
   ```bash
   DATABASE_URL="<la de producción>" DIRECT_URL="<la directa>" npm run db:deploy
   ```
4. Desplegá. El `build` genera el cliente de Prisma solo.

Antes de publicar conviene:

- Poner `ALLOWED_SIGNUP_EMAIL` con tu correo, para que nadie más pueda
  registrarse.
- Guardar `AUTH_SECRET` y `ENCRYPTION_KEY` en un lugar seguro. Si cambiás
  `ENCRYPTION_KEY`, los permisos guardados de Mercado Pago dejan de poder leerse
  y hay que volver a conectar la cuenta; la aplicación lo dice con ese mensaje.
- Hacer una copia de seguridad desde **Configuración → Copias de seguridad**.

### Seguridad

- Contraseñas con bcrypt, mínimo 10 caracteres y control de fortaleza.
- Sesiones con token opaco; la base guarda solo su hash SHA-256, así un volcado
  de la base no sirve para hacerse pasar por nadie. Se pueden revocar.
- Toda consulta filtra por el usuario de la sesión.
- Validación con Zod en el servidor, no solo en el formulario.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y
  `Permissions-Policy`, y `X-Powered-By` apagada.
- Tokens de Mercado Pago cifrados con AES-256-GCM.
- Historial de cambios y papelera: nada se borra de forma definitiva sin pasar
  por ahí.

---

## Lo que falta o conviene saber

- `npm run lint` pasa sin errores y deja **14 avisos** de la regla
  `react-hooks/set-state-in-effect`: son diálogos que reinician su formulario al
  abrirse. No son fallas, pero la forma recomendada por React es remontarlos con
  `key`. Quedan a la vista a propósito.
- `npm audit` reporta tres vulnerabilidades altas que vienen del CLI de Prisma
  (`deepmerge-ts`). Se arreglan recién con Prisma 7, que es una migración mayor.
  No afectan a la aplicación en ejecución, solo a la herramienta de línea de
  comandos.
- Las cotizaciones automáticas de moneda no están: la moneda se configura y los
  importes se muestran en ella, pero no hay conversión entre monedas.
- La sincronización de Mercado Pago no pudo probarse contra una cuenta real
  porque requiere credenciales de una aplicación propia. Lo que sí está probado
  de punta a punta es la lectura del reporte y todo el control de duplicados.
