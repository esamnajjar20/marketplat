import { SafeAreaView } from 'react-native-safe-area-context';
import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';
import { colors } from '@/theme/tokens';

/** Mobile route for the web's personalized /for-you feed; the feed uses one mixed recommendation request. */
export default function ForYouScreen() {
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}><DiscoveryFeedScreen forYou /></SafeAreaView>;
}
