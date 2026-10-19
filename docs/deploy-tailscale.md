# Despliegue privado del CRM

GitHub Actions entra temporalmente en Tailscale mediante OIDC y conecta al SSH de VPS ESC en `100.72.62.103:22`. El workflow solo despliega `main`. La identidad temporal se retira al terminar. La autenticación OpenSSH sigue usando el secreto existente `SSH_PRIVATE_KEY`; la huella del servidor está fijada y verificada desde el acceso administrativo.

## Alta en Tailscale

Un administrador debe integrar estas entradas en la política actual, conservando sus reglas existentes:

```json
{
  "tagOwners": {
    "tag:crm-deploy": ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["tag:crm-deploy"],
      "dst": ["100.72.62.103"],
      "ip": ["tcp:22"]
    }
  ],
  "tests": [
    {
      "src": "tag:crm-deploy",
      "accept": ["100.72.62.103:22"],
      "deny": ["100.72.62.103:3000", "100.72.62.103:3001", "100.117.179.73:22"]
    }
  ]
}
```

Es un fragmento que combinar con la política, no un reemplazo completo. Los permisos son acumulativos: comprobar las reglas amplias existentes y las pruebas antes de afirmar que la etiqueta solo accede al SSH de ESC. No se ha inspeccionado ni modificado la política real desde este repositorio.

En **Trust credentials → Credential → OpenID Connect**, registrar:

| Campo | Valor |
| --- | --- |
| Descripción | GitHub CRM deploy |
| Issuer | GitHub / `https://token.actions.githubusercontent.com` |
| Subject | `repo:Fmvictor/crm_v2:ref:refs/heads/main` |
| Scope | `auth_keys`, escritura |
| Tags | `tag:crm-deploy` |

Guardar el Client ID y Audience generados en los secretos de Actions del repositorio como `TS_OAUTH_CLIENT_ID` y `TS_AUDIENCE`. Estos identificadores OIDC no son secretos de autenticación; se guardan aquí siguiendo el ejemplo oficial. No se necesita un secreto OAuth Tailscale. El secreto OpenSSH existente se conserva y su autenticación debe comprobarse en la primera ejecución.

## Activación y comprobación

Después de configurar Tailscale y los dos secretos, integrar el cambio y ejecutar el workflow en `main` desde Actions → Deploy to server → Run workflow. También se ejecuta al actualizar `main`.

Comprobar la conexión Tailscale, la autenticación SSH, el resultado satisfactorio de Actions, el commit de `/opt/emeb-crm` y la respuesta del CRM. Un cambio exclusivo de workflow o documentación no reconstruye la aplicación. Mantener la incidencia abierta hasta observar una ejecución real correcta; las comprobaciones locales no prueban el intercambio OIDC ni los permisos efectivos de la red.

## Referencias

- [Integración oficial con GitHub Actions](https://tailscale.com/docs/integrations/github/github-action).
- [Registro de identidades OIDC](https://tailscale.com/docs/features/workload-identity-federation).
- [Política y pruebas de acceso](https://tailscale.com/docs/reference/syntax/policy-file).
