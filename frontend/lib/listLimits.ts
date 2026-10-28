/** Home / rail list size — fewer cards on constrained networks (N3). */
export function homeSectionLimit(
  normal = 8,
  saver = 4,
  dataSaverEnabled = false,
): number {
  return dataSaverEnabled ? saver : normal;
}
