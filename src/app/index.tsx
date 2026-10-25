import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CameraIcon, SearchIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { clearScans, deleteScan, listScans, recordScan, type ScanRecord } from '@/lib/history';
import { isOcrConfigured } from '@/lib/ocr';
import { getVersesById, identifyVerses, rangeTitle, type Verse } from '@/lib/quran/db';
import { cn } from '@/lib/utils';

type HistoryItem = { scan: ScanRecord; first: Verse; last: Verse };

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  const load = useCallback(async () => {
    const scans = await listScans();
    const verses = await getVersesById(
      db,
      scans.flatMap((s) => [s.from_id, s.to_id])
    );
    setHistory(
      scans.flatMap((scan) => {
        const first = verses.get(scan.from_id);
        const last = verses.get(scan.to_id);
        return first && last ? [{ scan, first, last }] : [];
      })
    );
  }, [db]);

  // Reload whenever the screen regains focus, e.g. after a scan.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4"
      data={history ?? []}
      keyExtractor={(item) => String(item.scan.id)}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          <ScanCard />
          {!isOcrConfigured && <OcrNotConfigured />}
          {__DEV__ && <MatchTester onMatched={load} />}
          <HistoryHeader
            hasItems={!!history?.length}
            onClear={async () => {
              await clearScans();
              load();
            }}
          />
        </View>
      }
      ListEmptyComponent={
        history ? (
          <Text variant="muted" className="py-6 text-center">
            Belum ada scan. Ayat yang berhasil dikenali akan muncul di sini.
          </Text>
        ) : null
      }
      ItemSeparatorComponent={() => (
        <View className="bg-card border-border border-x">
          <Separator />
        </View>
      )}
      renderItem={({ item, index }) => (
        <HistoryRow
          item={item}
          isFirst={index === 0}
          isLast={index === (history?.length ?? 0) - 1}
          onDelete={async () => {
            await deleteScan(item.scan.id);
            load();
          }}
        />
      )}
    />
  );
}

function ScanCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto ayat, lihat tajwidnya</CardTitle>
        <CardDescription>
          Arahkan kamera ke halaman mushaf. Ayat akan dikenali dan ditampilkan dengan warna tajwid.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button size="lg" className="flex-1" onPress={() => router.push('/scan')}>
          <Icon as={CameraIcon} className="text-primary-foreground" size={18} />
          <Text>Scan ayat</Text>
        </Button>
      </CardFooter>
    </Card>
  );
}

function OcrNotConfigured() {
  return (
    <Alert icon={TriangleAlertIcon} variant="destructive">
      <AlertTitle>OCR belum dikonfigurasi</AlertTitle>
      <AlertDescription>
        Isi EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu jalankan ulang dev server.
      </AlertDescription>
    </Alert>
  );
}

function HistoryHeader({ hasItems, onClear }: { hasItems: boolean; onClear: () => void }) {
  return (
    <View className="flex-row items-center justify-between pt-2">
      <Text variant="large">Riwayat scan</Text>
      {hasItems && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Text className="text-destructive">Hapus semua</Text>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus semua riwayat?</AlertDialogTitle>
              <AlertDialogDescription>Semua scan tersimpan akan dihapus dan tidak bisa dikembalikan.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Batal</Text>
              </AlertDialogCancel>
              <AlertDialogAction className="bg-destructive" onPress={onClear}>
                <Text>Hapus semua</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </View>
  );
}

function HistoryRow({
  item,
  isFirst,
  isLast,
  onDelete,
}: {
  item: HistoryItem;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
}) {
  const { scan, first, last } = item;
  return (
    <Pressable
      className={cn(
        'bg-card border-border active:bg-accent flex-row items-center gap-2 border-x py-3 pl-4 pr-2',
        isFirst && 'rounded-t-xl border-t',
        isLast && 'rounded-b-xl border-b'
      )}
      onPress={() => router.push({ pathname: '/result', params: { from: scan.from_id, to: scan.to_id } })}>
      <View className="flex-1 gap-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="font-medium">{rangeTitle(first, last)}</Text>
          <Text variant="muted" className="text-xs">
            {formatScanTime(scan.scanned_at)}
          </Text>
        </View>
        <Text numberOfLines={1} className="font-quran text-muted-foreground text-right text-lg leading-9">
          {openingWords(first.text_tajweed)}
        </Text>
      </View>
      <Button variant="ghost" size="icon" onPress={onDelete} accessibilityLabel="Hapus dari riwayat">
        <Icon as={Trash2Icon} className="text-muted-foreground" size={18} />
      </Button>
    </Pressable>
  );
}

/** Dev-only: test verse identification on pasted text without a camera or OCR backend. */
function MatchTester({ onMatched }: { onMatched: () => void }) {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [notFound, setNotFound] = useState(false);

  async function match() {
    const range = await identifyVerses(db, text);
    setNotFound(!range);
    if (!range) return;
    await recordScan(range.fromId, range.toId);
    onMatched();
    router.push({ pathname: '/result', params: { from: range.fromId, to: range.toId } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uji pencocokan (dev)</CardTitle>
        <CardDescription>Tempel teks Arab hasil OCR untuk menguji identifikasi ayat.</CardDescription>
      </CardHeader>
      <CardContent className="gap-2">
        <Textarea
          value={text}
          onChangeText={(value) => {
            setText(value);
            setNotFound(false);
          }}
          placeholder="الحمد لله رب العالمين…"
          className="text-right"
        />
        {notFound && <Text variant="muted">Ayat tidak ditemukan.</Text>}
      </CardContent>
      <CardFooter>
        <View className="flex-1">
          <Button variant="secondary" disabled={!text.trim()} onPress={match}>
            <Icon as={SearchIcon} size={16} />
            <Text>Cocokkan</Text>
          </Button>
        </View>
      </CardFooter>
    </Card>
  );
}

const OPENING_WORDS = 6;

function openingWords(tajweedMarkup: string): string {
  const words = tajweedMarkup
    .replace(/<span class=end>.*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .split(/\s+/);
  return words.slice(0, OPENING_WORDS).join(' ') + (words.length > OPENING_WORDS ? ' …' : '');
}

function formatScanTime(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return `Hari ini, ${time}`;
  if (timestamp >= startOfToday - 24 * 60 * 60 * 1000) return `Kemarin, ${time}`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}
