/**
 * Checklist genérico de inspección de un auto usado (ADR-0011).
 * Es el respaldo de GET /revision cuando Gemini no está disponible, no hay
 * GEMINI_API_KEY o la respuesta no cumple el esquema: la pantalla de resultados
 * nunca queda vacía.
 */
export const REVISION_GENERICA = {
  fallas_comunes: [
    {
      titulo: 'Desgaste de frenos',
      detalle: 'Pastillas y discos se gastan con el uso; ruidos metálicos o vibración al frenar indican cambio.',
      severidad: 'media',
    },
    {
      titulo: 'Suspensión y amortiguadores',
      detalle: 'Golpeteos en baches, inclinación excesiva en curvas o rebote prolongado sugieren amortiguadores vencidos.',
      severidad: 'media',
    },
    {
      titulo: 'Fugas de aceite o refrigerante',
      detalle: 'Manchas debajo del auto o nivel bajo frecuente pueden venir de juntas, retenes o mangueras.',
      severidad: 'alta',
    },
    {
      titulo: 'Batería y sistema eléctrico',
      detalle: 'Arranque lento, luces débiles o testigos encendidos en el tablero.',
      severidad: 'baja',
    },
  ],
  revisar_primero: [
    {
      titulo: 'Historial de mantenimiento',
      detalle: 'Pide facturas o libreta de servicios: cambios de aceite, correa de distribución y frenos.',
    },
    {
      titulo: 'Motor en frío',
      detalle: 'Arráncalo en frío: humo azul o blanco persistente, ruidos o tirones son señales de alerta.',
    },
    {
      titulo: 'Caja de cambios',
      detalle: 'En la prueba de manejo los cambios deben entrar suaves, sin golpes ni patinaje.',
    },
    {
      titulo: 'Carrocería y chasis',
      detalle: 'Busca óxido, diferencias de color entre paneles y separaciones irregulares que delaten choques.',
    },
    {
      titulo: 'Neumáticos',
      detalle: 'Un desgaste disparejo puede indicar problemas de alineación o de suspensión.',
    },
  ],
};

export default REVISION_GENERICA;
