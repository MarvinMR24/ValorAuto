/**
 * Resultado: precio estimado y rango, más fallas comunes y puntos a revisar
 * primero para ese modelo (GET /revision, se cargan después del precio).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Boton, Tarjeta } from '../components/ui';
import { getRevision, Revision, TasacionError, TasacionResult } from '../services/api';
import { colors, espacio, margenSuperior, radio } from '../theme';
import { capitalizar, dolares, miles } from '../utils/formato';

type Props = {
  tasacion: TasacionResult;
  kilometraje: number;
  onVolver: () => void;
};

const SEVERIDAD = {
  alta: { texto: 'Alta', color: colors.rojo, fondo: colors.rojoClaro },
  media: { texto: 'Media', color: colors.ambar, fondo: colors.ambarClaro },
  baja: { texto: 'Baja', color: colors.azulAccion, fondo: colors.azulClaro },
} as const;

export default function ResultadoScreen({ tasacion, kilometraje, onVolver }: Props) {
  const [revision, setRevision] = useState<Revision | null>(null);
  const [errorRevision, setErrorRevision] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setRevision(null);
    setErrorRevision(null);
    getRevision({ marca: tasacion.marca, modelo: tasacion.modelo, anio: tasacion.anio })
      .then((r) => vigente && setRevision(r))
      .catch((err) => vigente && setErrorRevision(err instanceof TasacionError ? err.message : 'No se pudo cargar la revisión.'));
    return () => {
      vigente = false;
    };
  }, [tasacion, intento]);

  const vehiculo = `${capitalizar(tasacion.marca)} ${capitalizar(tasacion.modelo)} ${tasacion.anio}`;
  const precioDeReferencia = tasacion.coincidencia && tasacion.coincidencia !== 'modelo';

  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      <Pressable onPress={onVolver} hitSlop={12} style={styles.volver} accessibilityRole="button">
        <Text style={styles.volverTexto}>‹ Volver</Text>
      </Pressable>

      <Tarjeta estilo={styles.tarjetaPrecio}>
        <Text style={styles.vehiculo}>{vehiculo}</Text>
        <Text style={styles.km}>{miles(kilometraje)} km</Text>
        <Text style={styles.etiquetaPrecio}>Precio estimado</Text>
        <Text style={styles.precio}>{dolares(tasacion.precio_estimado)}</Text>
        <Text style={styles.rango}>
          Entre {dolares(tasacion.precio_min)} y {dolares(tasacion.precio_max)}
        </Text>
        {precioDeReferencia && (
          <Text style={styles.nota}>
            No encontramos este modelo exacto: es un precio de referencia para {capitalizar(tasacion.marca)}{' '}
            {tasacion.anio}.
          </Text>
        )}
      </Tarjeta>

      {!revision && !errorRevision && (
        <View style={styles.cargando}>
          <ActivityIndicator color={colors.azulAccion} />
          <Text style={styles.cargandoTexto}>Buscando fallas comunes de este modelo…</Text>
        </View>
      )}

      {errorRevision && (
        <Tarjeta estilo={styles.seccion}>
          <Text style={styles.errorTexto}>{errorRevision}</Text>
          <Boton titulo="Reintentar" variante="secundario" onPress={() => setIntento((i) => i + 1)} estilo={styles.reintentar} />
        </Tarjeta>
      )}

      {revision && (
        <>
          {revision.fuente === 'generico' && (
            <Text style={styles.notaGenerica}>
              No tenemos información específica de este modelo ahora; esta es una revisión general para autos usados.
            </Text>
          )}

          <Tarjeta estilo={styles.seccion}>
            <Text style={styles.tituloSeccion}>Fallas comunes</Text>
            {revision.fallas_comunes.length === 0 && <Text style={styles.detalle}>Sin fallas conocidas reportadas.</Text>}
            {revision.fallas_comunes.map((f, i) => {
              const s = SEVERIDAD[f.severidad] ?? SEVERIDAD.media;
              return (
                <View key={`${f.titulo}-${i}`} style={[styles.item, i > 0 && styles.itemSeparado]}>
                  <View style={styles.itemCabecera}>
                    <Text style={styles.itemTitulo}>{f.titulo}</Text>
                    <View style={[styles.chip, { backgroundColor: s.fondo }]}>
                      <Text style={[styles.chipTexto, { color: s.color }]}>{s.texto}</Text>
                    </View>
                  </View>
                  {!!f.detalle && <Text style={styles.detalle}>{f.detalle}</Text>}
                </View>
              );
            })}
          </Tarjeta>

          <Tarjeta estilo={styles.seccion}>
            <Text style={styles.tituloSeccion}>Revisar primero</Text>
            {revision.revisar_primero.map((r, i) => (
              <View key={`${r.titulo}-${i}`} style={[styles.paso, i > 0 && styles.itemSeparado]}>
                <View style={styles.numero}>
                  <Text style={styles.numeroTexto}>{i + 1}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.itemTitulo}>{r.titulo}</Text>
                  {!!r.detalle && <Text style={styles.detalle}>{r.detalle}</Text>}
                </View>
              </View>
            ))}
          </Tarjeta>
        </>
      )}

      <Boton titulo="Volver" variante="secundario" onPress={onVolver} estilo={styles.botonVolver} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenedor: {
    flexGrow: 1,
    backgroundColor: colors.fondo,
    paddingTop: margenSuperior,
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.xl,
  },
  volver: { alignSelf: 'flex-start', marginBottom: espacio.m },
  volverTexto: { fontSize: 16, color: colors.azulAccion, fontWeight: '600' },
  tarjetaPrecio: { alignItems: 'center', paddingVertical: espacio.l, backgroundColor: colors.azul, borderColor: colors.azul },
  vehiculo: { fontSize: 20, fontWeight: '700', color: colors.blanco, textAlign: 'center' },
  km: { fontSize: 14, color: colors.azulClaro, marginTop: 2 },
  etiquetaPrecio: { fontSize: 13, color: colors.azulClaro, marginTop: espacio.l, textTransform: 'uppercase', letterSpacing: 1 },
  precio: { fontSize: 40, fontWeight: '800', color: colors.blanco, marginTop: espacio.xs },
  rango: { fontSize: 14, color: colors.azulClaro, marginTop: espacio.xs },
  nota: { fontSize: 13, color: colors.fondo, marginTop: espacio.m, textAlign: 'center', lineHeight: 19 },
  cargando: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.l, justifyContent: 'center' },
  cargandoTexto: { color: colors.textoSuave },
  notaGenerica: { marginTop: espacio.l, fontSize: 13, color: colors.textoSuave, lineHeight: 19 },
  seccion: { marginTop: espacio.m },
  tituloSeccion: { fontSize: 18, fontWeight: '700', color: colors.azul, marginBottom: espacio.s },
  item: { paddingVertical: espacio.xs },
  itemSeparado: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borde, paddingTop: espacio.s, marginTop: espacio.s },
  itemCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.s },
  itemTitulo: { fontSize: 15, fontWeight: '600', color: colors.texto, flexShrink: 1 },
  detalle: { fontSize: 14, color: colors.textoSuave, marginTop: 2, lineHeight: 20 },
  chip: { borderRadius: radio.s, paddingHorizontal: 8, paddingVertical: 3 },
  chipTexto: { fontSize: 12, fontWeight: '700' },
  paso: { flexDirection: 'row', gap: espacio.s, paddingVertical: espacio.xs },
  numero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.azulClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numeroTexto: { color: colors.azul, fontWeight: '700', fontSize: 13 },
  errorTexto: { color: colors.rojo, fontSize: 14 },
  reintentar: { marginTop: espacio.s },
  botonVolver: { marginTop: espacio.l },
});
