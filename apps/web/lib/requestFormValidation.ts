/** Returns the first invalid required field in the request creation flow. */
export type RequestFormFieldId = 'req-cat' | 'req-title' | 'req-desc';

export function getFirstInvalidRequestField(values: {
  categoryId: string;
  title: string;
  description: string;
}): RequestFormFieldId | null {
  if (!values.categoryId.trim()) return 'req-cat';
  if (values.title.trim().length < 5) return 'req-title';
  if (values.description.trim().length < 10) return 'req-desc';
  return null;
}
