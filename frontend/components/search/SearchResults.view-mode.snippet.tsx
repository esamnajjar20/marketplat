/**
 * دمج في SearchResults.tsx — ليس ملفًا مستقلاً للتشغيل.
 *
 * 1) imports:
 *    import { useState, useMemo } from 'react'; // useState إن لم يكن
 *    import { SearchViewToggle, type SearchViewMode } from '@/components/search/SearchViewToggle';
 *    import { SearchResultsMap } from '@/components/map/SearchResultsMap';
 *
 * 2) داخل المكوّن بعد قراءة lat/lng من URL:
 *    const [viewMode, setViewMode] = useState<SearchViewMode>('list');
 *    const userLocation =
 *      lat !== undefined && lng !== undefined ? { lat, lng } : null;
 *
 * 3) في شريط الأدوات بجانب العدد / SaveSearchButton:
 *    <SearchViewToggle value={viewMode} onChange={setViewMode} />
 *
 * 4) بدل عرض الشبكة مباشرة، غلّف:
 *
 *    {viewMode === 'map' ? (
 *      <SearchResultsMap
 *        points={mapPoints}
 *        userLocation={userLocation}
 *      />
 *    ) : (
 *      <div className="grid ...">
 *        {items.map(... UnifiedResultCard)}
 *      </div>
 *    )}
 *
 * 5) mapPoints من items (بعد أن يضيف الـ backend latitude/longitude):
 *
 *    const mapPoints = useMemo(
 *      () =>
 *        items
 *          .filter((r) => r.latitude != null && r.longitude != null)
 *          .map((r) => ({
 *            id: `${r.type}-${r.id}`,
 *            title: r.title,
 *            lat: Number(r.latitude),
 *            lng: Number(r.longitude),
 *            href: r.url,
 *            subtitle: r.city ?? undefined,
 *          })),
 *      [items]
 *    );
 */

export {};
