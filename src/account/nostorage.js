export class StorageApiError extends Error {}

export class StorageClient {
  from() {
    throw new StorageApiError('Supabase Storage is not bundled with the game');
  }
}
