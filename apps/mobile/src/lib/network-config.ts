/**
 * Configure native connectivity checks against the same API origin used by apiRequest.
 * When the API origin is missing/invalid, use native reachability instead of probing a
 * different hard-coded server and incorrectly reporting the configured API as available.
 * Imported before the app tree is rendered.
 */
import NetInfo from '@react-native-community/netinfo';
import { getApiReachabilityUrl } from '@/lib/api-base-url';

const reachabilityUrl = getApiReachabilityUrl();

if (reachabilityUrl) {
  NetInfo.configure({
    reachabilityUrl,
    reachabilityTest: async (response) => response.status === 200,
    reachabilityShortTimeout: 10 * 1000,
    reachabilityLongTimeout: 60 * 1000,
    reachabilityRequestTimeout: 20 * 1000,
    useNativeReachability: false,
  });
} else {
  NetInfo.configure({
    useNativeReachability: true,
  });
}
