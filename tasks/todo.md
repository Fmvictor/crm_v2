# Tareas

- [x] S1. Verificar firma del webhook e impedir duplicados por ID de Meta. Prueba: entrega repetida y firma inválida.
- [x] S2. Registrar origen humano/bot y estado de conversación. Prueba: pausa del agente durante generación.
- [x] S3. Consultar la web de EMEB en directo para cursos. Prueba: respuesta con URL y derivación cuando falte dato.
- [x] S4. Añadir proveedor de modelo y reglas de derivación. Prueba: caso ordinario, delicado y fallo del modelo.
- [x] S5. Persistir instrucciones y memoria por contacto con revisión humana. Validado en pruebas unitarias; falta comprobar con una base de datos real.
- [x] S6. Añadir controles a la interfaz y ejecutar compilaciones y pruebas unitarias.

## Punto de control

- [ ] Subir la rama de integración y abrir una solicitud de cambios. La rama parte de `b74c8c2` e incluye la reestructuración local como primer commit.
- [ ] Validar manualmente en un entorno de prueba antes de activar envíos automáticos.
