/**
 * Logo de ValorAuto: etiqueta de precio roja con un auto blanco, y el nombre en azul.
 * El mismo trazado (LOGO_TAG_PATHS) se usa para generar los íconos de app.json.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

export const LOGO_TAG_PATHS = {
  etiqueta: 'M28 4 H108 Q116 4 116 12 V68 Q116 76 108 76 H28 L4 40 Z',
  carroceria:
    'M40 50 Q40 44 46 43 L54 42 L62 32 Q65 29 70 29 H86 Q91 29 94 33 L101 42 L104 43 Q108 44 108 49 V54 Q108 56 106 56 H42 Q40 56 40 54 Z',
  ventanaDelantera: 'M65 41 L70 34 H78 V41 Z',
  ventanaTrasera: 'M82 41 V34 H87 Q89 34 91 37 L94 41 Z',
};

export function LogoMarca({ ancho = 96, fondo = colors.fondo }: { ancho?: number; fondo?: string }) {
  const alto = (ancho * 80) / 120;
  return (
    <Svg width={ancho} height={alto} viewBox="0 0 120 80" accessibilityLabel="Logo de ValorAuto">
      <Path d={LOGO_TAG_PATHS.etiqueta} fill={colors.rojo} />
      <Circle cx={20} cy={40} r={5} fill={fondo} />
      <Path d={LOGO_TAG_PATHS.carroceria} fill={colors.blanco} />
      <Path d={LOGO_TAG_PATHS.ventanaDelantera} fill={colors.rojo} />
      <Path d={LOGO_TAG_PATHS.ventanaTrasera} fill={colors.rojo} />
      <Circle cx={54} cy={56} r={7} fill={colors.blanco} />
      <Circle cx={54} cy={56} r={3} fill={colors.rojo} />
      <Circle cx={94} cy={56} r={7} fill={colors.blanco} />
      <Circle cx={94} cy={56} r={3} fill={colors.rojo} />
    </Svg>
  );
}

export default function Logo({ tamano = 'grande' }: { tamano?: 'grande' | 'chico' }) {
  const grande = tamano === 'grande';
  return (
    <View style={[styles.fila, !grande && styles.filaChica]}>
      <LogoMarca ancho={grande ? 96 : 44} />
      <Text style={[styles.nombre, !grande && styles.nombreChico]}>
        Valor<Text style={styles.nombreAuto}>Auto</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { alignItems: 'center', gap: 10 },
  filaChica: { flexDirection: 'row', gap: 8 },
  nombre: { fontSize: 34, fontWeight: '800', color: colors.azul, letterSpacing: -0.5 },
  nombreChico: { fontSize: 20 },
  nombreAuto: { color: colors.azulAccion },
});
