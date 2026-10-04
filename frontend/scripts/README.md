# Scripts

## `update-history-csv.mjs` — actualización del histórico

Actualiza los CSV históricos de **Nuevos Tiempos Reventados** con los resultados más recientes publicados por la JPS:

- `data/history/YYYY.csv` (archivo del año del sorteo, p. ej. `2026.csv`)
- `data/history/all_data.csv`

### Cómo funciona

1. Descarga la página oficial de resultados: <https://www.jps.go.cr/resultados/nuevos-tiempos-reventados> (3 reintentos, timeout de 20 s).
2. La página (Next.js) incrusta ~60 días de sorteos como JSON en el payload RSC (`self.__next_f.push(...)`). El script lo decodifica y extrae cada sorteo — no requiere navegador ni dependencias, solo Node.
3. Mapea los campos de la JPS al formato del CSV:

   | JPS             | CSV      |
   |-----------------|----------|
   | `fecha`         | `date`   |
   | `hora` 1 / 2 / 3 | `period` `MEDIODÍA` / `TARDE` / `NOCHE` |
   | `numero`        | `n`      |
   | `in_reventado`  | `rev` (`R` si es 1, `-` si es 0) |
   | `meganNumero`   | `mr`     |

4. Inserta en cada archivo solo los sorteos que faltan (clave `fecha|periodo`) y lo reescribe ordenado por fecha y periodo.

### Reglas

- **Nunca modifica filas existentes.** Si la JPS reporta un valor distinto al del CSV, lo avisa con `!` en la salida pero no lo cambia.
- **Idempotente:** correrlo varias veces no duplica filas.
- Conserva el formato actual: encabezado `date,period,n,rev,mr`, saltos de línea CRLF, `MEDIODÍA` con tilde.
- Si el año no tiene archivo (p. ej. `2027.csv`), lo crea.
- Escritura atómica (archivo temporal + rename): un corte a mitad no deja archivos corruptos.
- Si la página no responde, cambia de formato o devuelve un challenge de Cloudflare, termina con código de salida `1` sin tocar los archivos.
- Como la JPS muestra ~60 días, se pone al día solo aunque no haya corrido durante varias semanas.

### Ejecución manual

**Con npm** (desde `frontend/`):

```bash
cd "/Users/jpablofdez/Global/AI Coder/predictions/frontend"
npm run history:update
```

Ver qué agregaría sin modificar nada:

```bash
npm run history:update -- --dry-run
```

**Con Node directamente** (desde cualquier carpeta):

```bash
node "/Users/jpablofdez/Global/AI Coder/predictions/frontend/scripts/update-history-csv.mjs"
```

**Disparando la tarea programada** (la salida va al log, no a la pantalla):

```bash
launchctl kickstart gui/$(id -u)/com.jpablofdez.prediction.history-update
tail -5 ~/Library/Logs/prediction-history-update.log
```

### Opciones

| Opción / variable  | Descripción | Default |
|--------------------|-------------|---------|
| `--dry-run`        | Muestra lo que se agregaría sin escribir | — |
| `--dir <carpeta>`  | Carpeta con los CSV | `../data/history` |
| `HISTORY_CSV_DIR`  | Igual que `--dir`, por variable de entorno | `../data/history` |
| `JPS_RESULTS_URL`  | URL de resultados de la JPS | página oficial |

### Ejemplo de salida

```
[2026-10-03T23:10:00.000Z] JPS: 182 sorteos (2026-08-04 MEDIODÍA → 2026-10-03 TARDE)
  2026.csv: 2 agregados
    + 2026-10-03,MEDIODÍA,19,R,55
    + 2026-10-03,TARDE,57,R,86
  all_data.csv: 2 agregados
    + 2026-10-03,MEDIODÍA,19,R,55
    + 2026-10-03,TARDE,57,R,86
```

### Ejecución automática (launchd, macOS)

Instalado como LaunchAgent; corre todos los días a las **13:30** (después del sorteo de MEDIODÍA) y a las **21:00** (después de NOCHE), hora local (UTC-6, igual que Costa Rica). Si la Mac estaba dormida a esa hora, corre al despertar; si estaba apagada, la siguiente corrida recupera lo faltante.

- Configuración: `~/Library/LaunchAgents/com.jpablofdez.prediction.history-update.plist`
- Log: `~/Library/Logs/prediction-history-update.log`

### Comandos útiles

```bash
# Ver el log
tail -20 ~/Library/Logs/prediction-history-update.log

# Forzar una corrida ahora
launchctl kickstart gui/$(id -u)/com.jpablofdez.prediction.history-update

# Ver el estado de la tarea (último código de salida, etc.)
launchctl print gui/$(id -u)/com.jpablofdez.prediction.history-update | grep -E "state|last exit"

# Desactivar la tarea
launchctl bootout gui/$(id -u)/com.jpablofdez.prediction.history-update

# Reactivarla (o recargarla después de editar el .plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jpablofdez.prediction.history-update.plist
```

> Si se mueve la carpeta del proyecto o cambia la ruta de Node (`which node`, hoy `/usr/local/bin/node`), hay que actualizar las rutas del `.plist` y recargarlo (`bootout` + `bootstrap`).
