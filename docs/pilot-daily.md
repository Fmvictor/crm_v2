# Piloto para uso diario

22 de octubre de 2026. Audiencia actual: sólo el número interno de avisos, conservado en el almacén privado del servidor. Responsable: Víctor, lunes a viernes de 08:00 a 20:00, Europe/Madrid.

## Consumo y parada

El administrador ve llamadas, tokens, coste estimado, reservas y saldo en Pipeline. El límite aprobado es **100 €/mes**, por mes natural de Madrid. Se reserva consumo antes de generar; si no cabe la reserva, se pausa el bot. Aumentar el límite o cambiar de mes no lo reactiva por sí solo. La estimación corresponde a esta aplicación desde su activación; no incluye impuestos, WhatsApp ni otros sistemas. Las tarifas y el cambio deben revisarse antes del 20-11-2026. Una petición humana resuelta por reglas puede no consumir una llamada de IA.

## Cerrar y volver a atender

- «Cerrar panel» sólo oculta el panel lateral.
- «Cerrar conversación» conserva mensajes y etapa comercial, pone el modo humano y cancela seguimientos. Requiere haber marcado atendida la atención pendiente. Si entra un mensaje o cambia el modo desde otra pantalla, la versión antigua no puede cerrar: se recarga y se revisa.
- La vista «Abiertas y pendientes» conserva visibles también las atenciones pendientes de una conversación cerrada (por ejemplo, un fallo de entrega recibido después del cierre).
- El selector «Conversaciones → Cerradas» permite consultar el historial y reabrir.
- «Reabrir para atención humana» mantiene la IA inactiva y conserva las bajas. Un mensaje nuevo recibido en una conversación cerrada también la reabre para atención humana y crea una atención pendiente, sin contestación automática.
- Un administrador debe pulsar expresamente «Activar IA». No se reproduce el mensaje anterior: sólo se responde a un mensaje nuevo recibido después de activar. Marcar atendida, responder manualmente, mover una tarjeta o reabrir no activan la IA.
- No se permite responder desde una conversación cerrada ni enviar a una baja. El texto manual necesita ventana de 24 horas; fuera de ella se espera una nueva consulta o se utiliza una plantilla aprobada cuando proceda.
- Cierres, reaperturas y cambios manuales de modo quedan atribuidos en el historial. Los cierres y los envíos usan el bloqueo de la conversación para evitar carreras.

## Prueba real de aceptación

Sin simular webhooks ni sustituir acciones del participante:

1. Desde el número interno, enviar una consulta comercial cuya respuesta esté en los documentos publicados. Verificar respuesta en el teléfono, entrega/historial, fuentes y versión, y aumento del consumo si hubo llamada de IA.
2. Enviar «Quiero hablar con Víctor». Verificar modo humano, atención pendiente, aviso al lead y aviso al responsable. El destinatario de ambos avisos puede coincidir durante este piloto.
3. Desde CRM, responder manualmente y marcar la atención atendida. Verificar atribución de agente, entrega y que la IA continúa detenida.
4. Cerrar la conversación. Verificar filtro de cerradas, historial y ausencia de seguimientos.
5. Reabrir para atención humana y activar IA voluntariamente como administrador. Verificar que no se envía nada al activar. Enviar una consulta nueva desde WhatsApp y comprobar que sólo esa consulta obtiene respuesta.
6. Registrar resultado, errores y estado final elegido por Víctor. No marcar el recorrido completo si falta una de estas evidencias.

## Conservación: decisión de 180 días

**Decisión de Víctor del 22-10-2026:** revisar la eliminación de conversaciones comerciales cerradas, sin matrícula y sin nuevas interacciones tras **180 días**. Es el plazo operativo elegido; no se presenta como un plazo legal universal. La AEPD y el RGPD requieren justificar la conservación por su finalidad y limitarla al tiempo necesario: [principios de la AEPD](https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/principios), [RGPD, artículo 5.1.e](https://eur-lex.europa.eu/legal-content/ES/ALL/?uri=CELEX%3A32016R0679).

**Estado técnico:** política definida; no hay borrado automático ni tarea programada por este cambio. Antes de implementarlo:

- Calcular el plazo desde la última interacción o el último cierre, el más reciente. Excluir atención pendiente, conversación abierta, matrícula, reclamación, ejercicio de derechos o conservación específicamente justificada. Revisar las excepciones y su fecha límite con el responsable.
- Preparar primero un informe de candidatos con recuentos y motivos, revisable por Víctor. Cerrar no equivale a borrar, ni marca el lead como perdido.
- Abarcar mensajes, interacciones y sus notas, resúmenes, payloads de envíos, motivos de atención, ejemplos pendientes o aprobados que identifiquen a la persona y referencias asociadas. Evitar datos personales en informes de calidad.
- Mantener aparte la información mínima necesaria para respetar las bajas, con acceso restringido y revisión de su necesidad. El borrado no autoriza un nuevo contacto ni una reactivación.
- Definir el tratamiento de copias de seguridad, restauraciones y registros externos. El plazo de 180 días no elimina por sí mismo copias antiguas: deben tener una política compatible y un procedimiento que reaplique las supresiones al restaurar.
- Separar la documentación contractual/contable en sus sistemas y finalidades correspondientes. No usar este plazo para borrar facturas u otras obligaciones de conservación.

## Criterios propuestos de calidad y ampliación

Primero completar la prueba real anterior. Después, proponer una primera tanda de **una o dos personas que acepten participar**, identificadas por Víctor. Sus números se cotejan desde el CRM o un canal privado y no se publican en documentación ni Git. Todavía no se ha autorizado ningún número adicional; se mantiene la lista actual.

Antes de activar esa tanda, verificar que la información para su consulta está publicada y vigente, que el aviso de atención llega a Víctor y que la pausa global está accesible. Revisar manualmente sus primeras 10 conversaciones. Para ampliar de nuevo, evaluar al menos 20 conversaciones o casos representativos, anotando fecha, versión y resultado sin transcribir datos personales:

| Criterio | Umbral propuesto |
| --- | --- |
| Datos comerciales respaldados por fuentes publicadas, respuesta útil e idioma adecuado | Al menos 95 % de los casos revisados |
| Petición humana, falta de evidencia y conflictos de documentos | 100 % derivados correctamente |
| Bajas, toma humana, cierre, pausa global y presupuesto | 100 % respetados |
| Mensajes duplicados o reenvío automático tras un resultado incierto | 0 |
| Matriculaciones/cobros ejecutados o confirmaciones comerciales inventadas | 0 |
| Mensajes y uso de IA con atribución, versión y consumo trazables | 100 % cuando corresponde |

Cualquier fallo de baja, consentimiento, control humano, duplicado o dato comercial inventado detiene la ampliación y pasa a revisión. Un aviso aceptado por Meta no se declara entregado hasta recibir la confirmación. No se promete atención fuera del horario aprobado. Estos criterios son una propuesta de aceptación del piloto, no una monitorización ya programada.
