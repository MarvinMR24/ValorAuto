/**
 * Navegación de ValorAuto: una pila simple inicio → formulario → resultado.
 * Las pantallas anteriores quedan montadas (ocultas) para que al volver de
 * resultados el formulario conserve lo que se escribió. El botón atrás de
 * Android hace pop de la pila.
 */
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import InicioScreen from './src/screens/InicioScreen';
import FormularioScreen from './src/screens/FormularioScreen';
import ResultadoScreen from './src/screens/ResultadoScreen';
import type { TasacionResult } from './src/services/api';
import { colors } from './src/theme';

type Ruta =
  | { nombre: 'inicio' }
  | { nombre: 'formulario'; modo: 'datos' | 'foto' }
  | { nombre: 'resultado'; tasacion: TasacionResult; kilometraje: number };

export default function App() {
  const [pila, setPila] = useState<Ruta[]>([{ nombre: 'inicio' }]);

  const ir = useCallback((ruta: Ruta) => setPila((p) => [...p, ruta]), []);
  const volver = useCallback(() => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p)), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pila.length > 1) {
        volver();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [pila.length, volver]);

  return (
    <View style={styles.app}>
      {pila.map((ruta, i) => {
        const visible = i === pila.length - 1;
        return (
          <View key={`${ruta.nombre}-${i}`} style={[styles.app, !visible && styles.oculta]}>
            {ruta.nombre === 'inicio' && <InicioScreen onElegir={(modo) => ir({ nombre: 'formulario', modo })} />}
            {ruta.nombre === 'formulario' && (
              <FormularioScreen
                modo={ruta.modo}
                onVolver={volver}
                onResultado={(tasacion, kilometraje) => ir({ nombre: 'resultado', tasacion, kilometraje })}
              />
            )}
            {ruta.nombre === 'resultado' && (
              <ResultadoScreen tasacion={ruta.tasacion} kilometraje={ruta.kilometraje} onVolver={volver} />
            )}
          </View>
        );
      })}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.fondo },
  oculta: { display: 'none' },
});
