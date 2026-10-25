import { Image } from 'expo-image';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { View, type LayoutRectangle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

/** Crop rectangle in the photo's own pixel coordinates, as `ImageManipulator.crop` expects. */
export type PixelCrop = { originX: number; originY: number; width: number; height: number };

export type CropViewHandle = { getCrop: () => PixelCrop | null };

type Rect = { x: number; y: number; w: number; h: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const MIN_SIZE = 64;
const HANDLE_SIZE = 44;
/** Initial crop inset from the photo's edges, as a fraction of each side. */
const INITIAL_INSET = 0.06;

type Props = {
  uri: string;
  width: number;
  height: number;
  disabled?: boolean;
  ref?: Ref<CropViewHandle>;
};

/** Shows a photo with a draggable crop box: corners resize it, dragging inside moves it. */
export function CropView({ uri, width, height, disabled = false, ref }: Props) {
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const rect = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  // Where the photo sits inside the view when scaled to fit ("contain").
  const frame = layout && fitContain(width, height, layout.width, layout.height);

  useEffect(() => {
    if (!frame) return;
    rect.set({
      x: frame.x + frame.w * INITIAL_INSET,
      y: frame.y + frame.h * INITIAL_INSET,
      w: frame.w * (1 - 2 * INITIAL_INSET),
      h: frame.h * (1 - 2 * INITIAL_INSET),
    });
    // Reset only when the fitted frame changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.x, frame?.y, frame?.w, frame?.h]);

  useImperativeHandle(
    ref,
    () => ({
      getCrop() {
        if (!frame) return null;
        const scale = width / frame.w;
        const r = rect.get();
        const originX = Math.max(0, Math.round((r.x - frame.x) * scale));
        const originY = Math.max(0, Math.round((r.y - frame.y) * scale));
        return {
          originX,
          originY,
          width: Math.min(width - originX, Math.round(r.w * scale)),
          height: Math.min(height - originY, Math.round(r.h * scale)),
        };
      },
    }),
    [frame, rect, width, height]
  );

  return (
    <View className="flex-1" onLayout={(e) => setLayout(e.nativeEvent.layout)}>
      {frame && (
        <>
          <Image
            source={{ uri }}
            style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
          />
          <Shade rect={rect} />
          <CropBox rect={rect} frame={frame} disabled={disabled} />
          {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
            <CornerHandle key={corner} corner={corner} rect={rect} frame={frame} disabled={disabled} />
          ))}
        </>
      )}
    </View>
  );
}

function fitContain(w: number, h: number, boxW: number, boxH: number): Rect {
  const scale = Math.min(boxW / w, boxH / h);
  return { x: (boxW - w * scale) / 2, y: (boxH - h * scale) / 2, w: w * scale, h: h * scale };
}

/** Dims everything outside the crop box. */
function Shade({ rect }: { rect: SharedValue<Rect> }) {
  const top = useAnimatedStyle(() => ({ top: 0, left: 0, right: 0, height: rect.get().y }));
  const bottom = useAnimatedStyle(() => ({ top: rect.get().y + rect.get().h, left: 0, right: 0, bottom: 0 }));
  const left = useAnimatedStyle(() => ({ top: rect.get().y, left: 0, width: rect.get().x, height: rect.get().h }));
  const right = useAnimatedStyle(() => ({
    top: rect.get().y,
    left: rect.get().x + rect.get().w,
    right: 0,
    height: rect.get().h,
  }));
  return (
    <>
      {[top, bottom, left, right].map((style, i) => (
        <Animated.View key={i} pointerEvents="none" className="absolute bg-black/60" style={style} />
      ))}
    </>
  );
}

function CropBox({ rect, frame, disabled }: { rect: SharedValue<Rect>; frame: Rect; disabled: boolean }) {
  const start = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const move = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      start.set(rect.get());
    })
    .onUpdate((e) => {
      const s = start.get();
      rect.set({
        ...s,
        x: clamp(s.x + e.translationX, frame.x, frame.x + frame.w - s.w),
        y: clamp(s.y + e.translationY, frame.y, frame.y + frame.h - s.h),
      });
    });

  const style = useAnimatedStyle(() => ({
    left: rect.get().x,
    top: rect.get().y,
    width: rect.get().w,
    height: rect.get().h,
  }));

  return (
    <GestureDetector gesture={move}>
      <Animated.View className="absolute border-2 border-white" style={style} />
    </GestureDetector>
  );
}

function CornerHandle({
  corner,
  rect,
  frame,
  disabled,
}: {
  corner: Corner;
  rect: SharedValue<Rect>;
  frame: Rect;
  disabled: boolean;
}) {
  const start = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const isLeft = corner === 'tl' || corner === 'bl';
  const isTop = corner === 'tl' || corner === 'tr';

  const resize = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      start.set(rect.get());
    })
    .onUpdate((e) => {
      const s = start.get();
      let { x, y, w, h } = s;
      if (isLeft) {
        x = clamp(s.x + e.translationX, frame.x, s.x + s.w - MIN_SIZE);
        w = s.x + s.w - x;
      } else {
        w = clamp(s.w + e.translationX, MIN_SIZE, frame.x + frame.w - s.x);
      }
      if (isTop) {
        y = clamp(s.y + e.translationY, frame.y, s.y + s.h - MIN_SIZE);
        h = s.y + s.h - y;
      } else {
        h = clamp(s.h + e.translationY, MIN_SIZE, frame.y + frame.h - s.y);
      }
      rect.set({ x, y, w, h });
    });

  const style = useAnimatedStyle(() => ({
    left: (isLeft ? rect.get().x : rect.get().x + rect.get().w) - HANDLE_SIZE / 2,
    top: (isTop ? rect.get().y : rect.get().y + rect.get().h) - HANDLE_SIZE / 2,
  }));

  return (
    <GestureDetector gesture={resize}>
      <Animated.View
        className="absolute items-center justify-center"
        style={[{ width: HANDLE_SIZE, height: HANDLE_SIZE }, style]}>
        <View className="size-5 rounded-full border-2 border-black/30 bg-white" />
      </Animated.View>
    </GestureDetector>
  );
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}
