# Mover prospectos entre etapas

En el tablero de escritorio, agentes y administradores pueden arrastrar una tarjeta completa a otra columna, incluso vacía. La columna de destino se resalta y muestra «Soltar en…». Al acercar el ratón al borde del tablero se desplazan las columnas. Escape o soltar fuera de una columna cancela el movimiento.

La tarjeta cambia de columna al confirmar el guardado. Durante la petición se indica «Guardando cambio de etapa…» y se bloquean nuevos movimientos. Si falla, se muestra un aviso y se vuelve a consultar el servidor; se puede reintentar. Soltar en la misma etapa no envía una petición.

El selector de etapa dentro de la conversación sigue disponible para teclado y móvil. El diseño móvil muestra una columna cada vez y no habilita arrastre táctil. Los perfiles de consulta pueden abrir conversaciones, pero no moverlas.

Ambas vías usan `PATCH /api/v1/conversations/:id/stage`, protegido en el servidor, y conservan el historial manual existente. La petición identifica la tarjeta movida aunque otra conversación esté abierta. No cambia el modo de IA ni marca una atención como atendida.

## Comprobación

Desde `apps/frontend/`, ejecutar `npm ci`, `npm run lint` y `npm run build`. Iniciar la interfaz en loopback: `npm run start -- --hostname 127.0.0.1 --port 3312`.

Con Python y Playwright instalados, ejecutar desde la raíz del repositorio:

```bash
python3 apps/frontend/tests/pipeline_drag.py
```

La prueba usa exclusivamente API y prospectos sintéticos, interceptados en el navegador. Rechaza destinos que no sean localhost. Cubre arrastre nativo con ratón, columnas vacías y ocupadas, filtro de atención, cancelación, mismo destino, arrastre externo, fallo y reintento, petición lenta, permisos, selector, historial, recarga y contadores. No comprueba por sí sola la persistencia de la base de datos: simula la API existente, cuyo contrato no cambia.

Variables opcionales: `PIPELINE_TEST_URL` (por defecto `http://127.0.0.1:3312`), `PLAYWRIGHT_BROWSER_PATH` y `PIPELINE_TEST_OUTPUT` (por defecto `/tmp/pipeline-drag-results`). La salida incluye `resultados.json` y capturas para revisión visual.
