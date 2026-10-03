import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import TreasureHuntFlow from './treasure-hunt-flow';

const COLORS = {
  ink: '#071813',
  inkSoft: '#0D251E',
  panel: '#102E25',
  panelLight: '#173A30',
  cream: '#F6F1E6',
  muted: '#B7C7BF',
  line: 'rgba(246, 241, 230, 0.14)',
  lime: '#CBFF62',
  mint: '#75E6BD',
  coral: '#FF8C68',
  gold: '#F3C76B',
};

const bodyFont = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  web: 'Avenir Next, Trebuchet MS, sans-serif',
});

const displayFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, Times New Roman, serif',
});

type FindChipProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  tone: 'lime' | 'mint' | 'gold';
  style?: object;
};

function FindChip({ icon, label, value, tone, style }: FindChipProps) {
  const toneColor = tone === 'lime' ? COLORS.lime : tone === 'mint' ? COLORS.mint : COLORS.gold;

  return (
    <View style={[styles.findChip, style]}>
      <View style={[styles.findIcon, { backgroundColor: `${toneColor}22` }]}>
        <Ionicons name={icon} size={17} color={toneColor} />
      </View>
      <View style={styles.findCopy}>
        <Text style={styles.findLabel}>{label}</Text>
        <Text style={[styles.findValue, { color: toneColor }]}>{value}</Text>
      </View>
    </View>
  );
}

function Step({ number, title, copy, last = false }: { number: string; title: string; copy: string; last?: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{number}</Text>
        </View>
        {!last ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{copy}</Text>
      </View>
    </View>
  );
}

export default function TreasureHuntScreen() {
  const { width } = useWindowDimensions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;

  const compact = width < 650;
  const tiny = width < 380;

  useEffect(() => {
    Animated.stagger(90, [
      Animated.timing(reveal, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLine, {
            toValue: 1,
            duration: 2300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scanLine, {
            toValue: 0,
            duration: 2300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ),
    ]).start();
  }, [pulse, reveal, scanLine]);

  if (scannerOpen) {
    return <TreasureHuntFlow />;
  }

  const heroTranslate = reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const beamTranslate = scanLine.interpolate({ inputRange: [0, 1], outputRange: [-84, 118] });

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.atmosphere}>
        <Animated.View style={[styles.glow, styles.glowLime, { transform: [{ scale: glowScale }] }]} />
        <View style={[styles.glow, styles.glowMint]} />
        <View style={styles.noiseGrid} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.cream} />
            </Pressable>

            <View style={styles.brandLockup}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>V</Text>
              </View>
              <View>
                <Text style={styles.brandName}>VALUEVISION</Text>
                <Text style={styles.brandMode}>TREASURE HUNT</Text>
              </View>
            </View>

            <View style={styles.creditPill}>
              <View style={styles.creditDot} />
              <Text style={styles.creditText}>3 scans</Text>
            </View>
          </View>

          <Animated.View
            style={[
              styles.hero,
              compact && styles.heroCompact,
              { opacity: reveal, transform: [{ translateY: heroTranslate }] },
            ]}
          >
            <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowLine} />
                <Text style={styles.eyebrow}>ROOM-TO-RESALE DISCOVERY</Text>
              </View>

              <Text style={[styles.heroTitle, compact && styles.heroTitleCompact, tiny && styles.heroTitleTiny]}>
                Find the value{compact ? '\n' : ' '}hiding in{compact ? '\n' : ' '}plain sight.
              </Text>
              <Text style={[styles.heroBody, compact && styles.heroBodyCompact]}>
                Photograph a room, shelf or collection. ValueVision builds a ranked shortlist of the objects most worth a closer look.
              </Text>

              <View style={styles.promiseRow}>
                <View style={styles.promiseItem}>
                  <Ionicons name="sparkles" size={16} color={COLORS.lime} />
                  <Text style={styles.promiseText}>Ranks visible finds</Text>
                </View>
                <View style={styles.promiseItem}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.mint} />
                  <Text style={styles.promiseText}>Shows confidence</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start a treasure hunt"
                onPress={() => setScannerOpen(true)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <View style={styles.primaryButtonIcon}>
                  <Ionicons name="scan" size={21} color={COLORS.ink} />
                </View>
                <View style={styles.primaryButtonCopy}>
                  <Text style={styles.primaryButtonTitle}>Start a smart scan</Text>
                  <Text style={styles.primaryButtonMeta}>Camera or existing photos</Text>
                </View>
                <View style={styles.primaryButtonArrow}>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.ink} />
                </View>
              </Pressable>

              <Text style={styles.ctaNote}>Start wide. Add close-ups only when the app asks.</Text>
            </View>

            <View style={[styles.scanStage, compact && styles.scanStageCompact]}>
              <View style={styles.scanStageHeader}>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>SMART ROOM SCAN</Text>
                </View>
                <View style={styles.focusPill}>
                  <Ionicons name="aperture" size={14} color={COLORS.muted} />
                  <Text style={styles.focusText}>Accuracy first</Text>
                </View>
              </View>

              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <View style={styles.roomShapeOne} />
                <View style={styles.roomShapeTwo} />
                <View style={styles.roomShapeThree} />
                <Animated.View style={[styles.scanBeam, { transform: [{ translateY: beamTranslate }] }]} />
                <View style={styles.roomCaption}>
                  <Ionicons name="eye-outline" size={15} color={COLORS.cream} />
                  <Text style={styles.roomCaptionText}>Looking for resale signals</Text>
                </View>
              </View>

              <View style={styles.findStack}>
                <FindChip icon="camera-outline" label="Film camera" value="£110–£160" tone="lime" />
                <FindChip icon="bulb-outline" label="Vintage lamp" value="£45–£70" tone="mint" style={styles.findChipOffset} />
                <FindChip icon="cube-outline" label="Boxed set" value="Needs close-up" tone="gold" />
              </View>

              <View style={styles.rankFooter}>
                <Text style={styles.rankFooterLabel}>EXAMPLE RANKED SHORTLIST</Text>
                <Text style={styles.rankFooterMeta}>Value ranges shown only when supported</Text>
              </View>
            </View>
          </Animated.View>

          <View style={styles.sectionRule} />

          <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
            <View style={[styles.stepsPanel, compact && styles.fullWidthPanel]}>
              <Text style={styles.sectionKicker}>A BETTER WAY TO SCAN</Text>
              <Text style={styles.sectionTitle}>One guided hunt. No guesswork.</Text>
              <View style={styles.stepsList}>
                <Step number="01" title="Show us the space" copy="Take one clear wide photo so we can map the visible objects." />
                <Step number="02" title="See what stands out" copy="We rank promising finds instead of inventing a price for everything." />
                <Step number="03" title="Confirm the best ones" copy="Add a label or condition close-up to improve the final valuation." last />
              </View>
            </View>

            <View style={[styles.trustPanel, compact && styles.fullWidthPanel]}>
              <View style={styles.trustIconWrap}>
                <Ionicons name="shield-checkmark" size={25} color={COLORS.ink} />
              </View>
              <Text style={styles.trustKicker}>HONEST BY DESIGN</Text>
              <Text style={styles.trustTitle}>Confidence you can understand.</Text>
              <Text style={styles.trustBody}>
                A room photo creates a shortlist, not a promise. When details are unclear, we ask for another photo instead of presenting a made-up price.
              </Text>
              <View style={styles.trustDivider} />
              <View style={styles.trustStatRow}>
                <View style={styles.trustStat}>
                  <Text style={styles.trustStatValue}>High</Text>
                  <Text style={styles.trustStatLabel}>identity confidence</Text>
                </View>
                <View style={styles.trustStatDivider} />
                <View style={styles.trustStat}>
                  <Text style={styles.trustStatValue}>Live</Text>
                  <Text style={styles.trustStatLabel}>market evidence</Text>
                </View>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begin treasure hunt"
            onPress={() => setScannerOpen(true)}
            style={({ pressed }) => [styles.bottomCta, pressed && styles.buttonPressed]}
          >
            <View>
              <Text style={styles.bottomCtaKicker}>READY WHEN YOU ARE</Text>
              <Text style={styles.bottomCtaTitle}>Turn this room into a shortlist</Text>
            </View>
            <View style={styles.bottomCtaButton}>
              <Ionicons name="camera" size={20} color={COLORS.ink} />
              <Text style={styles.bottomCtaButtonText}>Begin</Text>
            </View>
          </Pressable>

          <Text style={styles.privacyText}>
            Your photos are used only to create your results and saved scan history.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.ink,
  },
  safeArea: {
    flex: 1,
  },
  atmosphere: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.18,
  },
  glowLime: {
    width: 330,
    height: 330,
    backgroundColor: COLORS.lime,
    top: -210,
    right: -120,
  },
  glowMint: {
    width: 300,
    height: 300,
    backgroundColor: COLORS.mint,
    left: -220,
    top: 420,
    opacity: 0.1,
  },
  noiseGrid: {
    position: 'absolute',
    left: '48%',
    top: -80,
    width: 1,
    height: 720,
    backgroundColor: 'rgba(255,255,255,0.035)',
    transform: [{ rotate: '24deg' }],
  },
  scrollContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingHorizontal: 34,
    paddingBottom: 42,
  },
  scrollContentCompact: {
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  brandLockup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-5deg' }],
  },
  brandMarkText: {
    color: COLORS.ink,
    fontFamily: displayFont,
    fontWeight: '900',
    fontSize: 19,
  },
  brandName: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  brandMode: {
    color: COLORS.mint,
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.1,
    marginTop: 2,
  },
  creditPill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  creditDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.lime,
  },
  creditText: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '700',
  },
  hero: {
    flexDirection: 'row',
    gap: 52,
    paddingTop: 56,
    paddingBottom: 54,
    alignItems: 'center',
  },
  heroCompact: {
    flexDirection: 'column',
    gap: 34,
    paddingTop: 36,
    paddingBottom: 38,
    alignItems: 'stretch',
  },
  heroCopy: {
    flex: 1.06,
  },
  heroCopyCompact: {
    width: '100%',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 17,
  },
  eyebrowLine: {
    width: 29,
    height: 2,
    backgroundColor: COLORS.coral,
  },
  eyebrow: {
    color: COLORS.coral,
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.9,
  },
  heroTitle: {
    color: COLORS.cream,
    fontFamily: displayFont,
    fontSize: 58,
    lineHeight: 62,
    letterSpacing: -2.6,
    maxWidth: 560,
  },
  heroTitleCompact: {
    fontSize: 45,
    lineHeight: 48,
    letterSpacing: -2.1,
  },
  heroTitleTiny: {
    fontSize: 39,
    lineHeight: 43,
  },
  heroBody: {
    marginTop: 20,
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 535,
  },
  heroBodyCompact: {
    fontSize: 15,
    lineHeight: 23,
  },
  promiseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 22,
    marginBottom: 27,
  },
  promiseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  promiseText: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: COLORS.lime,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: COLORS.lime,
    shadowOpacity: 0.19,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  primaryButtonIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(7,24,19,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonCopy: {
    flex: 1,
    paddingHorizontal: 13,
  },
  primaryButtonTitle: {
    color: COLORS.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
  },
  primaryButtonMeta: {
    color: 'rgba(7,24,19,0.67)',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  primaryButtonArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(7,24,19,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaNote: {
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
  },
  scanStage: {
    flex: 0.94,
    minHeight: 490,
    borderRadius: 30,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: 'rgba(203,255,98,0.18)',
    padding: 17,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
    transform: [{ rotate: '1deg' }],
  },
  scanStageCompact: {
    width: '100%',
    minHeight: 475,
    transform: [{ rotate: '0deg' }],
  },
  scanStageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 13,
  },
  livePill: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(203,255,98,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
  },
  liveText: {
    color: COLORS.lime,
    fontFamily: bodyFont,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  focusText: {
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '600',
  },
  viewfinder: {
    height: 214,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: '#19372F',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  corner: {
    position: 'absolute',
    zIndex: 4,
    width: 24,
    height: 24,
    borderColor: COLORS.lime,
  },
  cornerTL: {
    left: 14,
    top: 14,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    right: 14,
    top: 14,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    left: 14,
    bottom: 14,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    right: 14,
    bottom: 14,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 8,
  },
  roomShapeOne: {
    position: 'absolute',
    left: 28,
    bottom: 27,
    width: 92,
    height: 106,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    backgroundColor: '#35584D',
    transform: [{ rotate: '-4deg' }],
  },
  roomShapeTwo: {
    position: 'absolute',
    right: 32,
    bottom: 29,
    width: 104,
    height: 72,
    borderRadius: 15,
    backgroundColor: '#294A40',
    transform: [{ rotate: '3deg' }],
  },
  roomShapeThree: {
    position: 'absolute',
    left: '42%',
    top: 42,
    width: 52,
    height: 91,
    borderRadius: 26,
    backgroundColor: '#41685C',
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 91,
    height: 2,
    backgroundColor: COLORS.lime,
    shadowColor: COLORS.lime,
    shadowOpacity: 0.8,
    shadowRadius: 9,
  },
  roomCaption: {
    position: 'absolute',
    left: 15,
    bottom: 14,
    borderRadius: 13,
    paddingHorizontal: 10,
    height: 27,
    backgroundColor: 'rgba(7,24,19,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomCaptionText: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '600',
  },
  findStack: {
    marginTop: -4,
    paddingHorizontal: 10,
    gap: 7,
  },
  findChip: {
    minHeight: 55,
    borderRadius: 15,
    backgroundColor: '#F7F2E8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  findChipOffset: {
    marginLeft: 17,
    marginRight: -2,
  },
  findIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 10,
    gap: 8,
  },
  findLabel: {
    color: COLORS.ink,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '800',
  },
  findValue: {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
  },
  rankFooter: {
    marginTop: 13,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rankFooterLabel: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  rankFooterMeta: {
    flex: 1,
    textAlign: 'right',
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 8,
  },
  sectionRule: {
    height: 1,
    backgroundColor: COLORS.line,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 24,
    paddingVertical: 45,
  },
  detailGridCompact: {
    flexDirection: 'column',
    gap: 18,
    paddingVertical: 32,
  },
  stepsPanel: {
    flex: 1.08,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 25,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  fullWidthPanel: {
    width: '100%',
  },
  sectionKicker: {
    color: COLORS.coral,
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  sectionTitle: {
    color: COLORS.cream,
    fontFamily: displayFont,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 9,
    marginBottom: 25,
    letterSpacing: -0.8,
  },
  stepsList: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 83,
  },
  stepRail: {
    width: 43,
    alignItems: 'center',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.panelLight,
    borderWidth: 1,
    borderColor: 'rgba(117,230,189,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: COLORS.mint,
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '900',
  },
  stepLine: {
    flex: 1,
    width: 1,
    backgroundColor: COLORS.line,
    marginVertical: 4,
  },
  stepCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 21,
  },
  stepTitle: {
    color: COLORS.cream,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  stepBody: {
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  trustPanel: {
    flex: 0.92,
    borderRadius: 25,
    padding: 25,
    backgroundColor: COLORS.cream,
  },
  trustIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  trustKicker: {
    color: '#537065',
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  trustTitle: {
    color: COLORS.ink,
    fontFamily: displayFont,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.7,
    marginTop: 8,
  },
  trustBody: {
    color: '#486058',
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 13,
  },
  trustDivider: {
    height: 1,
    backgroundColor: 'rgba(7,24,19,0.12)',
    marginVertical: 22,
  },
  trustStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustStat: {
    flex: 1,
  },
  trustStatValue: {
    color: COLORS.ink,
    fontFamily: displayFont,
    fontSize: 23,
    fontWeight: '700',
  },
  trustStatLabel: {
    color: '#657A72',
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },
  trustStatDivider: {
    width: 1,
    height: 38,
    backgroundColor: 'rgba(7,24,19,0.12)',
    marginHorizontal: 18,
  },
  bottomCta: {
    minHeight: 96,
    borderRadius: 26,
    backgroundColor: COLORS.coral,
    paddingHorizontal: 24,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  bottomCtaKicker: {
    color: 'rgba(7,24,19,0.62)',
    fontFamily: bodyFont,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  bottomCtaTitle: {
    color: COLORS.ink,
    fontFamily: displayFont,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  bottomCtaButton: {
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.cream,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  bottomCtaButtonText: {
    color: COLORS.ink,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  privacyText: {
    color: COLORS.muted,
    fontFamily: bodyFont,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 14,
  },
});
