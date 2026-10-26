import { SafeAreaView } from 'react-native-safe-area-context';
import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';
import { colors } from '@/theme/tokens';
export default function SuggestionsScreen() { return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}><DiscoveryFeedScreen /></SafeAreaView>; }
