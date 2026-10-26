/**
 * Inicio: directo a las dos formas de tasar (ingresar datos o usar una foto).
 */
import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Logo from '../components/Logo';
import { colors, espacio, margenSuperior, radio, sombra } from '../theme';

type Props = {
  onElegir: (modo: 'datos' | 'foto') => void;
};

function IconoFormulario() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={3} width={16} height={18} rx={2.5} stroke={colors.azulAccion} strokeWidth={1.8} />
      <Path d="M8 8h8M8 12h8M8 16h5" stroke={colors.azulAccion} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function IconoCamara() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke={colors.azulAccion}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.5} stroke={colors.azulAccion} strokeWidth={1.8} />
    </Svg>
  );
}

function Opcion({ titulo, detalle, icono, onPress }: { titulo: string; detalle: string; icono: ReactElement; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.opcion, pressed && styles.opcionPresionada]}
    >
      <View style={styles.icono}>{icono}</View>
      <View style={styles.opcionTextos}>
        <Text style={styles.opcionTitulo}>{titulo}</Text>
        <Text style={styles.opcionDetalle}>{detalle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function InicioScreen({ onElegir }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      <View style={styles.cabecera}>
        <Logo />
        <Text style={styles.lema}>Conoce el precio de mercado de un auto y qué revisar antes de comprarlo.</Text>
      </View>

      <View style={styles.opciones}>
        <Opcion
          titulo="Ingresar datos"
          detalle="Marca, modelo, año y kilometraje."
          icono={<IconoFormulario />}
          onPress={() => onElegir('datos')}
        />
        <Opcion
          titulo="Usar una foto"
          detalle="Sacamos marca, modelo y año de la imagen; tú completas el resto."
          icono={<IconoCamara />}
          onPress={() => onElegir('foto')}
        />
      </View>

      <Text style={styles.pie}>Precios referenciales en dólares (US$), estimados con un modelo entrenado en el mercado de EE. UU.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flexGrow: 1,
    backgroundColor: colors.fondo,
    paddingTop: margenSuperior + espacio.xl,
    paddingHorizontal: espacio.l,
    paddingBottom: espacio.l,
  },
  cabecera: { alignItems: 'center', marginBottom: espacio.xl },
  lema: { marginTop: espacio.m, fontSize: 15, color: colors.textoSuave, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  opciones: { gap: espacio.m },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.superficie,
    borderRadius: radio.l,
    borderWidth: 1,
    borderColor: colors.borde,
    padding: espacio.m,
    minHeight: 96,
    ...sombra,
  },
  opcionPresionada: { backgroundColor: colors.azulClaro },
  icono: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.azulClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacio.m,
  },
  opcionTextos: { flex: 1 },
  opcionTitulo: { fontSize: 18, fontWeight: '700', color: colors.azul },
  opcionDetalle: { fontSize: 14, color: colors.textoSuave, marginTop: 2, lineHeight: 20 },
  chevron: { fontSize: 30, color: colors.azulAccion, marginLeft: espacio.s },
  pie: { marginTop: 'auto', paddingTop: espacio.xl, fontSize: 12, color: colors.textoSuave, textAlign: 'center' },
});
