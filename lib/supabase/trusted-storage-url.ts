export function isTrustedSignedStorageUrl(
  value: string,
  supabaseUrl: string,
  bucket: string,
) {
  try {
    const candidate = new URL(value);
    const project = new URL(supabaseUrl);
    const expectedPrefix = `/storage/v1/object/sign/${encodeURIComponent(bucket)}/`;

    return (
      candidate.protocol === "https:" &&
      candidate.origin === project.origin &&
      !candidate.username &&
      !candidate.password &&
      candidate.pathname.startsWith(expectedPrefix) &&
      candidate.searchParams.has("token")
    );
  } catch {
    return false;
  }
}
