import { useColorScheme } from 'nativewind';
import { Text as RNText } from 'react-native';

import { Text } from '@/components/ui/text';
import { parseTajweed, TAJWEED_RULES } from '@/lib/quran/tajweed';
import { cn } from '@/lib/utils';

type Props = { markup: string; className?: string };

/** One verse of tajweed markup, rendered right-to-left with each rule in its color. */
export function TajweedText({ markup, className }: Props) {
  const { colorScheme } = useColorScheme();
  const shade = colorScheme === 'dark' ? 'dark' : 'light';
  return (
    <Text className={cn('font-quran text-right text-3xl leading-[72px]', className)} style={{ writingDirection: 'rtl' }}>
      {parseTajweed(markup).map((segment, i) => {
        switch (segment.kind) {
          case 'rule':
            return (
              <RNText key={i} style={{ color: TAJWEED_RULES[segment.rule][shade] }}>
                {segment.text}
              </RNText>
            );
          case 'end':
            return (
              <Text key={i} className="text-muted-foreground text-2xl">
                {` ﴿${segment.text}﴾ `}
              </Text>
            );
          default:
            return segment.text;
        }
      })}
    </Text>
  );
}
