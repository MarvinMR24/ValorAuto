/**
 * Formulario único para los dos flujos:
 * - "datos": el usuario completa marca, modelo, año y kilometraje.
 * - "foto": primero se sube una foto, Gemini identifica marca/modelo/año
 *   (POST /identificar), se prellenan los campos y el usuario los revisa y
 *   completa el kilometraje. Si la identificación falla, se sigue a mano.
 * Ambos terminan en POST /tasacion/datos.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Selector from '../components/Selector';
import { Aviso, Boton, Campo, Tarjeta } from '../components/ui';
import {
  Catalogo,
  getCatalogo,
  identificar,
  tasarConDatos,
  TasacionError,
  TasacionResult,
} from '../services/api';
import { colors, espacio, margenSuperior, radio } from '../theme';
import { capitalizar, miles, parsearEntero } from '../utils/formato';

const KM_MAX = 500_000;
const ANIO_ACTUAL = new Date().getFullYear();

type Props = {
  modo: 'datos' | 'foto';
  onResultado: (tasacion: TasacionResult, kilometraje: number) => void;
  onVolver: () => void;
};

type Errores = Partial<Record<'marca' | 'modelo' | 'anio' | 'kilometraje', string>>;

function mensajeDe(err: unknown): string {
  if (err instanceof TasacionError || err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado. Prueba de nuevo.';
}

export default function FormularioScreen({ modo, onResultado, onVolver }: Props) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [avisoCatalogo, setAvisoCatalogo] = useState<string | null>(null);

  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);

  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getCatalogo()
      .then(setCatalogo)
      .catch((err) => setAvisoCatalogo(`${mensajeDe(err)} Igual puedes escribir la marca y el modelo.`));
  }, []);

  const modelosDeMarca = useMemo(() => (catalogo && marca ? catalogo.modelos[marca] ?? [] : []), [catalogo, marca]);

  function cambiarMarca(nueva: string) {
    if (nueva !== marca) setModelo('');
    setMarca(nueva);
    setErrores((e) => ({ ...e, marca: undefined }));
  }

  async function elegirFoto(origen: 'camara' | 'galeria') {
    setAvisoFoto(null);
    const permiso =
      origen === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setAvisoFoto({
        tipo: 'error',
        texto: `Necesitamos permiso de ${origen === 'camara' ? 'cámara' : 'galería'} para continuar.`,
      });
      return;
    }

    const picker =
      origen === 'camara'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (picker.canceled || !picker.assets?.[0]) return;

    const uri = picker.assets[0].uri;
    setFotoUri(uri);
    setIdentificando(true);
    try {
      const v = await identificar(uri);
      setMarca(v.marca);
      setModelo(v.modelo);
      setAnio(String(v.anio));
      setTipo(v.tipo);
      setErrores({});
      setAvisoFoto({
        tipo: 'info',
        texto: `Detectamos un ${capitalizar(v.marca)} ${capitalizar(v.modelo)} ${v.anio} (confianza ${Math.round(
          v.confianza * 100
        )}%). Revisa los datos y completa el kilometraje.`,
      });
    } catch (err) {
      setAvisoFoto({ tipo: 'error', texto: mensajeDe(err) });
    } finally {
      setIdentificando(false);
    }
  }

  function validar(): { anio: number; km: number } | null {
    const nuevos: Errores = {};
    const anioNum = parsearEntero(anio);
    const kmNum = parsearEntero(kilometraje);
    if (!marca.trim()) nuevos.marca = 'Elige la marca.';
    if (!modelo.trim()) nuevos.modelo = 'Elige o escribe el modelo.';
    if (anioNum === null || anioNum < 1900 || anioNum > ANIO_ACTUAL + 1) nuevos.anio = 'Ingresa un año válido.';
    if (kmNum === null || kmNum > KM_MAX) nuevos.kilometraje = `Ingresa un kilometraje entre 0 y ${miles(KM_MAX)}.`;
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0 && anioNum !== null && kmNum !== null ? { anio: anioNum, km: kmNum } : null;
  }

  async function verPrecio() {
    setErrorGeneral(null);
    const valido = validar();
    if (!valido) return;
    setEnviando(true);
    try {
      const tasacion = await tasarConDatos({
        marca: marca.trim(),
        modelo: modelo.trim(),
        anio: valido.anio,
        kilometraje: valido.km,
        tipo,
      });
      onResultado(tasacion, valido.km);
    } catch (err) {
      if (err instanceof TasacionError && err.code === 'kilometraje_invalido') {
        setErrores((e) => ({ ...e, kilometraje: err.message }));
      } else {
        setErrorGeneral(mensajeDe(err));
      }
    } finally {
      setEnviando(false);
    }
  }

  const rangoAnios = catalogo ? `${catalogo.anio_min}–${catalogo.anio_max}` : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenedor} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onVolver} hitSlop={12} style={styles.volver} accessibilityRole="button">
          <Text style={styles.volverTexto}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.titulo}>{modo === 'foto' ? 'Tasar con una foto' : 'Ingresar datos'}</Text>
        <Text style={styles.subtitulo}>
          {modo === 'foto'
            ? 'Sube una foto del auto, revisa lo que detectamos y completa el kilometraje.'
            : 'Completa los datos del auto para ver su precio estimado.'}
        </Text>

        {modo === 'foto' && (
          <Tarjeta estilo={styles.tarjetaFoto}>
            {fotoUri ? (
              <View>
                <Image source={{ uri: fotoUri }} style={styles.foto} />
                {identificando && (
                  <View style={styles.velo}>
                    <ActivityIndicator color={colors.blanco} size="large" />
                    <Text style={styles.veloTexto}>Identificando el auto…</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.fotoVacia}>
                <Text style={styles.fotoVaciaTexto}>Una foto de frente o de costado funciona mejor.</Text>
              </View>
            )}
            <View style={styles.filaBotones}>
              <Boton
                titulo="Tomar foto"
                variante="secundario"
                onPress={() => elegirFoto('camara')}
                deshabilitado={identificando}
                estilo={styles.flex}
              />
              <Boton
                titulo="Galería"
                variante="secundario"
                onPress={() => elegirFoto('galeria')}
                deshabilitado={identificando}
                estilo={styles.flex}
              />
            </View>
          </Tarjeta>
        )}

        {avisoFoto && <Aviso tipo={avisoFoto.tipo}>{avisoFoto.texto}</Aviso>}
        {avisoCatalogo && <Aviso tipo="error">{avisoCatalogo}</Aviso>}

        <Tarjeta>
          <Selector
            etiqueta="Marca"
            valor={marca}
            opciones={catalogo?.marcas ?? []}
            onCambio={cambiarMarca}
            placeholder="Elige la marca"
            error={errores.marca}
          />
          <Selector
            etiqueta="Modelo"
            valor={modelo}
            opciones={modelosDeMarca}
            onCambio={(v) => {
              setModelo(v);
              setErrores((e) => ({ ...e, modelo: undefined }));
            }}
            placeholder={marca ? 'Elige o escribe el modelo' : 'Primero elige la marca'}
            deshabilitado={!marca}
            error={errores.modelo}
          />
          <Campo
            etiqueta={rangoAnios ? `Año (con precio: ${rangoAnios})` : 'Año'}
            value={anio}
            onChangeText={(t) => {
              setAnio(t.replace(/[^\d]/g, '').slice(0, 4));
              setErrores((e) => ({ ...e, anio: undefined }));
            }}
            keyboardType="number-pad"
            placeholder="Ej. 2015"
            maxLength={4}
            error={errores.anio}
          />
          <Campo
            etiqueta="Kilometraje"
            value={kilometraje}
            onChangeText={(t) => {
              const n = parsearEntero(t);
              setKilometraje(n === null ? '' : miles(n));
              setErrores((e) => ({ ...e, kilometraje: undefined }));
            }}
            keyboardType="number-pad"
            placeholder="Ej. 85.000"
            error={errores.kilometraje}
          />
        </Tarjeta>

        {errorGeneral && (
          <View style={styles.errorGeneral}>
            <Aviso tipo="error">{errorGeneral}</Aviso>
          </View>
        )}

        <Boton
          titulo="Ver precio"
          onPress={verPrecio}
          cargando={enviando}
          deshabilitado={identificando}
          estilo={styles.botonPrecio}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  titulo: { fontSize: 26, fontWeight: '800', color: colors.azul },
  subtitulo: { fontSize: 15, color: colors.textoSuave, marginTop: espacio.xs, marginBottom: espacio.l, lineHeight: 21 },
  tarjetaFoto: { marginBottom: espacio.m },
  foto: { width: '100%', height: 200, borderRadius: radio.m, backgroundColor: colors.borde },
  fotoVacia: {
    height: 140,
    borderRadius: radio.m,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borde,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacio.m,
  },
  fotoVaciaTexto: { color: colors.textoSuave, textAlign: 'center' },
  velo: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(30, 58, 95, 0.55)',
    borderRadius: radio.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.s,
  },
  veloTexto: { color: colors.blanco, fontWeight: '600' },
  filaBotones: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.m },
  errorGeneral: { marginTop: espacio.m },
  botonPrecio: { marginTop: espacio.l },
});
