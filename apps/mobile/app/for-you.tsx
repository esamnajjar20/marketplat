import DiscoveryFeedScreen from '@/features/discovery/DiscoveryFeedScreen';

/** Mobile route for the web's personalized /for-you feed; the feed uses one mixed recommendation request. */
export default function ForYouScreen() {
  return <DiscoveryFeedScreen forYou />;
}
