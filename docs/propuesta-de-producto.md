# Propuesta de producto y venta · TallerOT

*TallerOT es el nombre comercial de trabajo del Sistema de Gestión para Servicio Técnico de Celulares.*

> Sistema de gestión para servicios técnicos de celulares. App en producción: [front-pf-three.vercel.app](https://front-pf-three.vercel.app) · API: [servicio-back.onrender.com/api](https://servicio-back.onrender.com/api)

**En una frase:** TallerOT reemplaza la nota de papel y el WhatsApp del mostrador por una orden de trabajo digital que protege el celular del cliente, controla los repuestos y le dice al cliente cómo va su equipo sin que tenga que llamar.

Los precios, el tamaño del mercado y los costos de este documento son **hipótesis a validar** con talleres reales (sección 9). No vienen de un estudio de mercado propio; las fuentes de apoyo están en el [vault de Obsidian](https://github.com/sergioCisneros17/ObsidianProyecto/blob/main/README.md) (*Viabilidad de un taller de celulares*, Méndez 2023, y *Libro blanco del comercio electrónico*), y sus cifras no se trasladan a Bolivia.

## 1. Problema

En un taller de celulares típico (un local, recepción, 1 a 3 técnicos y un pequeño almacén) el trabajo se controla con papel y mensajes. Eso produce seis dolores concretos ([contexto del problema](../ai-context/00-contexto-problema.md)):

| # | Dolor | Qué le cuesta al taller |
| --- | --- | --- |
| D1 | Nadie sabe en qué estado está una reparación sin preguntarle al técnico | Llamadas del cliente que interrumpen el banco de trabajo |
| D2 | No queda constancia del estado físico del equipo al recibirlo | Reclamos de "mi pantalla no estaba rayada" sin forma de probar lo contrario |
| D3 | El código de desbloqueo se anota en papel y cualquiera lo ve | Riesgo de privacidad y de reputación |
| D4 | El presupuesto se aprueba por teléfono sin registro | Discusiones de precio al entregar |
| D5 | Se usan repuestos sin descontarlos, o falta la pieza a mitad de la reparación | Equipos desarmados en espera y pérdidas de stock caro |
| D6 | Cuando el equipo vuelve, nadie recuerda qué se le hizo | Garantías mal atendidas y diagnósticos repetidos |

## 2. Cliente objetivo

| Segmento | Descripción | Por qué primero |
| --- | --- | --- |
| **Primario** | Talleres independientes de 1 a 3 técnicos en ciudades de Bolivia, hoy con papel, cuaderno, Excel o WhatsApp | Sienten los seis dolores, deciden rápido (el dueño compra) y no pueden pagar un sistema hecho a medida |
| Secundario | Cadenas pequeñas de 2 a 5 locales | Necesitan ver todos los locales juntos: requiere multi-local (hoja de ruta) |
| Usuario final | El cliente que deja su celular | No paga, pero su confianza es el argumento de venta del taller |

**Quién decide la compra:** el dueño del taller, que suele ser también técnico o administrador. **Quién usa el sistema todos los días:** recepción y técnicos.

## 3. Propuesta de valor

| Para… | TallerOT… | Funcionalidad que ya existe |
| --- | --- | --- |
| El dueño | Sabe qué pasa en el taller sin estar presente y no pierde repuestos | Panel de control, auditoría inalterable de cada cambio, kardex de stock, alertas de stock bajo |
| Recepción | Recibe un equipo en un minuto y deja todo por escrito | Ingreso por IMEI con historial, checklist físico, ticket imprimible, presupuesto versionado con aprobación registrada |
| El técnico | Ve solo sus equipos y nunca empieza una reparación sin la pieza | Bandeja por técnico, **Stock Guard** (reserva atómica al iniciar), código de desbloqueo cifrado y revelado con auditoría |
| El cliente | Consulta el estado de su equipo desde el celular, sin llamar | Portal público con número de OT y código de seguimiento, sin datos internos |
| El que ya usa IA | Pide "pasa la OT-123 a reparación" a un asistente y una persona aprueba en vivo | Servidor MCP, agente con aprobación humana y auditoría ([`mcp-server/README.md`](../mcp-server/README.md)) |

**Diferenciadores:**

1. **El código de desbloqueo protegido** (AES-256-GCM, revelado auditado). Ningún cuaderno ni hoja de cálculo lo hace, y es el miedo número uno del cliente al dejar su celular.
2. **Stock Guard:** dos órdenes no pueden ganar la misma última pantalla. Es el control más pedido por los dueños y el más difícil de hacer bien.
3. **Pensado para el mostrador boliviano:** en español, aprobaciones por WhatsApp registradas como canal, funciona en el celular del técnico (controles de 44 px, desde 320 px de ancho).
4. **IA con control humano:** el agente propone y una persona decide. Es útil sin poner en riesgo el stock ni la relación con el cliente.

## 4. Competencia y alternativas

| Alternativa | Ventaja | Por qué TallerOT gana |
| --- | --- | --- |
| Papel, cuaderno y WhatsApp | Gratis y conocido | No deja constancia, no controla stock ni protege el código (D1–D6) |
| Excel o Google Sheets | Barato y flexible | Sin estados ni permisos por rol; cualquiera borra una fila; el cliente no puede consultar |
| Software genérico de tickets o facturación | Maduro | No entiende IMEI, compatibilidad de repuestos por modelo ni código de desbloqueo |
| SaaS internacionales para talleres de reparación | Muchas funciones | Pensados para otros mercados: idioma, moneda, soporte y precio en dólares; exceso de funciones para un taller de 2 personas |

## 5. Modelo de negocio y precios (hipótesis)

Suscripción mensual por local, en bolivianos, sin permanencia:

| Plan | Para | Incluye | Precio propuesto |
| --- | --- | --- | --- |
| **Mostrador** | 1 local, hasta 3 usuarios | Órdenes, ingreso por IMEI, presupuestos, inventario con Stock Guard, portal del cliente, ticket | **Bs 150 / mes** |
| **Taller** | 1 local, usuarios ilimitados | Todo lo anterior, más panel de control, auditoría exportable y soporte por WhatsApp en horario laboral | **Bs 250 / mes** |
| **Taller + IA** | Talleres que ya usan asistentes de IA | Todo lo anterior, más el agente con aprobación humana (MCP) | **Bs 350 / mes** |
| Puesta en marcha (opcional) | — | Carga del catálogo de repuestos y modelos, y una capacitación de 2 horas | **Bs 400** pago único |

- **Prueba gratuita de 30 días** con datos reales del taller.
- **Descuento anual:** 2 meses gratis si paga 12 por adelantado.
- **Argumento de retorno:** una sola pantalla perdida o usada sin cobrar (Bs 650 de costo en los datos de ejemplo del sistema) cuesta más que cuatro meses del plan Mostrador.

**Costos de servir (estimados):** hoy la app corre en planes gratuitos (Render y Vercel), que se duermen tras 15 minutos y cuya base vence a los 30 días. Para clientes que pagan hace falta un plan pago de API y base de datos, compartido entre talleres cuando exista multi-local (sección 8). El margen depende de cuántos talleres comparten esa infraestructura.

## 6. Cómo se vende

| Canal | Acción |
| --- | --- |
| Visita directa | Galerías y centros comerciales con concentración de talleres de celulares: demo de 5 minutos en el celular del dueño |
| Proveedores de repuestos | Alianza: el proveedor recomienda TallerOT y recibe una comisión del primer año |
| Boca a boca | Un mes gratis para el taller que recomienda y para el recomendado |
| Contenido | Videos cortos que muestren "el cliente consultó su equipo sin llamar" y "el sistema no dejó empezar sin la pantalla" |

**Embudo:** visita o recomendación → demo → prueba de 30 días con acompañamiento la primera semana → plan pagado. Se mide con las métricas de la sección 9.

## 7. Guion de demo (5 minutos)

1. **Recepción (1 min):** registrar un iPhone por IMEI, marcar "pantalla rayada" en el checklist, guardar el código de desbloqueo y entregar el ticket con código de seguimiento.
2. **Cliente (30 s):** desde otro celular, abrir el portal y consultar el estado con el ticket. Mostrar que no ve costos ni notas internas.
3. **Técnico (1 min):** entrar como técnico, ver solo sus órdenes, diagnosticar y revelar el código (queda auditado).
4. **Presupuesto (1 min):** armar el presupuesto con un repuesto compatible y registrar "aprobado por WhatsApp".
5. **Stock Guard (1 min):** intentar iniciar la reparación sin stock: el sistema lo impide y dice qué pieza falta. Registrar la llegada y reintentar.
6. **IA (30 s):** pedir al asistente "pasa la OT a control de calidad"; la propuesta aparece en vivo en Aprobaciones IA y se aprueba con un clic. Cerrar con la auditoría, que muestra quién aprobó.

## 8. Hoja de ruta comercial

| Etapa | Qué | Por qué vende |
| --- | --- | --- |
| Ahora | MVP completo en producción, 23 specs verificadas con tests | Demo real, no maqueta |
| Siguiente | Sesión con cookie protegida (spec 009) y vencimiento automático de presupuestos (spec 010) | Seguridad y menos trabajo manual |
| Luego | Multi-local con datos aislados por taller; aviso por WhatsApp al cambiar de estado | Habilita el segmento de cadenas y el plan con varios locales |
| Después | Garantías, proveedores y métricas del panel (sección 9) | Retención: el sistema se vuelve la memoria del negocio |

## 9. Cómo se valida (antes de afirmar cifras)

| Pregunta | Experimento | Señal de éxito |
| --- | --- | --- |
| ¿El dolor es real y frecuente? | Entrevistar a 10 talleres con las preguntas de [Validación del negocio](https://github.com/sergioCisneros17/ObsidianProyecto/blob/main/03%20Proyecto/ProyectoF%20-%20Validaci%C3%B3n%20del%20negocio%20y%20sostenibilidad.md) | 7 de 10 nombran al menos dos de los dolores D1–D6 sin que se los sugieran |
| ¿Lo usan de verdad? | Piloto gratuito de 4 semanas en 2 talleres | Más del 80 % de los equipos recibidos se registran en el sistema |
| ¿Baja la carga del mostrador? | Contar las llamadas de "¿ya está mi equipo?" una semana antes y una durante el piloto | Menos consultas por cada 100 órdenes activas |
| ¿Pagarían ese precio? | Ofrecer el plan al terminar el piloto | Al menos 1 de 2 talleres paga el primer mes |

Las métricas operativas (aprobación de presupuestos, tiempo por estado, entregas a tiempo, bloqueos de stock, retrabajo) están definidas en [Métricas propuestas](https://github.com/sergioCisneros17/ObsidianProyecto/blob/main/03%20Proyecto/ProyectoF%20-%20M%C3%A9tricas%20propuestas.md) y salen de la auditoría que el sistema ya guarda.

## 10. Equipo

| Integrante | Aporte principal |
| --- | --- |
| Julio Oliva | Arquitectura, backend y base del frontend, CI/CD y despliegue, agente IA (MCP, skill, subagente y hooks) |
| Fabricio Pinto Lozada | Spec-Driven Development de backend y frontend (specs, trazabilidad y correcciones de seguridad), primer diseño visual |
| Sergio Miguel Cisneros Salazar | Diseño visual con mascota y navegación móvil; vault de Obsidian (segundo cerebro) |
