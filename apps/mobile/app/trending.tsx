import { useAppTheme } from '@/theme/ThemeProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';

export default function TrendingScreen() {
  const { colors } = useAppTheme();
 return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}><DiscoveryFeedScreen trending /></SafeAreaView>; }
