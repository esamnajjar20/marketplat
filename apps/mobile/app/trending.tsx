import { ScreenFrame } from '@/components/ui/ScreenFrame';
import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';

export default function TrendingScreen() {
  return (
    <ScreenFrame>
      <DiscoveryFeedScreen trending />
    </ScreenFrame>
  );
}
