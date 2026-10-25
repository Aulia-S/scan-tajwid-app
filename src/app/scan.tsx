import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CameraIcon, CheckIcon, CircleAlertIcon, RotateCcwIcon, XIcon } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CropView, type CropViewHandle, type PixelCrop } from '@/components/crop-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { recordScan } from '@/lib/history';
import { OcrError, recognizeText } from '@/lib/ocr';
import { identifyVerses } from '@/lib/quran/db';

/** Longest side sent to Cloud Vision: enough detail for harakat without a huge upload. */
const MAX_IMAGE_SIDE = 2048;

type Status =
  | { kind: 'ready' }
  | { kind: 'working'; label: string }
  | { kind: 'failed'; title: string; message: string };

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const db = useSQLiteContext();
  const camera = useRef<CameraView>(null);
  const cropper = useRef<CropViewHandle>(null);
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'ready' });

  async function capture() {
    if (!camera.current) return;
    try {
      setStatus({ kind: 'working', label: 'Memotret…' });
      setPhoto(await camera.current.takePictureAsync({ quality: 1 }));
      setStatus({ kind: 'ready' });
    } catch (e) {
      setStatus({ kind: 'failed', ...describeError(e) });
    }
  }

  function retake() {
    setPhoto(null);
    setStatus({ kind: 'ready' });
  }

  async function identify(picture: CameraCapturedPicture, crop: PixelCrop) {
    try {
      setStatus({ kind: 'working', label: 'Menyiapkan foto…' });
      const context = ImageManipulator.manipulate(picture.uri).crop(crop);
      if (Math.max(crop.width, crop.height) > MAX_IMAGE_SIDE) {
        context.resize(crop.width >= crop.height ? { width: MAX_IMAGE_SIDE } : { height: MAX_IMAGE_SIDE });
      }
      const image = await (await context.renderAsync()).saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
        base64: true,
      });

      setStatus({ kind: 'working', label: 'Membaca teks…' });
      const text = await recognizeText(image.base64!);

      setStatus({ kind: 'working', label: 'Mencari ayat…' });
      const range = await identifyVerses(db, text);
      if (!range) {
        setStatus({
          kind: 'failed',
          title: 'Ayat tidak dikenali',
          message: 'Pastikan halaman mushaf terlihat jelas, cukup terang, dan tidak miring, lalu foto ulang.',
        });
        return;
      }
      await recordScan(range.fromId, range.toId);
      router.replace({ pathname: '/result', params: { from: range.fromId, to: range.toId } });
    } catch (e) {
      setStatus({ kind: 'failed', ...describeError(e) });
    }
  }

  if (!permission) return <View className="bg-background flex-1" />;

  if (!permission.granted) {
    return (
      <SafeAreaView className="bg-background flex-1 justify-center p-4">
        <Card>
          <CardHeader>
            <CardTitle>Izinkan akses kamera</CardTitle>
            <CardDescription>Kamera dipakai untuk memotret halaman mushaf yang ingin dibaca tajwidnya.</CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            <Button variant="outline" className="flex-1" onPress={() => router.back()}>
              <Text>Batal</Text>
            </Button>
            <Button className="flex-1" onPress={requestPermission}>
              <Text>Izinkan</Text>
            </Button>
          </CardFooter>
        </Card>
      </SafeAreaView>
    );
  }

  const working = status.kind === 'working';
  const failure = status.kind === 'failed' && (
    <Alert icon={CircleAlertIcon} variant="destructive">
      <AlertTitle>{status.title}</AlertTitle>
      <AlertDescription>{status.message}</AlertDescription>
    </Alert>
  );
  const progress = working && (
    <View className="bg-card h-14 flex-row items-center justify-center gap-3 rounded-md">
      <ActivityIndicator />
      <Text>{status.label}</Text>
    </View>
  );

  if (photo) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-black p-4">
        <Text className="text-center text-white">Geser sudut kotak agar hanya ayat yang ingin dibaca</Text>
        <CropView ref={cropper} uri={photo.uri} width={photo.width} height={photo.height} disabled={working} />
        {failure}
        {progress || (
          <View className="flex-row gap-2">
            <Button variant="secondary" size="lg" className="h-14 flex-1" onPress={retake}>
              <Icon as={RotateCcwIcon} size={18} />
              <Text>Foto ulang</Text>
            </Button>
            <Button
              size="lg"
              className="h-14 flex-1"
              onPress={() => {
                const crop = cropper.current?.getCrop();
                if (crop) identify(photo, crop);
              }}>
              <Icon as={CheckIcon} className="text-primary-foreground" size={18} />
              <Text>{status.kind === 'failed' ? 'Coba lagi' : 'Gunakan'}</Text>
            </Button>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
      <SafeAreaView className="absolute inset-0 justify-between p-4" pointerEvents="box-none">
        <View className="flex-row justify-end">
          <Button variant="secondary" size="icon" className="rounded-full" onPress={() => router.back()}>
            <Icon as={XIcon} size={20} />
          </Button>
        </View>

        <View className="gap-4">
          {failure}
          {progress || (
            <Button size="lg" className="h-14" onPress={capture}>
              <Icon as={CameraIcon} className="text-primary-foreground" size={20} />
              <Text>Foto ayat</Text>
            </Button>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function describeError(e: unknown): { title: string; message: string } {
  if (e instanceof OcrError) {
    switch (e.reason) {
      case 'not-configured':
        return { title: 'OCR belum dikonfigurasi', message: e.message };
      case 'network':
        return { title: 'Tidak ada koneksi', message: 'Pembacaan teks butuh internet. Periksa koneksi lalu coba lagi.' };
      case 'no-text':
        return { title: 'Teks tidak terbaca', message: 'Tidak ada teks yang terdeteksi. Dekatkan kamera ke ayat lalu foto ulang.' };
      case 'quota':
        return {
          title: 'Kuota scan bulan ini habis',
          message: 'Batas scan bulanan sudah tercapai. Coba lagi bulan depan.',
        };
      case 'server':
        return { title: 'Gagal membaca teks', message: `Server OCR mengembalikan galat: ${e.message}` };
    }
  }
  return { title: 'Terjadi kesalahan', message: e instanceof Error ? e.message : String(e) };
}
