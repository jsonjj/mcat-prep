export * from './auth/identity-provider';
export * from './auth/supabase';
export * from './auth/supabase-jwks';
export * from './guest-projection';
export * from './handler';
export * from './http';
export * from './practice-authorization';
export * from './routes';
export * from './session';
export * from './workflow';
// The one content seam (design note D5): every consumer that needs a lesson's
// catalog identity, exact revision, definition hash, or authored bindings
// resolves it here, not from a per-lesson code generator.
export * from './lesson-content-provider';
