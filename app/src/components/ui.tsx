/**
 * Piezas visuales compartidas por las pantallas: botones, campo de texto,
 * tarjeta y aviso.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, espacio, radio, sombra } from '../theme';

type BotonProps = {
  titulo: string;
  onPress: () => void;
  cargando?: boolean;
  deshabilitado?: boolean;
  variante?: 'primario' | 'secundario';
  estilo?: ViewStyle;
};

export function Boton({ titulo, onPress, cargando, deshabilitado, variante = 'primario', estilo }: BotonProps) {
  const primario = variante === 'primario';
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        styles.boton,
        primario ? styles.botonPrimario : styles.botonSecundario,
        pressed && styles.presionado,
        inactivo && styles.inactivo,
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={primario ? colors.blanco : colors.azulAccion} />
      ) : (
        <Text style={primario ? styles.botonPrimarioTexto : styles.botonSecundarioTexto}>{titulo}</Text>
      )}
    </Pressable>
  );
}

export function Etiqueta({ children }: { children: ReactNode }) {
  return <Text style={styles.etiqueta}>{children}</Text>;
}

export function Campo({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string | null }) {
  return (
    <View style={styles.campo}>
      <Etiqueta>{etiqueta}</Etiqueta>
      <TextInput
        placeholderTextColor={colors.textoSuave}
        style={[styles.input, error ? styles.inputError : null]}
        {...props}
      />
      {error ? <Text style={styles.errorCampo}>{error}</Text> : null}
    </View>
  );
}

export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  return <View style={[styles.tarjeta, estilo]}>{children}</View>;
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'info'; children: ReactNode }) {
  const esError = tipo === 'error';
  return (
    <View style={[styles.aviso, esError ? styles.avisoError : styles.avisoInfo]}>
      <Text style={[styles.avisoTexto, { color: esError ? colors.rojo : colors.azul }]}>{children}</Text>
    </View>
  );
}

export const estilosCampo = StyleSheet.create({
  input: {
    backgroundColor: colors.superficie,
    borderWidth: 1,
    borderColor: colors.borde,
    borderRadius: radio.s,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.texto,
  },
});

const styles = StyleSheet.create({
  boton: {
    minHeight: 52,
    borderRadius: radio.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.m,
  },
  botonPrimario: { backgroundColor: colors.azulAccion },
  botonSecundario: { borderWidth: 1.5, borderColor: colors.azulAccion, backgroundColor: colors.superficie },
  botonPrimarioTexto: { color: colors.blanco, fontWeight: '700', fontSize: 16 },
  botonSecundarioTexto: { color: colors.azulAccion, fontWeight: '700', fontSize: 15 },
  presionado: { opacity: 0.85 },
  inactivo: { opacity: 0.55 },
  campo: { marginBottom: espacio.m },
  etiqueta: { fontSize: 13, fontWeight: '600', color: colors.azul, marginBottom: 6 },
  input: estilosCampo.input,
  inputError: { borderColor: colors.rojo },
  errorCampo: { color: colors.rojo, fontSize: 12, marginTop: 4 },
  tarjeta: {
    backgroundColor: colors.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: colors.borde,
    padding: espacio.m,
    ...sombra,
  },
  aviso: { borderRadius: radio.s, padding: 12, marginBottom: espacio.m },
  avisoError: { backgroundColor: colors.rojoClaro },
  avisoInfo: { backgroundColor: colors.azulClaro },
  avisoTexto: { fontSize: 14, lineHeight: 20 },
});
