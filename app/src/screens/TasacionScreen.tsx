/**
 * Pantalla principal: cámara/galería + kilometraje + botón "Tasar Auto".
 * Cubre las historias de usuario #20 y #21 del backlog
 * (docs/contexto/contexto_proyecto.md, Sprint 5).
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { tasarAuto, TasacionError, TasacionResult } from '../services/api';

export default function TasacionScreen() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [kilometraje, setKilometraje] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<TasacionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegirFoto(origen: 'camara' | 'galeria') {
    const permiso =
      origen === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permiso.granted) {
      setError('Necesitamos permiso de ' + (origen === 'camara' ? 'cámara' : 'galería') + ' para continuar.');
      return;
    }

    const resultadoPicker =
      origen === 'camara'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });

    if (!resultadoPicker.canceled && resultadoPicker.assets?.[0]) {
      setPhotoUri(resultadoPicker.assets[0].uri);
      setResultado(null);
      setError(null);
    }
  }

  function kilometrajeValido(): number | null {
    const valor = Number(kilometraje);
    if (!kilometraje || Number.isNaN(valor) || valor < 0 || valor > 1_000_000) {
      return null;
    }
    return valor;
  }

  async function onTasarAuto() {
    const km = kilometrajeValido();
    if (!photoUri) {
      setError('Subí una foto del auto primero.');
      return;
    }
    if (km === null) {
      setError('Ingresá un kilometraje válido (entre 0 y 1,000,000).');
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const tasacion = await tasarAuto(photoUri, km);
      setResultado(tasacion);
    } catch (err) {
      if (err instanceof TasacionError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>ValorAuto</Text>
      <Text style={styles.subtitulo}>Tasador de autos con IA</Text>

      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.preview} />
      ) : (
        <View style={styles.previewVacio}>
          <Text style={styles.previewVacioTexto}>Sin foto todavía</Text>
        </View>
      )}

      <View style={styles.filaBotones}>
        <Pressable style={styles.botonSecundario} onPress={() => elegirFoto('camara')}>
          <Text style={styles.botonSecundarioTexto}>Tomar foto</Text>
        </Pressable>
        <Pressable style={styles.botonSecundario} onPress={() => elegirFoto('galeria')}>
          <Text style={styles.botonSecundarioTexto}>Elegir de galería</Text>
        </Pressable>
      </View>

      <Text style={styles.etiqueta}>Kilometraje</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="Ej. 85000"
        value={kilometraje}
        onChangeText={setKilometraje}
      />

      <Pressable
        style={[styles.botonPrincipal, loading && styles.botonDeshabilitado]}
        onPress={onTasarAuto}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.botonPrincipalTexto}>Tasar Auto</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {resultado && (
        <View style={styles.resultado}>
          <Text style={styles.resultadoVehiculo}>
            {resultado.marca} {resultado.modelo} ({resultado.anio})
          </Text>
          <Text style={styles.resultadoPrecio}>${resultado.precio_estimado.toLocaleString()}</Text>
          <Text style={styles.resultadoRango}>
            Rango: ${resultado.precio_min.toLocaleString()} – ${resultado.precio_max.toLocaleString()}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 64,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  titulo: { fontSize: 28, fontWeight: '700', color: '#0B4884' },
  subtitulo: { fontSize: 14, color: '#666', marginBottom: 24 },
  preview: { width: 260, height: 180, borderRadius: 12, marginBottom: 16 },
  previewVacio: {
    width: 260,
    height: 180,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVacioTexto: { color: '#999' },
  filaBotones: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  botonSecundario: {
    borderWidth: 1,
    borderColor: '#1168BD',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  botonSecundarioTexto: { color: '#1168BD', fontWeight: '600' },
  etiqueta: { alignSelf: 'flex-start', fontSize: 13, color: '#333', marginBottom: 6 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    fontSize: 16,
  },
  botonPrincipal: {
    width: '100%',
    backgroundColor: '#1168BD',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonPrincipalTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#B00020', marginTop: 16, textAlign: 'center' },
  resultado: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#F0F7FF',
    width: '100%',
    alignItems: 'center',
  },
  resultadoVehiculo: { fontSize: 16, color: '#333', marginBottom: 4 },
  resultadoPrecio: { fontSize: 32, fontWeight: '700', color: '#0B4884' },
  resultadoRango: { fontSize: 13, color: '#666', marginTop: 4 },
});
