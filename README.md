# Dashboard de campañas on-site (GA4 → Google Sheets → GitHub Pages)

Dashboard estático (HTML + JS puro, sin build step) que lee los datos que ya
recolecta tu Google Sheets ("GA4 Consolidado") y los muestra en tablas y
gráficos, filtrables por período / marca / tipo de campaña, con comparación
entre dos períodos.

Cómo fluyen los datos:

```
GA4 (17 propiedades) --[Codigo.gs, ya lo tienes andando]--> Google Sheets
Google Sheets --[scripts/fetch_data.py, vía GitHub Actions, 1x al día]--> data/latest.json
data/latest.json --[app.js, en el navegador de quien abre el link]--> dashboard
```

El dashboard nunca llama a Google directamente: siempre lee el archivo
`data/latest.json` que el workflow de GitHub Actions deja en el repo. Eso
significa que el sitio publicado es rápido, no necesita que nadie esté
logueado en nada, y si Google Sheets está lento o caído el dashboard sigue
mostrando el último dato bueno.

## 1. Publicar el sitio (GitHub Pages)

1. Crea un repositorio nuevo en GitHub (puede ser público — GitHub Pages
   gratis lo requiere; el link no queda listado en ningún buscador ni
   promocionado, pero técnicamente cualquiera con el link exacto podría
   abrirlo. Si necesitas restringir el acceso de verdad, GitHub Pages
   necesita un plan pago con repos privados — avísame si llegas a ese
   punto y vemos alternativas).
2. Sube todo el contenido de esta carpeta a la raíz del repo.
3. En el repo: **Settings → Pages → Build and deployment → Source**:
   elige "Deploy from a branch", branch `main`, carpeta `/ (root)`.
4. Espera 1-2 minutos y el sitio queda en
   `https://<tu-usuario>.github.io/<nombre-repo>/`.

## 2. Conectar el robot que trae los datos (GitHub Actions)

El workflow `.github/workflows/update-data.yml` corre todos los días y
actualiza `data/latest.json` leyendo tu Google Sheets con una **cuenta de
servicio** de Google (un "usuario robot", separado de tu cuenta personal,
pensado para automatizaciones).

### 2.1 Crear la cuenta de servicio

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) — puedes
   usar el mismo proyecto que ya creaste para el script de Apps Script
   ("GA4 Reportes Sheets"), o crear uno nuevo.
2. Habilita la **Google Sheets API**: busca "Google Sheets API" en la
   barra de búsqueda de arriba → Habilitar.
3. Ve a **APIs y servicios → Credenciales → Crear credenciales → Cuenta de
   servicio**. Dale un nombre (ej. "dashboard-lector") y créala (no
   necesita roles especiales de proyecto).
4. Entra a la cuenta de servicio recién creada → pestaña **Claves** → **Agregar
   clave → Crear clave nueva → JSON**. Se descarga un archivo `.json` —
   guárdalo, lo vas a necesitar en el paso 2.3. **Trátalo como una
   contraseña: no lo subas al repo ni lo compartas.**
5. Copia el **email** de la cuenta de servicio (dentro del JSON, campo
   `client_email`, se ve algo así:
   `dashboard-lector@ga4-reportes-sheets.iam.gserviceaccount.com`).

### 2.2 Darle acceso de lectura a tu planilla

1. Abre tu Google Sheets (el mismo que llena `Codigo.gs`).
2. Botón **Compartir** → pega el email de la cuenta de servicio → dale
   permiso **Lector** → Enviar (aunque no tenga bandeja de entrada, igual
   queda con acceso).

### 2.3 Cargar los secretos en GitHub

En tu repo: **Settings → Secrets and variables → Actions → New repository
secret**, y crea estos dos:

| Nombre | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Todo el contenido del archivo `.json` que descargaste (ábrelo con un editor de texto y pega TODO, incluidas las llaves `{ }`) |
| `SPREADSHEET_ID` | El ID de tu planilla: es la parte de la URL entre `/d/` y `/edit`, ej. en `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit` el ID es `1AbCdEfGhIjK` |

### 2.4 Probarlo

En tu repo: pestaña **Actions → Actualizar datos del dashboard → Run
workflow** (botón a la derecha) para correrlo manualmente la primera vez,
sin esperar al cron. Si algo falla, el log del paso "Descargar datos desde
Google Sheets" te va a decir por qué (credencial mal pegada, planilla no
compartida, nombre de pestaña distinto, etc). Cuando funcione, va a dejar
`data/latest.json` actualizado y comiteado automáticamente — y el sitio en
GitHub Pages lo va a reflejar en su próxima recarga.

El cron por defecto corre a las **12:00 UTC** (≈ 08:00-09:00 en Chile,
según horario de verano), pensado para correr después del trigger diario
de tu Apps Script (que corre ~06:00 hora Chile). Si cambias
`HORA_TRIGGER` en `Codigo.gs`, ajusta también el `cron` en
`.github/workflows/update-data.yml`.

## 3. Estructura del repo

```
index.html                        página del dashboard
style.css                         estilos (paleta, tablas, tarjetas)
app.js                            toda la lógica: filtros, agregaciones, gráficos
data/latest.json                  snapshot de datos (lo genera el Action; el que
                                   viene ahora es de EJEMPLO — se reemplaza solo)
scripts/fetch_data.py             script que lee Google Sheets y escribe data/latest.json
requirements.txt                  dependencias de scripts/fetch_data.py
.github/workflows/update-data.yml el robot programado
```

## 4. Qué muestra el dashboard

**Resumen general**
- KPIs del período filtrado: ingresos totales, cantidad de campañas
  activas, views, CTR.
- Evolución en el tiempo: ingresos por día e (en un gráfico aparte, para
  no mezclar escalas muy distintas) eventos por día — View / Click / Add
  to cart / Purchase. Cada evento se puede prender/apagar haciendo clic
  en su nombre en la leyenda del gráfico (el eje se reajusta solo a lo
  que quede visible) — útil para ver de cerca eventos con números mucho
  más chicos que View, como Purchase.
- Tabla por marca: cantidad de campañas, ingresos, ingresos por campaña.

**Campañas**
- Ingresos por día, desglosados por tipo de campaña (top 4 + "Otros").
- Tabla por campaña con "Días activo" (cantidad de días distintos con
  datos dentro del período filtrado) y el embudo completo: View → Click
  (CTR) → Add to cart (% que agrega desde quienes hicieron click) →
  Purchase (% que compra desde quienes agregaron al carro) → conversión
  total (Purchase / View) → ingresos. Esto es lo que te deja ver, por
  ejemplo, si una campaña tiene buen CTR pero se cae en "agregar al
  carro" — el problema no es que no llame la atención, es lo que pasa
  después del click. Esta tabla puede tener cientos de filas, así que
  se deja con alto fijo (~10 filas) y scroll interno propio, con el
  encabezado siempre visible.
- Tabla por tipo de campaña: cuántas campañas de ese tipo se han corrido,
  ingresos totales e ingresos promedio por campaña — para comparar, por
  ejemplo, si vale la pena seguir usando cierto tipo de campaña dado lo
  que rinde en promedio, no solo en total (un tipo puede tener ingresos
  altos solo porque se usó muchas veces, no porque cada campaña rinda
  bien).
- Matriz Marca × Tipo de campaña (mapa de calor): ingresos promedio por
  campaña, cruzando marca y tipo — para ver de un vistazo qué tipo
  funciona mejor en cada marca (y dónde probablemente no vale la pena
  seguir invirtiendo tiempo del equipo).

**Filtros** (arriba, afectan todo el dashboard): período (por defecto,
mes en curso), marca, tipo de campaña, y un checkbox para comparar contra
otro período — al activarlo, el gráfico de ingresos superpone ambos
períodos alineados por "día 1, día 2..." (no por fecha calendario, para
poder comparar peras con peras aunque los meses tengan distinto largo), y
las tablas agregan columnas del período anterior + variación %.

**Posición (#)**: las tablas de Marca, Campaña y Tipo de campaña traen
una primera columna "#" con el número de fila tal como se ve en
pantalla — si ordenas por otra columna, se recalcula sola.

**Ordenar tablas**: en cualquier tabla (incluidas las que aparecen al
hacer "Ver como tabla" en un gráfico), un clic en el nombre de una
columna la ordena de mayor a menor según esa columna; un segundo clic
en la misma columna la ordena de menor a mayor. El orden elegido se
mantiene aunque cambies los filtros, hasta que elijas otra columna. La
matriz Marca × Tipo (mapa de calor) no tiene esta función.

### Decisiones de alcance (para que no sean sorpresa)

- La comparación de períodos hoy solo se ve superpuesta en el **gráfico
  de ingresos** de Resumen general (no en el de eventos ni en el de tipos
  de campaña) — evita saturar el gráfico con demasiadas líneas. Las
  tablas sí muestran comparación en varias columnas.
- En "Resumen por campaña" y "Resumen por tipo de campaña", la
  comparación solo agrega columnas para **Ingresos** (no para View/Click/
  etc.), para que la tabla no se vuelva ilegible de ancha. Si esto no te
  sirve, es un cambio acotado — dímelo.
- "Q campañas" cuenta combinaciones únicas de Marca + nombre de campaña
  (`emarsys_campaign_name`); si dos marcas comparten el mismo nombre de
  campaña por coincidencia, cuentan como 2 campañas distintas (son
  ejecuciones distintas en la práctica).

## 5. Personalizar

- **Moneda**: en `app.js`, al inicio, `CONFIG.currency` (por defecto
  `'CLP'`).
- **Cuántos tipos de campaña se grafican en el tiempo**:
  `CONFIG.topNTipos` (por defecto 4).
- **Colores**: variables CSS al inicio de `style.css` (`--series-1` en
  adelante). Siguen un orden fijo pensado para que sean distinguibles
  incluso con daltonismo — si agregas más series, revisa
  `references/color-formula.md` de la skill `dataviz` antes de inventar
  un color nuevo.
- **Nombre de la pestaña / hoja que se lee**: variable `SHEET_NAME` en
  `scripts/fetch_data.py` (o el secreto de entorno `SHEET_NAME` en el
  workflow, si prefieres no tocar el código).
- **Nombres amigables de "Tipo de campaña"**: objeto `TIPO_LABELS` al
  inicio de `app.js` — mapea el `emarsys_campaign_id` tal como viene de
  la hoja (ej. `pers-banner-plp`) a un nombre más legible (ej.
  `Banner PLP`). Un tipo que no esté en la lista se muestra tal cual
  viene de la hoja (no desaparece), así que puedes ir agregando alias
  de a poco.
- **Pantalla de bienvenida ("login")**: al entrar al dashboard aparece
  un overlay pidiendo un mail; si coincide con la lista, entra y el
  título cambia a "Bienvenido de vuelta, {nombre}...". Ese navegador
  queda recordado (no vuelve a preguntar), hasta que se haga clic en
  "Cambiar de usuario". La lista de mails/nombres es el objeto `USERS`
  al inicio de `app.js` — agrega o quita pares `'mail': 'Nombre'` ahí.
  **Importante**: esto es solo cosmético/de personalización, no es
  seguridad real — `app.js` es un archivo público y cualquiera puede
  ver la lista completa de mails con las devtools del navegador, o
  saltarse el overlay a mano. No lo uses para "proteger" datos
  sensibles; para eso el dashboard necesitaría un repo privado y un
  control de acceso de verdad (ver nota del punto 1).

## 6. Probar en tu computador antes de publicar

No necesitas Node ni build tools. Desde esta carpeta:

```bash
python3 -m http.server 8000
```

y abre `http://localhost:8000` — va a leer el `data/latest.json` de
ejemplo que viene incluido (datos inventados, para que veas el dashboard
funcionando antes de conectar tu planilla real).
