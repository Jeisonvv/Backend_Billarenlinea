# Backend Billar en Linea

Backend del proyecto Billar en Linea.

## Documentacion

La documentacion operativa e integraciones esta organizada en la carpeta docs.

- Indice general: docs/README.md
- Usuarios: docs/users/
- Pagos: docs/payments/
- Datos y seeding: docs/data/

## Produccion

Este proyecto ya puede compilarse para produccion con:

```bash
npm run build
```

El servidor de produccion debe arrancar con:

```bash
npm start
```

Archivos y carpetas que normalmente si se suben al servidor:

- dist/
- package.json
- package-lock.json

Archivos y carpetas que no se deben subir:

- .env
- node_modules/
- logs temporales
- docs/ y scripts/ si no se usan en el servidor

Las variables de entorno deben configurarse directamente en el hosting o servidor.
