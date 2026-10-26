/**
 * Selector con buscador en un modal (marca y modelo del formulario).
 * Con `permitirLibre`, si lo escrito no está en la lista se puede usar tal cual:
 * el backend normaliza y hace fuzzy matching de todos modos.
 */
import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, espacio, margenSuperior, radio } from '../theme';
import { capitalizar } from '../utils/formato';
import { Etiqueta, estilosCampo } from './ui';

type Props = {
  etiqueta: string;
  valor: string;
  opciones: string[];
  onCambio: (valor: string) => void;
  placeholder: string;
  permitirLibre?: boolean;
  deshabilitado?: boolean;
  error?: string | null;
};

export default function Selector({
  etiqueta,
  valor,
  opciones,
  onCambio,
  placeholder,
  permitirLibre = true,
  deshabilitado,
  error,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? opciones.filter((o) => o.toLowerCase().includes(q)) : opciones;
  }, [busqueda, opciones]);

  const textoLibre = busqueda.trim();
  const mostrarLibre =
    permitirLibre && textoLibre.length > 0 && !opciones.some((o) => o.toLowerCase() === textoLibre.toLowerCase());

  // El toque que cierra el modal puede "atravesarlo" y caer en el disparador de
  // abajo, reabriéndolo: se ignoran aperturas justo después de cerrar.
  const cerradoEn = useRef(0);

  function cerrar() {
    cerradoEn.current = Date.now();
    setBusqueda('');
    setAbierto(false);
  }

  function abrir() {
    if (Date.now() - cerradoEn.current > 400) setAbierto(true);
  }

  function elegir(v: string) {
    onCambio(v);
    cerrar();
  }

  return (
    <View style={styles.contenedor}>
      <Etiqueta>{etiqueta}</Etiqueta>
      <Pressable
        accessibilityRole="button"
        disabled={deshabilitado}
        onPress={abrir}
        style={[estilosCampo.input, styles.disparador, error ? styles.disparadorError : null, deshabilitado && styles.inactivo]}
      >
        <Text style={valor ? styles.valor : styles.placeholder}>{valor ? capitalizar(valor) : placeholder}</Text>
        <Text style={styles.flecha}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <View style={styles.modal}>
          <View style={styles.cabecera}>
            <Text style={styles.titulo}>{etiqueta}</Text>
            <Pressable onPress={cerrar} hitSlop={12}>
              <Text style={styles.cerrar}>Cerrar</Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Buscar…"
            placeholderTextColor={colors.textoSuave}
            value={busqueda}
            onChangeText={setBusqueda}
            style={[estilosCampo.input, styles.buscador]}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (filtradas.length === 1) elegir(filtradas[0]);
              else if (mostrarLibre) elegir(textoLibre.toLowerCase());
            }}
          />
          <FlatList
            data={filtradas}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            ListHeaderComponent={
              mostrarLibre ? (
                <Pressable style={styles.opcion} onPress={() => elegir(textoLibre.toLowerCase())}>
                  <Text style={styles.opcionLibre}>Usar “{textoLibre}”</Text>
                </Pressable>
              ) : undefined
            }
            ListEmptyComponent={
              mostrarLibre ? undefined : <Text style={styles.vacio}>No hay opciones. Escribe para buscar.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.opcion, pressed && styles.opcionPresionada]}
                onPress={() => elegir(item)}
              >
                <Text style={[styles.opcionTexto, item === valor && styles.opcionActiva]}>{capitalizar(item)}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginBottom: espacio.m },
  disparador: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disparadorError: { borderColor: colors.rojo },
  inactivo: { opacity: 0.5 },
  valor: { fontSize: 16, color: colors.texto },
  placeholder: { fontSize: 16, color: colors.textoSuave },
  flecha: { fontSize: 16, color: colors.azulAccion },
  error: { color: colors.rojo, fontSize: 12, marginTop: 4 },
  modal: { flex: 1, backgroundColor: colors.fondo, paddingTop: margenSuperior, paddingHorizontal: espacio.m },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.azul },
  cerrar: { fontSize: 16, color: colors.azulAccion, fontWeight: '600' },
  buscador: { marginBottom: espacio.s },
  opcion: {
    paddingVertical: 14,
    paddingHorizontal: espacio.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borde,
  },
  opcionPresionada: { backgroundColor: colors.azulClaro, borderRadius: radio.s },
  opcionTexto: { fontSize: 16, color: colors.texto },
  opcionActiva: { color: colors.azulAccion, fontWeight: '700' },
  opcionLibre: { fontSize: 16, color: colors.azulAccion, fontWeight: '600' },
  vacio: { color: colors.textoSuave, textAlign: 'center', marginTop: espacio.l },
});
