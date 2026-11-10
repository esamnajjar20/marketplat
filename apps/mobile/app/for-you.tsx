import { useAppTheme } from '@/theme/ThemeProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';


/** Mobile route for the web's personalized /for-you feed; the feed uses one mixed recommendation request. */
export default function ForYouScreen() {
  const { colors } = useAppTheme();

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}><DiscoveryFeedScreen forYou /></SafeAreaView>;
}
