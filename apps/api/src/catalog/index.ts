export { CatalogSourceError, fetchMuscleFile, fetchMuscleIndex } from './client';
export type { CatalogClientOptions } from './client';
export {
  findCatalogExercise,
  listBodyPartSummaries,
  listExercisesByBodyPart,
  searchCatalogExercises,
} from './repository';
export type { CatalogPageQuery, CatalogSearchQuery } from './repository';
export {
  buildSearchTerms,
  MAX_SEARCH_TERMS,
  planCatalogSearch,
  singularizeSearchTerm,
} from './search-query';
export type { SearchTerm, SearchVariant } from './search-query';
export { buildCatalogRows, normalizeSearchText } from './snapshot';
export { CATALOG_BASE_URL, CATALOG_VERSION } from './source';
export {
  readCatalogSyncStatus,
  recordCatalogSyncFailure,
  runCatalogSyncStep,
  SYNC_MUSCLE_ORDER,
} from './sync';
export type { CatalogSyncOptions } from './sync';
