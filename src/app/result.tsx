import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CameraIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { TajweedText } from '@/components/tajweed-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { getVerses, rangeTitle, type Verse } from '@/lib/quran/db';
import { rulesUsed, TAJWEED_RULES } from '@/lib/quran/tajweed';

export default function ResultScreen() {
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const db = useSQLiteContext();
  const [verses, setVerses] = useState<Verse[] | null>(null);

  useEffect(() => {
    getVerses(db, Number(from), Number(to)).then(setVerses);
  }, [db, from, to]);

  if (!verses) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: rangeTitle(verses[0], verses[verses.length - 1]) }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 p-4">
        <Card>
          <CardContent className="gap-2 pt-6">
            {verses.map((verse, i) => (
              <Fragment key={verse.id}>
                {(i === 0 || verse.chapter !== verses[i - 1].chapter) && (
                  <View className="items-center gap-1 py-2">
                    {i > 0 && <Separator className="mb-3" />}
                    <Text className="font-quran text-3xl leading-[56px]">{verse.name_arabic}</Text>
                    <Text variant="muted">
                      {verse.chapter}. {verse.name_simple}
                    </Text>
                  </View>
                )}
                <TajweedText markup={verse.text_tajweed} />
              </Fragment>
            ))}
          </CardContent>
        </Card>

        <TajweedLegend verses={verses} />

        <Button size="lg" onPress={() => router.replace('/scan')}>
          <Icon as={CameraIcon} className="text-primary-foreground" size={18} />
          <Text>Scan lagi</Text>
        </Button>
      </ScrollView>
    </>
  );
}

function TajweedLegend({ verses }: { verses: Verse[] }) {
  const { colorScheme } = useColorScheme();
  const shade = colorScheme === 'dark' ? 'dark' : 'light';
  const rules = rulesUsed(verses.map((v) => v.text_tajweed));
  if (rules.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keterangan warna</CardTitle>
      </CardHeader>
      <CardContent className="flex-row flex-wrap gap-2">
        {rules.map((rule) => (
          <Badge key={rule} variant="outline" className="gap-1.5">
            <View className="size-2.5 rounded-full" style={{ backgroundColor: TAJWEED_RULES[rule][shade] }} />
            <Text>{TAJWEED_RULES[rule].name}</Text>
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}
