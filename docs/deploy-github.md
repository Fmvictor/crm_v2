# Despliegue automático desde GitHub Actions

Al integrar una PR en `main`, Actions despliega el CRM en VPS ESC. El workflow también admite ejecución manual en `main` para comprobar el acceso. Se utiliza el secreto existente `SSH_PRIVATE_KEY` y la huella del servidor verificada desde la conexión administrativa.

## Acceso del servidor

El historial contiene 42 ejecuciones marcadas como satisfactorias entre marzo y abril de 2026. La última corresponde al 6 de abril, ejecución `24049194474`. El workflow conectaba a `37.27.41.177:22` por SSH y ejecutaba Git y Docker Compose.

El workflow no cambió entre ese commit y el del 4 de octubre. Los registros disponibles del 2 y 4 de octubre muestran que la conexión al SSH público agotó el tiempo de espera, antes de autenticar. El servidor ahora escucha exclusivamente en `100.72.62.103:22` y UFW permite SSH únicamente por Tailscale.

Para recuperar el mecanismo anterior hay que habilitar de nuevo la escucha SSH pública y su regla de firewall, conservando el acceso privado. La propuesta preparada exige clave pública, permite únicamente root y desactiva contraseñas y reenvíos en la conexión pública. No requiere alta OIDC ni nuevos identificadores de Tailscale.

La configuración candidata se validó mediante `sshd -t` y consultas `sshd -T` para ambas direcciones. No se ha aplicado ni abierto el puerto público. Se guarda fuera del repositorio, en `/root/maintenance/20261019-crm-actions-public-ssh/` de VPS ESC.

## Activación

Antes de aplicar el cambio de red, confirmar que se quiere restablecer el acceso SSH público. Guardar copia de la configuración SSH y de UFW y mantener una sesión de recuperación por Tailscale. Aplicar únicamente la escucha pública y la regla TCP 22 de IPv4, manteniendo el resto de reglas; validar sintaxis y acceso privado durante la operación y preparar reversión.

Después, integrar la PR y comprobar una ejecución real de Actions. El secreto SSH existente no se puede leer desde GitHub: su autenticación se confirmará con esa ejecución. Comprobar commit activo, salud de los contenedores y respuesta de la web. Mantener el trabajo pendiente hasta completar esa prueba.

## Comportamiento del workflow

Exige árbol limpio, actualiza `main` mediante avance lineal y serializa despliegues. Omite reconstrucción y reinicios cuando solo cambian documentación o el workflow. Si cambia la aplicación, construye antes de actualizar los contenedores y detiene el proceso ante un error de construcción.

## Evidencia

- [Última ejecución histórica satisfactoria](https://github.com/Fmvictor/crm_v2/actions/runs/24049194474).
- [Fallo del 2 de octubre](https://github.com/Fmvictor/crm_v2/actions/runs/37034237728).
- [Fallo del 4 de octubre](https://github.com/Fmvictor/crm_v2/actions/runs/37203175460).
