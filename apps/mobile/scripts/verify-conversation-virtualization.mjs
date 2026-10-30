import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const screen = readFileSync(new URL('../app/messages.tsx', import.meta.url), 'utf8');
const row = readFileSync(new URL('../src/features/messaging/ConversationListItem.tsx', import.meta.url), 'utf8');

assert.match(screen, /import \{ FlatList, Pressable, RefreshControl/, 'the inbox must use a virtualized list');
assert.match(screen, /<FlatList[\s\S]*?data=\{visibleItems\}/, 'the virtualized list must render the filtered conversation data');
assert.match(screen, /keyExtractor=\{keyExtractor\}/, 'each conversation needs a stable key');
assert.match(screen, /onEndReached=\{\(\) => \{ if \(hasMore && !loadingMore\) void loadMore\(\); \}\}/, 'the list should request more pages near the end');
assert.match(screen, /onEndReachedThreshold=\{0\.35\}/, 'pagination should have an explicit threshold');
assert.match(screen, /RefreshControl[\s\S]*?onRefresh=\{onRefresh\}/, 'pull-to-refresh must remain available');
assert.match(screen, /ListHeaderComponent=\{listHeader\}/, 'search and filters must be hosted by the list header');
assert.match(screen, /ListFooterComponent=\{listFooter\}/, 'pagination controls and errors must remain reachable in the list footer');
assert.doesNotMatch(screen, /<ScrollView|visibleItems\.map\(/, 'the inbox must not eagerly render all rows inside a ScrollView');
assert.match(row, /export default memo\(ConversationListItemView\)/, 'conversation rows should be memoized');
assert.match(row, /accessibilityRole="button"/, 'conversation rows must expose button semantics');
assert.match(row, /accessibilityLabel=\{accessibleName\}/, 'conversation rows must expose meaningful accessible labels');

console.log('Conversation virtualization checks passed (FlatList, stable keys, pagination, refresh, memoized accessible rows).');
