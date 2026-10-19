# Despliegue automático desde GitHub Actions

Al integrar una PR en `main`, Actions despliega el CRM en VPS ESC. El workflow también admite ejecución manual en `main` para comprobar el acceso. Se utiliza el secreto existente `SSH_PRIVATE_KEY` y la huella del servidor verificada desde la conexión administrativa.

## Acceso del servidor

El historial contiene 42 ejecuciones marcadas como satisfactorias entre marzo y abril de 2026. La última corresponde al 6 de abril, ejecución `24049194474`. El workflow conectaba a `37.27.41.177:22` por SSH y ejecutaba Git y Docker Compose.

El workflow no cambió entre ese commit y el del 4 de octubre. Los registros disponibles del 2 y 4 de octubre muestran que la conexión al SSH público agotó el tiempo de espera, antes de autenticar. El servidor ahora escucha exclusivamente en `100.72.62.103:22` y UFW permite SSH únicamente por Tailscale.

El 19 de octubre de 2026 se restableció la escucha SSH en la IPv4 pública y su regla de firewall, conservando el acceso privado. La conexión pública exige clave pública, permite únicamente root y desactiva contraseñas y reenvíos. No requiere alta OIDC ni nuevos identificadores de Tailscale.

La configuración se validó mediante `sshd -t` y consultas `sshd -T` para ambas direcciones. Se comprobaron nuevas conexiones autenticadas por la IP pública y por Tailscale. La copia anterior y el script de reversión se guardan fuera del repositorio, en `/root/maintenance/20261019-crm-actions-public-ssh/` de VPS ESC. El temporizador de recuperación se canceló después de verificar ambos accesos.

## Activación

Los cambios posteriores de red deben conservar el acceso por Tailscale, las copias y una vía de reversión. La intervención solo añadió la escucha SSH y la regla TCP 22 de IPv4 públicas. Antes de usar el script de reversión, revisar cualquier cambio posterior de SSH o UFW: restaura la configuración guardada durante esta intervención.

El workflow se ejecuta al actualizar `main` y también admite ejecución manual desde Actions → Deploy to server → Run workflow, seleccionando `main`. Usa el secreto SSH ya existente. Comprobar el resultado de Actions, el commit activo, la salud de los contenedores y la respuesta de la web.

## Comportamiento del workflow

Exige árbol limpio, actualiza `main` mediante avance lineal y serializa despliegues. Omite reconstrucción y reinicios cuando solo cambian documentación o el workflow. Si cambia la aplicación, construye antes de actualizar los contenedores y detiene el proceso ante un error de construcción. La comprobación final exige HTTP 200 de la interfaz y la API y HTTP 401 del endpoint de conversaciones sin sesión.

## Evidencia

- [Última ejecución histórica satisfactoria](https://github.com/Fmvictor/crm_v2/actions/runs/24049194474).
- [Fallo del 2 de octubre](https://github.com/Fmvictor/crm_v2/actions/runs/37034237728).
- [Fallo del 4 de octubre](https://github.com/Fmvictor/crm_v2/actions/runs/37203175460).
