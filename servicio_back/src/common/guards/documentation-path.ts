// Swagger UI/spec are served under /api; every versioned route lives under
// /api/v1. Shared by the global guards so both agree on what is documentation.
export function isDocumentationPath(path: string): boolean {
  return path === '/api' || path === '/api/' || (path.startsWith('/api/') && !path.startsWith('/api/v1'));
}
