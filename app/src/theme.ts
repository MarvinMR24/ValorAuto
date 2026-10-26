/**
 * Paleta de ValorAuto: azules sobre fondo beige/blanco, con el rojo reservado
 * para el logo y los errores.
 */
import { Platform, StatusBar } from 'react-native';

export const colors = {
  azul: '#1E3A5F',
  azulAccion: '#2F6FB2',
  azulClaro: '#DCE8F5',
  fondo: '#F6F1E7',
  superficie: '#FFFCF6',
  borde: '#E6DCC8',
  texto: '#1B2433',
  textoSuave: '#5B6475',
  rojo: '#C8102E',
  rojoClaro: '#FBE3E6',
  ambar: '#B7791F',
  ambarClaro: '#FBF0DA',
  blanco: '#FFFFFF',
} as const;

export const espacio = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;

export const radio = { s: 8, m: 14, l: 20 } as const;

// Sin react-native-safe-area-context: margen superior suficiente para la barra de estado/notch.
export const margenSuperior = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + espacio.m : 60;

export const sombra = {
  shadowColor: '#1E3A5F',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
